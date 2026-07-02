import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, getClientIp, acquireLock } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Admin check-in endpoint — used by the QR scanner at event entry.
 *
 * POST /api/admin/check-in
 *   headers: X-Admin-Token: <token>
 *   body:    { kode: string }
 *
 *   The `kode` field can be either:
 *     - a raw pendaftar kodeReferensi ("SRT-XXXXXX"), OR
 *     - the full QR payload ("SARATRASAA|<kode>|<nama>|<event.judul>")
 *
 *   We split on "|" when the payload starts with "SARATRASAA|" and take the
 *   2nd element as the kode. Otherwise we treat the raw value as the kode.
 *
 * Response:
 *   200 — { ok: true, pendaftar: {...}, alreadyCheckedIn: boolean }
 *   400 — { ok: false, error: "Kode tidak valid" }
 *   401 — { error: "Token admin tidak valid." }
 *   404 — { ok: false, error: "Pendaftar tidak ditemukan" }
 *   429 — { error: "Terlalu banyak scan. Tunggu sebentar." }
 *
 * Check-in throughput is higher than the public routes — 30 req/min/IP —
 * because admins scan many tickets in quick succession at event entry.
 *
 * Status semantics (per task spec):
 *   - verified         → check-in allowed, success overlay (green)
 *   - pending_payment  → warn admin (amber) — pendaftar belum diverifikasi
 *   - rejected         → reject check-in (red)
 *
 * The check-in is recorded as a CheckIn row regardless of status (so the
 * admin has an audit trail of all scans), but the response reflects the
 * pendaftar's current status so the UI can show the right overlay.
 *
 * Note: We don't dedupe — repeated scans of the same ticket are all logged
 * (each gets its own CheckIn row). The `alreadyCheckedIn` flag in the
 * response lets the admin see "this ticket was already scanned" by checking
 * for prior CheckIn rows for the same kodeReferensi (excluding the current
 * scan). This is intentional: at large events, re-scans are common (e.g.
 * volunteer walks in, then comes back out) and admins want to know.
 */
export async function POST(req: NextRequest) {
  // ----- Auth (security fix #2) -----
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json(
      { error: "Token admin tidak valid." },
      { status: 401 },
    );
  }

  // ----- Rate limit: 30 req/min/IP (check-in throughput) -----
  const ip = getClientIp(req) || "unknown";
  const rl = rateLimit(`admin-checkin:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak scan. Tunggu sebentar." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // ----- Parse body -----
  let body: { kode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body request tidak valid." },
      { status: 400 },
    );
  }

  const rawKode = typeof body.kode === "string" ? body.kode : "";

  /**
   * Extract kodeReferensi from either a raw kode or a full QR payload.
   * QR payload format: SARATRASAA|<kode>|<nama>|<event.judul>
   */
  function extractKode(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("SARATRASAA|")) {
      const parts = trimmed.split("|");
      // parts[0] = "SARATRASAA", parts[1] = kode, parts[2] = nama, parts[3] = judul
      return parts.length >= 2 ? parts[1].trim() : "";
    }
    return trimmed;
  }

  const kode = extractKode(rawKode);

  if (!kode) {
    return NextResponse.json(
      { ok: false, error: "Kode tidak valid" },
      { status: 400 },
    );
  }

  // ----- Look up pendaftar -----
  try {
    // Lock briefly to avoid a race between two admins scanning the same
    // ticket at the same moment (would otherwise create two CheckIn rows
    // with identical timestamps — not harmful, just messy).
    const release = await acquireLock(`checkin:${kode}`, 3000);
    try {
      const pendaftar = await db.pendaftar.findUnique({
        where: { kodeReferensi: kode },
        select: {
          kodeReferensi: true,
          nama: true,
          jumlahOrang: true,
          status: true,
          idEvent: true,
          event: {
            select: {
              id: true,
              judul: true,
              tanggal: true,
              lokasi: true,
              status: true,
            },
          },
        },
      });

      if (!pendaftar) {
        return NextResponse.json(
          { ok: false, error: "Pendaftar tidak ditemukan" },
          { status: 404 },
        );
      }

      if (pendaftar.event.status === "closed") {
        return NextResponse.json(
          { ok: false, error: `Event "${pendaftar.event.judul}" sudah ditutup. Scan ditolak.` },
          { status: 400 },
        );
      }

      // ----- Check for prior check-ins (to prevent duplicates) -----
      const existingCheckIn = await db.checkIn.findFirst({
        where: { kodeReferensi: pendaftar.kodeReferensi },
        orderBy: { checkedInAt: "desc" },
      });

      if (existingCheckIn) {
        // Tiket sudah pernah di-scan. Kita kembalikan status sukses tapi dengan
        // flag alreadyCheckedIn agar UI memunculkan peringatan kuning, dan
        // yang paling penting: KITA TIDAK MENAMBAH RECORD BARU (mencegah dobel).
        return NextResponse.json({
          ok: true,
          pendaftar: {
            kodeReferensi: pendaftar.kodeReferensi,
            nama: pendaftar.nama,
            jumlahOrang: pendaftar.jumlahOrang,
            status: pendaftar.status,
            event: {
              judul: pendaftar.event.judul,
              tanggal: pendaftar.event.tanggal,
              lokasi: pendaftar.event.lokasi,
            },
          },
          alreadyCheckedIn: true,
          lastCheckedInAt: existingCheckIn.checkedInAt.toISOString(),
        });
      }

      // ----- Record the check-in -----
      // We log the check-in only if it's their first time to avoid duplicates.
      await db.checkIn.create({
        data: {
          kodeReferensi: pendaftar.kodeReferensi,
          idEvent: pendaftar.idEvent,
        },
      });

      return NextResponse.json({
        ok: true,
        pendaftar: {
          kodeReferensi: pendaftar.kodeReferensi,
          nama: pendaftar.nama,
          jumlahOrang: pendaftar.jumlahOrang,
          status: pendaftar.status,
          event: {
            judul: pendaftar.event.judul,
            tanggal: pendaftar.event.tanggal,
            lokasi: pendaftar.event.lokasi,
          },
        },
        alreadyCheckedIn: false,
        lastCheckedInAt: null,
      });
    } finally {
      release();
    }
  } catch (err) {
    console.error("[api/admin/check-in POST]", err);
    return NextResponse.json(
      { ok: false, error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/check-in?id=<uuid>
 *   headers: X-Admin-Token: <token>
 */
export async function DELETE(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID check-in tidak valid." }, { status: 400 });
  }

  try {
    await db.checkIn.delete({
      where: { id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/check-in DELETE]", err);
    return NextResponse.json({ error: "Gagal menghapus data check-in." }, { status: 500 });
  }
}
