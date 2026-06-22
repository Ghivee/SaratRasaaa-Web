import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/stats
 *
 * Admin dashboard statistics:
 *  - total events by status
 *  - total pendaftar by status
 *  - revenue (sum of totalBayar for verified)
 *  - recent pendaftar (last 10)
 *  - totalUniqueRelawan: distinct kontak count across all pendaftar
 *  - avgPendaftarPerEvent: total pendaftar / total events
 *  - conversionRate: verified / total pendaftar * 100 (1 decimal)
 *
 * Requires X-Admin-Token header.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const [
      activeCount,
      upcomingCount,
      closedCount,
      totalEventCount,
      pendingCount,
      verifiedCount,
      rejectedCount,
      verifiedPendaftar,
      uniqueKontakRows,
      recentPendaftar,
    ] = await Promise.all([
      db.event.count({ where: { status: "active" } }),
      db.event.count({ where: { status: "upcoming" } }),
      db.event.count({ where: { status: "closed" } }),
      db.event.count(),
      db.pendaftar.count({ where: { status: "pending_payment" } }),
      db.pendaftar.count({ where: { status: "verified" } }),
      db.pendaftar.count({ where: { status: "rejected" } }),
      db.pendaftar.findMany({
        where: { status: "verified" },
        select: { totalBayar: true },
      }),
      // Distinct kontak across ALL pendaftar (regardless of status).
      // SQLite + Prisma: groupBy on kontak returns one row per distinct value.
      db.pendaftar.groupBy({
        by: ["kontak"],
        _count: { kontak: true },
      }),
      db.pendaftar.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          kodeReferensi: true,
          nama: true,
          kontak: true,
          jumlahOrang: true,
          totalBayar: true,
          status: true,
          createdAt: true,
          event: { select: { judul: true } },
        },
      }),
    ]);

    const revenue = verifiedPendaftar.reduce((sum, p) => sum + p.totalBayar, 0);
    const totalPendaftar = pendingCount + verifiedCount + rejectedCount;
    const totalUniqueRelawan = uniqueKontakRows.length;
    const avgPendaftarPerEvent =
      totalEventCount > 0
        ? Math.round((totalPendaftar / totalEventCount) * 10) / 10
        : 0;
    const conversionRate =
      totalPendaftar > 0
        ? Math.round((verifiedCount / totalPendaftar) * 1000) / 10
        : 0;

    return NextResponse.json({
      stats: {
        events: {
          active: activeCount,
          upcoming: upcomingCount,
          closed: closedCount,
          total: totalEventCount,
        },
        pendaftar: {
          pending: pendingCount,
          verified: verifiedCount,
          rejected: rejectedCount,
          total: totalPendaftar,
        },
        revenue,
        totalUniqueRelawan,
        avgPendaftarPerEvent,
        conversionRate,
        recent: recentPendaftar,
      },
    });
  } catch (err) {
    console.error("[api/admin/stats]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
