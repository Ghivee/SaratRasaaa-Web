import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/stats
 *
 * Public aggregate statistics for the beranda stats dashboard.
 * Returns: total events closed (history), total verified volunteers,
 * total kg of waste collected (mock — from recap text parsing), and
 * count of upcoming events.
 */
export async function GET() {
  try {
    const [closedEvents, verifiedPendaftar, upcomingEvents, allPendaftar] = await Promise.all([
      db.event.count({ where: { status: "closed" } }),
      db.pendaftar.count({ where: { status: "verified" } }),
      db.event.count({ where: { status: "upcoming" } }),
      db.pendaftar.findMany({
        where: { status: "verified" },
        select: { jumlahOrang: true },
      }),
    ]);

    const totalVolunteers = allPendaftar.reduce((sum, p) => sum + p.jumlahOrang, 0);

    // Parse "karung" count from recap text for impact metric.
    const closedWithRecap = await db.event.findMany({
      where: { status: "closed", recap: { not: null } },
      select: { recap: true },
    });
    let totalKarung = 0;
    let totalKantong = 0;
    let totalPohon = 0;
    for (const e of closedWithRecap) {
      const recap = e.recap || "";
      const karungMatch = recap.match(/(\d+)\s*karung/i);
      const kantongMatch = recap.match(/(\d+)\s*kantong/i);
      const pohonMatch = recap.match(/(\d+)\s*(?:bibit|pohon|mangrove)/i);
      if (karungMatch) totalKarung += parseInt(karungMatch[1], 10);
      if (kantongMatch) totalKantong += parseInt(kantongMatch[1], 10);
      if (pohonMatch) totalPohon += parseInt(pohonMatch[1], 10);
    }

    return NextResponse.json({
      stats: {
        totalEvents: closedEvents,
        totalVolunteers,
        totalVerifiedPendaftar: verifiedPendaftar,
        upcomingEvents,
        impact: {
          karungPlastik: totalKarung,
          kantongDarah: totalKantong,
          pohonDitanam: totalPohon,
        },
      },
    });
  } catch (err) {
    console.error("[api/stats]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
