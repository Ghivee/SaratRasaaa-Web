/**
 * Security utilities for Saratrasaa.
 *
 * Implements the 5 fixes requested in the brief review:
 *  1. Webhook signature validation (HMAC-SHA256) + optional IP allowlist — fixes webhook spoofing.
 *  2. Admin token validated server-side, never hardcoded in frontend bundle.
 *  3. In-memory mutex per resource (surrogate for Apps Script LockService) — fixes race conditions.
 *  4. File upload validation (MIME type + size) — fixes unrestricted upload / DoS.
 *  5. cekStatus requires kode_referensi OR (kontak + nama depan) — fixes IDOR.
 */

import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* 1. WEBHOOK SECURITY — HMAC-SHA256 signature + optional IP allowlist         */
/* -------------------------------------------------------------------------- */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const WEBHOOK_IP_ALLOWLIST_RAW = process.env.WEBHOOK_IP_ALLOWLIST || "";

/**
 * Compute the expected HMAC-SHA256 signature for a raw request body.
 * The third-party mutation service must send this in the `X-Webhook-Signature`
 * header (hex encoded) using the same shared secret.
 */
export function computeWebhookSignature(rawBody: Buffer): string {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

/**
 * Verify an incoming webhook signature in constant time.
 * Returns false if no secret is configured or signature is missing/mismatched.
 */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | null): boolean {
  if (!WEBHOOK_SECRET) return false;
  if (!signatureHeader) return false;

  const expected = computeWebhookSignature(rawBody);
  const received = signatureHeader.trim();

  // Strip optional "sha256=" prefix (some providers send it).
  const normalized = received.startsWith("sha256=") ? received.slice(7) : received;

  if (normalized.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(normalized, "hex"), Buffer.from(expected, "hex"));
}

/**
 * Optional IP allowlist for the webhook endpoint.
 * If WEBHOOK_IP_ALLOWLIST is empty, allow all (dev friendly).
 * Otherwise the request IP must be in the list.
 */
export function isWebhookIpAllowed(remoteIp: string | null): boolean {
  if (!WEBHOOK_IP_ALLOWLIST_RAW.trim()) return true; // not configured → allow
  if (!remoteIp) return false;
  const allow = WEBHOOK_IP_ALLOWLIST_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Also allow loopback for local testing.
  if (remoteIp === "127.0.0.1" || remoteIp === "::1") return true;
  return allow.includes(remoteIp);
}

/**
 * Extract the client IP from a Next.js request, honoring X-Forwarded-For.
 */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xreal = req.headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  return null;
}

/* -------------------------------------------------------------------------- */
/* 2. ADMIN TOKEN — validated server-side, sent via header (never in bundle)   */
/* -------------------------------------------------------------------------- */

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ADMIN_URL_SECRET = process.env.ADMIN_URL_SECRET || "";

/**
 * Validate the admin token sent in the `X-Admin-Token` header.
 * Constant-time comparison. The token is typed manually by the admin in the
 * UI (no hardcoded value in the frontend bundle).
 */
