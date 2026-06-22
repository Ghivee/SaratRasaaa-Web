import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/event-performance
 *
 * Returns per-event performance metrics for the admin dashboard:
 *   - total pendaftar
 *   - verified count
 *   - revenue (sum of totalBayar for verified pendaftar of that event)
 *   - quota fill rate (verified jumlahOrang / kuotaMax * 100)
 *
 * Sorted by revenue descending, limited to the top 5 events. Events with
 * zero pendaftar are still included so the dashboard can show "kosong"
 * entries if needed — but here we only include events that have at least
 * one pendaftar (otherwise the table would be noisy with empty rows).
 *
 * Response shape:
 *   {
 *     events: [{
 *       id, judul, tanggal, totalPendaftar, verifiedCount,
 *       revenue, kuotaMax, terpakai, fillRate
 *     }]
 *   }
 *
 * Requires X-Admin-Token header.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    // Fetch all events with their pendaftar (lightweight select).
    // Sorting + slicing is done in JS so we can rank by computed revenue.
    const events = await db.event.findMany({
      select: {
        id: true,
        judul: true,
        tanggal: true,
        kuotaMax: true,
        pendaftar: {
          select: {
            status: true,
            jumlahOrang: true,
            totalBayar: true,
          },
        },
      },
    });

    const rows = events
      .map((ev) => {
        const totalPendaftar = ev.pendaftar.length;
        const verifiedList = ev.pendaftar.filter((p) => p.status === "verified");
        const verifiedCount = verifiedList.length;
        const revenue = verifiedList.reduce((sum, p) => sum + p.totalBayar, 0);
        const terpakai = verifiedList.reduce((sum, p) => sum + p.jumlahOrang, 0);
        const fillRate =
          ev.kuotaMax > 0
            ? Math.min(100, Math.round((terpakai / ev.kuotaMax) * 1000) / 10)
            : 0;
        return {
          id: ev.id,
          judul: ev.judul,
          tanggal: ev.tanggal,
          totalPendaftar,
          verifiedCount,
          revenue,
          kuotaMax: ev.kuotaMax,
          terpakai,
          fillRate,
        };
      })
      // Skip events with zero pendaftar — they would crowd the leaderboard
      // with empty rows. The admin already sees total event count in the
      // stat cards, so this filter is just for the performance table.
      .filter((r) => r.totalPendaftar > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return NextResponse.json({ events: rows });
  } catch (err) {
    console.error("[api/admin/event-performance]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
