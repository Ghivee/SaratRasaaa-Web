import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/check-in/stats?idEvent=<eventId>
 *   headers: X-Admin-Token: <token>
 *
 * Returns aggregated check-in statistics:
 *   {
 *     totalCheckedIn: number,           // total check-ins across all events
 *     totalToday: number,               // check-ins made today (Asia/Jakarta)
 *     byEvent: Array<{
 *       idEvent: string,
 *       judul: string,
 *       tanggal: string,
 *       checkedIn: number
 *     }>
 *   }
 *
 * If ?idEvent is provided, byEvent only contains that single event
 * (still returned as a 1-element array for UI consistency).
 *
 * Response:
 *   200 — stats payload
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
    const idEvent = req.nextUrl.searchParams.get("idEvent") || undefined;

    // ----- Total check-ins (optionally filtered by event) -----
    const totalCheckedIn = await db.checkIn.count({
      where: idEvent ? { idEvent } : {},
    });

    // ----- "Today" boundary in Asia/Jakarta -----
    // Jakarta is UTC+7. We compute the local "today" range and convert
    // back to UTC for the DB query. SQLite stores ISO strings.
    const now = new Date();
    const jakartaOffsetMs = 7 * 60 * 60 * 1000;
    const nowJakarta = new Date(now.getTime() + jakartaOffsetMs);
    const yyyy = nowJakarta.getUTCFullYear();
    const mm = nowJakarta.getUTCMonth();
    const dd = nowJakarta.getUTCDate();
    const startOfTodayJakarta = new Date(Date.UTC(yyyy, mm, dd, 0, 0, 0));
    const startOfTodayUtc = new Date(
      startOfTodayJakarta.getTime() - jakartaOffsetMs,
    );
    const totalToday = await db.checkIn.count({
      where: {
        ...(idEvent ? { idEvent } : {}),
        checkedInAt: { gte: startOfTodayUtc },
      },
    });

    // ----- Per-event breakdown -----
    // SQLite + Prisma: we group by idEvent manually. Pull all events that
    // have any check-ins, then count per event in JS (cheap for the dataset
    // sizes a community event app sees).
    const eventsWithCheckIns = await db.event.findMany({
      where: idEvent ? { id: idEvent } : { checkIns: { some: {} } },
      select: {
        id: true,
        judul: true,
        tanggal: true,
        _count: { select: { checkIns: true } },
      },
      orderBy: { tanggal: "desc" },
    });

    const byEvent = eventsWithCheckIns
      .map((ev) => ({
        idEvent: ev.id,
        judul: ev.judul,
        tanggal: ev.tanggal,
        checkedIn: ev._count.checkIns,
      }))
      .filter((ev) => ev.checkedIn > 0)
      .sort((a, b) => b.checkedIn - a.checkedIn);

    return NextResponse.json({
      totalCheckedIn,
      totalToday,
      byEvent,
    });
  } catch (err) {
    console.error("[api/admin/check-in/stats GET]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
