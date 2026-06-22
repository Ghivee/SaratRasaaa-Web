import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/event/detail?id=<eventId>
 *
 * Returns full detail for a single event (any status). Used by the
 * EventDetailModal on the beranda when a user clicks an event card.
 *
 * For closed events, includes the recap and fotoDok gallery.
 *
 * Public endpoint, no auth required.
 */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Parameter id wajib diisi." },
        { status: 400 },
      );
    }

    const event = await db.event.findUnique({
      where: { id },
      select: {
        id: true,
        judul: true,
        deskripsi: true,
        tanggal: true,
        lokasi: true,
        fotoCover: true,
        harga: true,
        kuotaMax: true,
        status: true,
        recap: true,
        fotoDok: true,
        createdAt: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Event tidak ditemukan." },
        { status: 404 },
      );
    }

    // Parse fotoDok (comma-separated) into an array.
    const fotoDok = event.fotoDok
      ? event.fotoDok.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    return NextResponse.json({
      event: {
        ...event,
        fotoDok,
      },
    });
  } catch (err) {
    console.error("[api/event/detail]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
