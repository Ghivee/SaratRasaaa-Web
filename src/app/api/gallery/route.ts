import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/gallery
 *
 * Public endpoint — returns all closed events with their recap + fotoDok
 * for the public gallery view. Each item includes: id, judul, tanggal,
 * lokasi, recap, fotoDok (array), fotoCover.
 *
 * Ordered by tanggal DESC (most recent first).
 */
export async function GET() {
  try {
    const events = await db.event.findMany({
      where: {
        status: "closed",
        recap: { not: null },
      },
      orderBy: { tanggal: "desc" },
      select: {
        id: true,
        judul: true,
        tanggal: true,
        lokasi: true,
        recap: true,
        fotoDok: true,
        fotoCover: true,
      },
    });

    // Parse fotoDok into arrays + filter out events with no recap content.
    const gallery = events
      .map((e) => ({
        ...e,
        fotoDok: e.fotoDok
          ? e.fotoDok.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      }))
      .filter((e) => e.recap || e.fotoDok.length > 0);

    return NextResponse.json({ events: gallery });
  } catch (err) {
    console.error("[api/gallery]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
