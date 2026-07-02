import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/event/active
 * Returns the single Event with status="active" plus computed quota usage.
 *
 * Response 200:
 *   { event: { id, judul, deskripsi, tanggal, lokasi, fotoCover, harga,
 *              kuotaMax, terpakai, sisaKuota } }
 *   — or —
 *   { event: null }
 *
 * `terpakai` counts all pendaftar on the active event whose status is
 * pending_payment or verified (i.e. committed slots).
 */
export async function GET(_req: NextRequest) {
  try {
    const event = await db.event.findFirst({
      where: { status: "active" },
    });

    if (!event) {
      return NextResponse.json({ event: null }, { status: 200 });
    }

    const agg = await db.pendaftar.aggregate({
      _sum: { jumlahOrang: true },
      where: {
        idEvent: event.id,
        status: { in: ["pending_payment", "verified"] },
      },
    });
    const terpakai = agg._sum.jumlahOrang ?? 0;
    const sisaKuota = Math.max(0, event.kuotaMax - terpakai);

    return NextResponse.json(
      {
        event: {
          id: event.id,
          judul: event.judul,
          deskripsi: event.deskripsi,
          tanggal: event.tanggal,
          lokasi: event.lokasi,
          linkGmaps: event.linkGmaps,
          waktuMulai: event.waktuMulai,
          fotoCover: event.fotoCover,
          harga: event.harga,
          kuotaMax: event.kuotaMax,
          terpakai,
          sisaKuota,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/event/active]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
