import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, acquireLock, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Admin bulk pendaftar management.
 *
 * POST /api/admin/pendaftar/bulk
 *   body: { action: "verify" | "reject", kodes: string[], catatan?: string }
 *
 * Updates multiple pendaftar in one request. Acquires a per-kode mutex (same
 * pattern as the single-action route) and skips any kode whose current status
 * is not `pending_payment` (returns them in the `failed` array with a reason).
 *
 * Requires X-Admin-Token header (security fix #2 — never hardcoded in bundle).
 * Rate limited to 20 bulk actions / minute / IP to prevent abuse.
 */
const MAX_BULK = 100; // cap per request to avoid runaway loops

export async function POST(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  // Light rate limit — bulk ops touch many rows at once, so we cap burst rate.
  const ip = getClientIp(req) || "unknown";
  const rl = rateLimit(`admin-bulk:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan bulk. Coba lagi sebentar." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = await req.json();
    const { action, kodes, catatan } = body as {
      action?: string;
      kodes?: unknown;
      catatan?: string;
    };

    if (action !== "verify" && action !== "reject") {
      return NextResponse.json(
        { error: "Action harus 'verify' atau 'reject'." },
        { status: 400 },
      );
    }

    if (!Array.isArray(kodes) || kodes.length === 0) {
      return NextResponse.json(
        { error: "kodes harus berupa array berisi minimal satu kode referensi." },
        { status: 400 },
      );
    }

    if (kodes.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Maksimal ${MAX_BULK} pendaftar per permintaan bulk.` },
        { status: 400 },
      );
    }

    // Normalize + dedupe kode list — coerce to string + uppercase + trim.
    const seen = new Set<string>();
    const normalizedKodes: string[] = [];
    for (const raw of kodes) {
      if (typeof raw !== "string") continue;
      const k = raw.trim().toUpperCase();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      normalizedKodes.push(k);
    }

    if (normalizedKodes.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada kode referensi yang valid." },
        { status: 400 },
      );
    }

    const trimmedCatatan =
      action === "reject" && typeof catatan === "string" && catatan.trim()
        ? catatan.trim().slice(0, 500)
        : null;

    let updated = 0;
    const failed: string[] = [];

    // Process each kode in turn. We acquire a per-kode mutex (same as the
    // single-action route) so we don't race with the webhook auto-verifier.
    // This is sequential by design — bulk ops aren't on a hot path, and the
    // lock helper serializes on the same key anyway.
    for (const kode of normalizedKodes) {
      const release = await acquireLock(`pendaftar:${kode}`);
      try {
        const existing = await db.pendaftar.findUnique({
          where: { kodeReferensi: kode },
          select: { kodeReferensi: true, status: true },
        });

        if (!existing) {
          failed.push(kode);
          continue;
        }

        if (existing.status !== "pending_payment") {
          // Skip — caller can surface a warning for these.
          failed.push(kode);
          continue;
        }

        const updateData =
          action === "verify"
            ? { status: "verified", verifiedAt: new Date() }
            : {
                status: "rejected",
                catatanAdmin: trimmedCatatan,
              };

        await db.pendaftar.update({
          where: { kodeReferensi: kode },
          data: updateData,
        });

        updated += 1;
      } finally {
        release();
      }
    }

    return NextResponse.json({
      ok: true,
      action,
      updated,
      failed,
      skipped: failed.length,
    });
  } catch (err) {
    console.error("[api/admin/pendaftar/bulk POST]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
