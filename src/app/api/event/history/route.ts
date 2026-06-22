import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/event/history
 * Returns all Events with status="closed", ordered by tanggal DESC.
 *
 * Response 200:
 *   { events: [{ id, judul, deskripsi, tanggal, lokasi, fotoCover,
 *                fotoDok: string[], recap }] }
 *
 * `fotoDok` is stored as a comma-separated string in the DB and parsed
 * into an array here for the client's convenience.
 */
export async function GET(_req: NextRequest) {
  try {
    const events = await db.event.findMany({
      where: { status: "closed" },
      orderBy: { tanggal: "desc" },
    });

    const mapped = events.map((e) => ({
      id: e.id,
      judul: e.judul,
      deskripsi: e.deskripsi,
      tanggal: e.tanggal,
      lokasi: e.lokasi,
      fotoCover: e.fotoCover,
      fotoDok: e.fotoDok
        ? e.fotoDok
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      recap: e.recap,
    }));

    return NextResponse.json({ events: mapped }, { status: 200 });
  } catch (err) {
    console.error("[api/event/history]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
