/**
 * Admin Event Recap API — Saratrasaa (Task 8-D)
 *
 * Returns a print-friendly recap payload for one closed event:
 *   - Event details (judul, tanggal, lokasi, recap, fotoCover, fotoDok)
 *   - Stats computed from the pendaftar list:
 *       totalPendaftar, totalVerified, totalRejected,
 *       totalOrang (sum of jumlahOrang for verified pendaftar),
 *       totalPendapatan (sum of totalBayar for verified pendaftar).
 *   - The pendaftar list itself (kode, nama, jumlah, status, totalBayar).
 *
 *   GET /api/admin/event/recap?id=<eventId>
 *
 * Security fix #2: every request must carry `X-Admin-Token`.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/** Unauthorised response — same wording everywhere for consistency. */
function unauth() {
  return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
}

/** Read & verify the X-Admin-Token header. Returns null if valid. */
function requireAdmin(req: NextRequest): NextResponse | null {
  const tokenHeader = req.headers.get("x-admin-token");
  if (!verifyAdminToken(tokenHeader)) return unauth();
  return null;
}

/** Parse the comma-separated fotoDok field into a clean array of paths. */
function parseFotoDok(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* GET — recap payload for a closed event                                      */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const fail = requireAdmin(req);
  if (fail) return fail;

  try {
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json(
        { error: "Parameter `id` wajib diisi." },
        { status: 400 },
      );
    }

    const event = await db.event.findUnique({ where: { id } });
    if (!event) {
      return NextResponse.json(
        { error: "Event tidak ditemukan." },
        { status: 404 },
      );
    }

    // Fetch all pendaftar for this event (any status) so the recap can show
    // the full registration picture — verified, rejected, and pending alike.
    const pendaftar = await db.pendaftar.findMany({
      where: { idEvent: id },
      orderBy: [{ createdAt: "asc" }],
      select: {
        kodeReferensi: true,
        nama: true,
        jumlahOrang: true,
        totalBayar: true,
        status: true,
        createdAt: true,
        verifiedAt: true,
      },
    });

    // ----- compute stats from the pendaftar list -----
    let totalVerified = 0;
    let totalRejected = 0;
    let totalOrang = 0;
    let totalPendapatan = 0;
    for (const p of pendaftar) {
      if (p.status === "verified") {
        totalVerified += 1;
        totalOrang += p.jumlahOrang;
        totalPendapatan += p.totalBayar;
      } else if (p.status === "rejected") {
        totalRejected += 1;
      }
    }

    return NextResponse.json({
      event: {
        id: event.id,
        judul: event.judul,
        tanggal: event.tanggal,
        lokasi: event.lokasi,
        recap: event.recap ?? "",
        fotoCover: event.fotoCover ?? "",
        fotoDok: parseFotoDok(event.fotoDok),
      },
      stats: {
        totalPendaftar: pendaftar.length,
        totalVerified,
        totalRejected,
        totalOrang,
        totalPendapatan,
      },
      pendaftar: pendaftar.map((p) => ({
        kodeReferensi: p.kodeReferensi,
        nama: p.nama,
        jumlahOrang: p.jumlahOrang,
        status: p.status,
        totalBayar: p.totalBayar,
        createdAt: p.createdAt.toISOString(),
        verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error("[api/admin/event/recap GET]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