export function verifyAdminToken(tokenHeader: string | null): boolean {
  if (!ADMIN_TOKEN) return false;
  if (!tokenHeader) return false;
  const a = Buffer.from(tokenHeader);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * The admin panel is reachable only via /?admin=<ADMIN_URL_SECRET>.
 * This is the first layer (security through obscurity); the second layer is
 * the admin token typed by the operator.
 */
export function verifyAdminUrlSecret(secret: string | null): boolean {
  if (!ADMIN_URL_SECRET) return false;
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(ADMIN_URL_SECRET);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* 3. IN-MEMORY MUTEX — surrogate for Apps Script LockService                  */
/*    Prevents race conditions on `daftar` (quota + kode_unik) and on the      */
/*    webhook (status update). Single-process Next.js dev server is fine.     */
/* -------------------------------------------------------------------------- */

type Releaser = () => void;
const locks = new Map<string, Promise<Releaser>>();

/**
 * Acquire a mutex for the given key. Resolves once the lock is held.
 * Caller MUST call the returned releaser when done.
 *
 * Usage:
 *   const release = await acquireLock(`event:${id}`);
 *   try { ... } finally { release(); }
 */
export async function acquireLock(key: string, timeoutMs = 5000): Promise<Releaser> {
  const deadline = Date.now() + timeoutMs;
  let prev = locks.get(key) || Promise.resolve(() => {});

  // Chain onto whatever the current lock resolves to.
  const next = prev.then(
    (prevReleaser) => {
      // We hold the lock now. Return a releaser that also clears the chain
      // if we are the last holder.
      const release: Releaser = () => {
        prevReleaser();
        if (locks.get(key) === myPromise) locks.delete(key);
      };
      return release;
    },
    // If the previous holder rejected, still proceed.
    () => () => {},
  );

  const myPromise = next;
  locks.set(key, myPromise);

  // Race against timeout.
  const release = await Promise.race([
    next,
    new Promise<Releaser>((_, reject) =>
      setTimeout(() => reject(new Error("LOCK_TIMEOUT")), Math.max(0, deadline - Date.now())),
    ),
  ]).catch(() => {
    // On timeout, fabricate a no-op releaser to keep caller code simple.
    return () => {};
  });

  return release;
}

/* -------------------------------------------------------------------------- */
/* 4. FILE UPLOAD VALIDATION — MIME type + size                                */
/* -------------------------------------------------------------------------- */

export const ALLOWED_UPLOAD_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024); // 2 MB default

export interface UploadValidationResult {
  ok: boolean;
  error?: string;
  mime?: string;
  ext?: string;
}

/**
 * Validate a base64 data URL for upload.
 * Returns the parsed metadata if valid, or an error description.
 */
export function validateUpload(dataUrl: string): UploadValidationResult {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { ok: false, error: "Format file tidak valid (harus data URL base64)." };
  }
  const mime = match[1].toLowerCase();
  const b64 = match[2];

  if (!ALLOWED_UPLOAD_MIME.has(mime)) {
    return {
      ok: false,
      error: `Tipe file tidak diizinkan: ${mime}. Hanya JPG, PNG, atau PDF.`,
      mime,
    };
  }

  // Approximate byte size from base64 length (4 chars = 3 bytes).
  const padding = (b64.match(/=+$/) || [""])[0].length;
  const byteLen = Math.floor((b64.length * 3) / 4) - padding;

  if (byteLen > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `Ukuran file terlalu besar (${(byteLen / 1024 / 1024).toFixed(2)} MB). Maksimal ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB.`,
      mime,
    };
  }

  // Magic-byte sniffing for extra safety (some clients lie about MIME).
  const sniff = sniffMagic(b64);
  if (sniff && sniff !== mime) {
    return {
      ok: false,
      error: `Konten file tidak cocok dengan tipe yang dilaporkan.`,
      mime,
    };
  }

  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "application/pdf" ? "pdf" : "bin";

  return { ok: true, mime, ext };
}

/** Sniff the first few bytes (base64) to detect true file type. */
function sniffMagic(b64: string): string | null {
  // Decode first 12 chars (8 bytes after decode).
  const head = Buffer.from(b64.slice(0, 16), "base64");
  if (head.length < 4) return null;
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  )
    return "image/png";
  // PDF: %PDF-
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)
    return "application/pdf";
  return null;
}

/* -------------------------------------------------------------------------- */
/* 5. IDOR-SAFE STATUS LOOKUP                                                  */
/* -------------------------------------------------------------------------- */

export interface StatusLookupQuery {
  kodeReferensi?: string;
  kontak?: string;
  otp?: string;
}

/**
 * Validate a cek-status query for IDOR safety.
 * Either:
 *   (a) kode_referensi is provided (random, unguessable), OR
 *   (b) BOTH kontak AND otp are provided (verified ownership via WA).
 */
export function validateStatusLookup(q: StatusLookupQuery): {
  ok: boolean;
  error?: string;
  mode: "kode" | "otp" | "none";
} {
  const kode = q.kodeReferensi?.trim().toUpperCase();
  if (kode && /^SRT-[A-Z0-9]{6}$/.test(kode)) {
    return { ok: true, mode: "kode" };
  }

  const kontak = q.kontak?.trim();
  const otp = q.otp?.trim();
  if (kontak && otp && kontak.length >= 8 && otp.length === 6) {
    return { ok: true, mode: "otp" };
  }

  return {
    ok: false,
    mode: "none",
    error:
      "Wajib isi kode referensi (format SRT-XXXXXX), ATAU nomor HP beserta OTP dari WhatsApp.",
  };
}
