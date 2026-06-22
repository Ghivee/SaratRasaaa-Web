/**
 * Admin Event Detail Analytics API — Saratrasaa (Task 9-C)
 *
 * Returns a comprehensive analytics payload for ONE event, used by the
 * EventDetailModal in the admin "Kelola Event" tab.
 *
 *   GET /api/admin/event/detail?id=<eventId>
 *
 * Security fix #2: every request must carry a valid `X-Admin-Token`
 * header (verified via verifyAdminToken). No public access.
 *
 * Response shape:
 *   {
 *     event: { id, judul, deskripsi, tanggal, lokasi, fotoCover, harga,
 *              kuotaMax, status, recap, fotoDok, createdAt },
 *     stats: {
 *       totalPendaftar, verified, pending, rejected,
 *       totalOrang, revenue, fillRate, avgBayar
 *     },
 *     timeline: [
 *       { date: "YYYY-MM-DD", count: 5, cumulative: 5 }, ...
 *     ],
 *     pendaftar: [ ... all pendaftar for this event, oldest first ... ]
 *   }
 *
 * - `revenue` and `totalOrang` only count verified pendaftar (per brief §5
 *    — pending/rejected rows don't count toward attendance or takings).
 * - `fillRate` = (verified jumlahOrang / kuotaMax) * 100, capped at 100,
 *    rounded to 1 decimal. Returns 0 when kuotaMax is 0 (defensive).
 * - `avgBayar` = revenue / verified, rounded down to whole Rupiah. Returns
 *    0 when verified is 0 to avoid NaN.
 * - `timeline` is bucketed by the date portion of `createdAt` (in
 *    Asia/Jakarta). Days with zero new pendaftar are SKIPPED — the chart
 *    is a sparse area chart, not a contiguous calendar. The `cumulative`
 *    field is the running total of registrations across all statuses.
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

/**
 * Format a Date as `YYYY-MM-DD` using the Asia/Jakarta timezone so the
 * timeline buckets line up with the calendar day the volunteer actually
 * saw. Without this, a registration at 23:30 WIB would bucket into the
 * next UTC day and look "early" relative to the volunteer's experience.
 */
function toDateKey(iso: Date | string): string {
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    // toLocaleDateString with en-CA gives YYYY-MM-DD, which is what we want.
    return d.toLocaleDateString("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    // Fallback: slice the ISO string. Less correct across TZs but never throws.
    const s = typeof iso === "string" ? iso : new Date(iso).toISOString();
    return s.slice(0, 10);
  }
}

/* -------------------------------------------------------------------------- */
/* GET — full analytics payload for one event                                  */
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

    // Fetch all pendaftar for this event (any status) — oldest first so the
    // cumulative timeline makes sense and the pendaftar table reads in the
    // order registrations actually came in.
    const rows = await db.pendaftar.findMany({
      where: { idEvent: id },
      orderBy: [{ createdAt: "asc" }],
      select: {
        kodeReferensi: true,
        nama: true,
        kontak: true,
        jumlahOrang: true,
        hargaDasar: true,
        kodeUnik: true,
        totalBayar: true,
        status: true,
        createdAt: true,
        verifiedAt: true,
      },
    });

    // ----- stats -----
    let verified = 0;
    let pending = 0;
    let rejected = 0;
    let totalOrang = 0;
    let revenue = 0;
    for (const p of rows) {
      if (p.status === "verified") {
        verified += 1;
        totalOrang += p.jumlahOrang;
        revenue += p.totalBayar;
      } else if (p.status === "pending_payment") {
        pending += 1;
      } else if (p.status === "rejected") {
        rejected += 1;
      }
    }
    const totalPendaftar = rows.length;
    const fillRate =
      event.kuotaMax > 0
        ? Math.min(100, Math.round((totalOrang / event.kuotaMax) * 1000) / 10)
        : 0;
    const avgBayar = verified > 0 ? Math.round(revenue / verified) : 0;

    // ----- timeline (sparse by-day buckets, oldest first, cumulative) -----
    // Walk the rows once and tally per-day counts. `Map` preserves insertion
    // order, and rows are already ascending by createdAt, so the resulting
    // array is automatically in chronological order.
    const byDay = new Map<string, number>();
    for (const p of rows) {
      const key = toDateKey(p.createdAt);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    let cumulative = 0;
    const timeline = Array.from(byDay.entries()).map(([date, count]) => {
      cumulative += count;
      return { date, count, cumulative };
    });

    return NextResponse.json({
      event: {
        id: event.id,
        judul: event.judul,
        deskripsi: event.deskripsi,
        tanggal: event.tanggal,
        lokasi: event.lokasi,
        fotoCover: event.fotoCover ?? "",
        harga: event.harga,
        kuotaMax: event.kuotaMax,
        status: event.status,
        recap: event.recap ?? "",
        fotoDok: parseFotoDok(event.fotoDok),
        createdAt: event.createdAt.toISOString(),
      },
      stats: {
        totalPendaftar,
        verified,
        pending,
        rejected,
        totalOrang,
        revenue,
        fillRate,
        avgBayar,
      },
      timeline,
      pendaftar: rows.map((p) => ({
        kodeReferensi: p.kodeReferensi,
        nama: p.nama,
        kontak: p.kontak,
        jumlahOrang: p.jumlahOrang,
        hargaDasar: p.hargaDasar,
        kodeUnik: p.kodeUnik,
        totalBayar: p.totalBayar,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error("[api/admin/event/detail GET]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
