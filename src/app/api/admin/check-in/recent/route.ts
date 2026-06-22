import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/check-in/recent
 *   headers: X-Admin-Token: <token>
 *
 * Returns the last 20 check-ins (newest first) with pendaftar + event info.
 * Used by the CheckInDialog to show a live "recent check-ins" list.
 *
 * Response:
 *   200 — { checkIns: Array<{ id, kodeReferensi, nama, judul, checkedInAt, status, jumlahOrang }> }
 *   401 — { error: "Token admin tidak valid." }
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json(
      { error: "Token admin tidak valid." },
      { status: 401 },
    );
  }

  try {
    const rows = await db.checkIn.findMany({
      orderBy: { checkedInAt: "desc" },
      take: 20,
      select: {
        id: true,
        checkedInAt: true,
        pendaftar: {
          select: {
            kodeReferensi: true,
            nama: true,
            jumlahOrang: true,
            status: true,
          },
        },
        event: {
          select: {
            id: true,
            judul: true,
            tanggal: true,
            lokasi: true,
          },
        },
      },
    });

    const checkIns = rows.map((r) => ({
      id: r.id,
      kodeReferensi: r.pendaftar.kodeReferensi,
      nama: r.pendaftar.nama,
      jumlahOrang: r.pendaftar.jumlahOrang,
      status: r.pendaftar.status,
      judul: r.event.judul,
      idEvent: r.event.id,
      tanggalEvent: r.event.tanggal,
      lokasiEvent: r.event.lokasi,
      checkedInAt: r.checkedInAt.toISOString(),
    }));

    return NextResponse.json({ checkIns });
  } catch (err) {
    console.error("[api/admin/check-in/recent GET]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
