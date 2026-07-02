/**
 * Saratrasaa — Webhook pembayaran (POST /api/webhook/pembayaran)
 *
 * Security fix #1 from the brief review: WEBHOOK SPOOFING.
 *
 * Verification chain (order matters):
 *   1. HMAC-SHA256 signature over the RAW request body (constant-time compare).
 *      → 401 if invalid. Prevents anyone with the URL from forging a payment.
 *   2. IP allowlist (defense in depth, optional).
 *      → 403 if remote IP not in WEBHOOK_IP_ALLOWLIST.
 *   3. JSON parsing (from the SAME buffer used for signature verification).
 *      → 400 if not valid JSON.
 *   4. Amount validation (positive integer, coerced from common field names).
 *      → 400 if missing/invalid.
 *   5. Race-condition-protected match-and-update, guarded by an in-process mutex
 *      keyed on "webhook:pembayaran" so two simultaneous deliveries for the same
 *      nominal cannot double-verify.
 *
 * Response policy: return 200 even on no-match so the provider does not retry-storm.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyWebhookSignature,
  isWebhookIpAllowed,
  getClientIp,
  acquireLock,
} from "@/lib/security";

const LOG_TAG = "[webhook:pembayaran]";

function log(ip: string | null, amount: number | null, verified: "true" | "false" | "n/a", extra = "") {
  console.log(
    `${LOG_TAG} ts=${new Date().toISOString()} ip=${ip ?? "-"} amount=${amount ?? "null"} verified=${verified}${extra ? ` ${extra}` : ""}`,
  );
}

/**
 * Extract the payment amount from any of the common provider field names
 * (`amount` | `nominal` | `jumlah` | `value`) and coerce to a positive integer.
 * Returns null if missing or unparseable.
 */
function parseAmount(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const raw = b.amount ?? b.nominal ?? b.jumlah ?? b.value;
  if (raw == null) return null;

  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    n = Number(trimmed);
    // If plain parse fails (e.g. "Rp 150.000"), fall back to digits-only.
    if (!Number.isFinite(n)) {
      const digitsOnly = trimmed.replace(/[^0-9]/g, "");
      if (!digitsOnly) return null;
      n = Number(digitsOnly);
    }
  } else {
    return null;
  }

  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Extract the transaction ID from common provider field names.
 */
