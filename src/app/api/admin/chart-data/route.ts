import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/chart-data?days=30
 *
 * Returns pendaftar aggregated by day for the admin dashboard chart.
 * Groups by date (YYYY-MM-DD) and status, so the chart can show
 * pending vs verified vs rejected over time.
 *
 * Requires X-Admin-Token header.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const daysRaw = req.nextUrl.searchParams.get("days") || "30";
    const days = Math.min(Math.max(parseInt(daysRaw, 10) || 30, 1), 365);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const pendaftar = await db.pendaftar.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { status: true, createdAt: true, jumlahOrang: true },
      orderBy: { createdAt: "asc" },
    });

    // Group by date + status
    const byDate = new Map<string, { date: string; pending: number; verified: number; rejected: number; total: number; volunteers: number }>();

    for (const p of pendaftar) {
      const dateStr = p.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      let entry = byDate.get(dateStr);
      if (!entry) {
        entry = { date: dateStr, pending: 0, verified: 0, rejected: 0, total: 0, volunteers: 0 };
        byDate.set(dateStr, entry);
      }
      entry.total += 1;
      entry.volunteers += p.jumlahOrang;
      if (p.status === "pending_payment") entry.pending += 1;
      else if (p.status === "verified") entry.verified += 1;
      else if (p.status === "rejected") entry.rejected += 1;
    }

    // Fill in missing days with zeros for a continuous chart.
    const series: Array<{ date: string; pending: number; verified: number; rejected: number; total: number; volunteers: number }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      series.push(byDate.get(dateStr) || { date: dateStr, pending: 0, verified: 0, rejected: 0, total: 0, volunteers: 0 });
    }

    return NextResponse.json({
      series,
      summary: {
        totalPendaftar: pendaftar.length,
        totalVolunteers: pendaftar.reduce((s, p) => s + p.jumlahOrang, 0),
        verified: pendaftar.filter((p) => p.status === "verified").length,
        pending: pendaftar.filter((p) => p.status === "pending_payment").length,
        rejected: pendaftar.filter((p) => p.status === "rejected").length,
      },
    });
  } catch (err) {
    console.error("[api/admin/chart-data]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
