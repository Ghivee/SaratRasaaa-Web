import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/reminders
 *
 * Returns pending event reminders for verified pendaftar whose events are
 * happening within the next 7 days. Each reminder is classified into one of
 * three windows (h-1, h-3, h-7) based on how many full days are left until
 * the event. The stats object summarizes the counts per window so the admin
 * UI can render quick-filter chips.
 *
 *   →  {
 *        reminders: [
 *          {
 *            kodeReferensi: "SRT-XXX",
 *            nama: "Dewi",
 *            kontak: "0813...",
 *            eventJudul: "Bersih Pantai Pangandaran #3",
 *            eventTanggal: "2025-08-05",
 *            eventLokasi: "Pantai Pangandaran",
 *            daysUntil: 3,
 *            reminderType: "h-3"
 *          }
 *        ],
 *        stats: { total: 15, h1: 5, h3: 7, h7: 3 }
 *      }
 *
 * Requires X-Admin-Token header (security fix #2 — never hardcoded in bundle).
 * Rate limited to 30 req/min/IP (read-only, generous).
 *
 * Notes:
 *   - Only VERIFIED pendaftar are eligible for reminders. Pending/rejected
 *     pendaftar should not receive event-day reminders.
 *   - Only events with status "upcoming" or "active" are eligible — closed
 *     events are in the past and shouldn't trigger reminders.
 *   - daysUntil = ceil((eventTanggal - now) / day) so an event happening
 *     tomorrow (any time today → end of event day) shows as 1.
 *   - reminderType is the smallest applicable window: an event 2 days out
 *     is classified as "h-3" (3-day reminder bucket), not "h-7".
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json(
      { error: "Token admin tidak valid." },
      { status: 401 },
    );
  }

  const ip = getClientIp(req) || "unknown";
  const rl = rateLimit(`admin-reminders:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    // Fetch all verified pendaftar with their event info. We deliberately do
    // the day-window math in JS rather than in the DB because `tanggal` is a
    // plain ISO-date string column (SQLite has no native DATE type) and the
    // window is small (7 days). The result set is bounded by the number of
    // verified pendaftar, which is modest for a community-volunteer app.
    const rows = await db.pendaftar.findMany({
      where: { status: "verified" },
      select: {
        kodeReferensi: true,
        nama: true,
        kontak: true,
        jumlahOrang: true,
        event: {
          select: {
            judul: true,
            tanggal: true,
            lokasi: true,
            status: true,
          },
        },
      },
    });

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS_MS = 7 * DAY_MS;

    type ReminderType = "h-1" | "h-3" | "h-7";

    interface Reminder {
      kodeReferensi: string;
      nama: string;
      kontak: string;
      jumlahOrang: number;
      eventJudul: string;
      eventTanggal: string;
      eventLokasi: string;
      daysUntil: number;
      reminderType: ReminderType;
    }

    const reminders: Reminder[] = [];

    for (const r of rows) {
      // Skip closed events — they're in the past.
      if (r.event.status === "closed") continue;

      // Parse the event date. We treat the date string as midnight UTC
      // (the brief stores YYYY-MM-DD). Date.UTC keeps the math stable
      // regardless of server timezone.
      const iso = r.event.tanggal;
      const datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
      const [y, m, d] = datePart.split("-").map(Number);
      if (!y || !m || !d) continue;
      const eventMs = Date.UTC(y, m - 1, d);
      if (!Number.isFinite(eventMs)) continue;

      const diffMs = eventMs - now;
      // Only include events that are still upcoming (diff > 0) and within
      // the 7-day reminder window. We use Math.ceil so an event happening
      // "today" (diff small positive) still counts as 1 day until, and an
      // event 6.5 days away counts as 7. Past events (diff < 0) are skipped.
      if (diffMs <= 0) continue;
      if (diffMs > SEVEN_DAYS_MS) continue;

      const daysUntil = Math.ceil(diffMs / DAY_MS);

      // Classify into the smallest applicable window. An event 1 day away
      // is "h-1"; 2-3 days is "h-3"; 4-7 days is "h-7".
      let reminderType: ReminderType;
      if (daysUntil <= 1) {
        reminderType = "h-1";
      } else if (daysUntil <= 3) {
        reminderType = "h-3";
      } else {
        reminderType = "h-7";
      }

      reminders.push({
        kodeReferensi: r.kodeReferensi,
        nama: r.nama,
        kontak: r.kontak,
        jumlahOrang: r.jumlahOrang,
        eventJudul: r.event.judul,
        eventTanggal: iso,
        eventLokasi: r.event.lokasi,
        daysUntil,
        reminderType,
      });
    }

    // Sort by soonest event first — admins want to triage H-1s first.
    reminders.sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      return a.eventJudul.localeCompare(b.eventJudul);
    });

    const stats = {
      total: reminders.length,
      h1: reminders.filter((r) => r.reminderType === "h-1").length,
      h3: reminders.filter((r) => r.reminderType === "h-3").length,
      h7: reminders.filter((r) => r.reminderType === "h-7").length,
    };

    return NextResponse.json({ reminders, stats });
  } catch (err) {
    console.error("[api/admin/reminders GET]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