function parseTrxId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const raw = b.trx_id ?? b.trxId ?? b.transaction_id ?? b.transactionId ?? b.id;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  if (typeof raw === "number") return String(raw);
  return null;
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);

  /* ------------------------------------------------------------------ */
  /* 1. Read the raw body ONCE as a Buffer.                              */
  /*    We reuse this exact buffer for both signature verification AND   */
  /*    JSON parsing — calling req.json() separately would re-read the   */
  /*    stream and the signature would never match.                      */
  /* ------------------------------------------------------------------ */
  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await req.arrayBuffer());
  } catch {
    log(clientIp, null, "n/a", "reason=read_error");
    return NextResponse.json({ error: "Gagal membaca body webhook." }, { status: 400 });
  }

  /* ------------------------------------------------------------------ */
  /* 2. HMAC-SHA256 signature verification (fixes spoofing).             */
  /* ------------------------------------------------------------------ */
  const sigHeader = req.headers.get("x-yogateway-signature");
  const sigOk = verifyWebhookSignature(rawBody, sigHeader);
  if (!sigOk) {
    log(clientIp, null, "n/a", "reason=bad_signature");
    try {
      await db.webhookLog.create({
        data: {
          ip: clientIp,
          signatureOk: false,
          ipOk: isWebhookIpAllowed(clientIp),
          reason: "bad_signature",
          rawPayload: rawBody.toString("utf8").slice(0, 4000),
        },
      });
    } catch (e) {
      console.error(LOG_TAG, "failed to log bad_signature webhook", e);
    }
    return NextResponse.json({ error: "Signature webhook tidak valid." }, { status: 401 });
  }

  /* ------------------------------------------------------------------ */
  /* 3. IP allowlist — defense in depth.                                 */
  /* ------------------------------------------------------------------ */
  if (!isWebhookIpAllowed(clientIp)) {
    log(clientIp, null, "n/a", "reason=ip_denied");
    try {
      await db.webhookLog.create({
        data: {
          ip: clientIp,
          signatureOk: true,
          ipOk: false,
          reason: "ip_denied",
          rawPayload: rawBody.toString("utf8").slice(0, 4000),
        },
      });
    } catch (e) {
      console.error(LOG_TAG, "failed to log ip_denied webhook", e);
    }
    return NextResponse.json({ error: "IP tidak diizinkan." }, { status: 403 });
  }

  /* ------------------------------------------------------------------ */
  /* 4. Parse JSON from the SAME buffer.                                 */
  /* ------------------------------------------------------------------ */
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    log(clientIp, null, "n/a", "reason=bad_json");
    return NextResponse.json({ error: "Payload webhook bukan JSON valid." }, { status: 400 });
  }

  /* ------------------------------------------------------------------ */
  /* 5. Validate amount & trxId                                          */
  /* ------------------------------------------------------------------ */
  const amount = parseAmount(body);
  const trxId = parseTrxId(body);
  if (amount === null) {
    log(clientIp, null, "n/a", "reason=bad_amount");
    return NextResponse.json({ error: "Nominal pembayaran tidak valid." }, { status: 400 });
  }

  /* ------------------------------------------------------------------ */
  /* 6. Match-and-update under a process-wide mutex.                     */
  /*    Prevents two concurrent webhook deliveries for the same nominal  */
  /*    from both matching and double-verifying (race condition fix).    */
  /* ------------------------------------------------------------------ */
  const release = await acquireLock("webhook:pembayaran");
  try {
    // Match by trxId directly first. If no trxId or no match, fallback to amount.
    let match = null;
    
    if (trxId) {
      match = await db.pendaftar.findFirst({
        where: { trxId, status: "pending_payment" },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!match) {
      match = await db.pendaftar.findFirst({
        where: { totalBayar: amount, status: "pending_payment" },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!match) {
      // Normal case: a transfer with no matching pending registration.
      // Return 200 so the provider doesn't retry-storm us.
      log(clientIp, amount, "false", "reason=no_match");
      try {
        await db.webhookLog.create({
          data: {
            ip: clientIp,
            amount,
            signatureOk: true,
            ipOk: true,
            reason: "no_match",
            rawPayload: rawBody.toString("utf8").slice(0, 4000),
          },
        });
      } catch (e) {
        console.error(LOG_TAG, "failed to log no_match webhook", e);
      }
      return NextResponse.json(
        {
          ok: true,
          verified: false,
          note: "Tidak ada pendaftaran pending dengan nominal tersebut.",
        },
        { status: 200 },
      );
    }

    await db.pendaftar.update({
      where: { kodeReferensi: match.kodeReferensi },
      data: {
        status: "verified",
        verifiedAt: new Date(),
      },
    });

    // Keuangan is dynamically calculated in the admin API based on verified pendaftars

    log(clientIp, amount, "true", `kode=${match.kodeReferensi}`);
    try {
      await db.webhookLog.create({
        data: {
          ip: clientIp,
          amount,
          signatureOk: true,
          ipOk: true,
          matchedKode: match.kodeReferensi,
          reason: "verified",
          rawPayload: rawBody.toString("utf8").slice(0, 4000),
        },
      });
    } catch (e) {
      console.error(LOG_TAG, "failed to log verified webhook", e);
    }
    return NextResponse.json(
      {
        ok: true,
        verified: true,
        kodeReferensi: match.kodeReferensi,
      },
      { status: 200 },
    );
  } finally {
    release();
  }
}
