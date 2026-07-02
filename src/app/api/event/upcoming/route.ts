import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/event/upcoming
 *
 * Returns all events with status="upcoming", ordered by tanggal ASC.
 * Used for the "Aksi Mendatang" section on the beranda — gives the
 * community a preview of what's coming after the current active event.
 *
 * Public endpoint, no auth required.
 */
export async function GET() {
  try {
    const events = await db.event.findMany({
      where: { status: "upcoming" },
      orderBy: { tanggal: "asc" },
      select: {
        id: true,
        judul: true,
        deskripsi: true,
        tanggal: true,
        waktuMulai: true,
        lokasi: true,
        linkGmaps: true,
        fotoCover: true,
        harga: true,
        kuotaMax: true,
      },
    });

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[api/event/upcoming]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
