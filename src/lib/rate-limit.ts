/**
 * In-memory rate limiter for Saratrasaa public API routes.
 *
 * Implements a sliding-window counter per IP+key. Returns whether the request
 * is allowed and how long to wait (in ms) before retrying.
 *
 * Usage:
 *   const { allowed, retryAfterMs } = rateLimit(`daftar:${ip}`, 5, 60_000);
 *   if (!allowed) return NextResponse.json({ error: "Terlalu banyak request. Coba lagi dalam beberapa menit." }, {
 *     status: 429,
 *     headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
 *   });
 *
 * Note: this is process-scoped (fine for single-instance dev server). For
 * multi-instance production, swap the `buckets` Map for Redis INCR + EXPIRE.
 */

interface Bucket {
  count: number;
  firstAt: number;
}

const buckets = new Map<string, Bucket>();

/** Periodic cleanup — drop stale buckets every 5 minutes to avoid memory growth. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number, windowMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [k, b] of buckets) {
    if (b.firstAt < cutoff) buckets.delete(k);
  }
}

/**
 * Check rate limit for a given key.
 * @param key e.g. `daftar:127.0.0.1`
 * @param maxRequests max allowed requests in the window
 * @param windowMs window size in milliseconds
 * @returns `{ allowed: boolean, retryAfterMs: number, remaining: number }`
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number; remaining: number } {
  const now = Date.now();
  cleanup(now, windowMs);

  const existing = buckets.get(key);

  if (!existing || now - existing.firstAt >= windowMs) {
    // Start a new window.
    buckets.set(key, { count: 1, firstAt: now });
    return { allowed: true, retryAfterMs: 0, remaining: maxRequests - 1 };
  }

  existing.count += 1;

  if (existing.count > maxRequests) {
    const retryAfterMs = windowMs - (now - existing.firstAt);
    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs), remaining: 0 };
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, maxRequests - existing.count),
  };
}
