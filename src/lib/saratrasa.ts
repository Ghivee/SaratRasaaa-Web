/**
 * ID & reference generation for Saratrasaa.
 */

import { db } from "@/lib/db";

const KODE_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1 — avoid confusion

/** Random short string of given length from the safe alphabet. */
export function randomCode(len: number): string {
  let s = "";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) {
    s += KODE_REF_ALPHABET[buf[i] % KODE_REF_ALPHABET.length];
  }
  return s;
}

/**
 * Generate a unique `SRT-XXXXXX` kode_referensi.
 * Retries on collision (extremely unlikely with 30^6 ≈ 7e8 space).
 */
export async function generateKodeReferensi(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const kode = `SRT-${randomCode(6)}`;
    const exists = await db.pendaftar.findUnique({ where: { kodeReferensi: kode }, select: { kodeReferensi: true } });
    if (!exists) return kode;
  }
  // Fallback — append a longer suffix if all 10 attempts collide.
  return `SRT-${randomCode(8)}`;
}

/**
 * Generate a unique `kode_unik` (1–999) for an event.
 * Checks only `pending_payment` rows on the same event (per brief §7.1).
 *
 * IMPORTANT: caller MUST hold the per-event lock to make this atomic.
 */
export async function generateKodeUnik(idEvent: string): Promise<number> {
  const MAX_ATTEMPTS = 100;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = 1 + Math.floor(Math.random() * 999); // 1..999
    const clash = await db.pendaftar.findFirst({
      where: { idEvent, kodeUnik: candidate, status: "pending_payment" },
      select: { kodeReferensi: true },
    });
    if (!clash) return candidate;
  }
  // Extremely unlikely — fall back to a sequential scan for a free slot.
  const used = new Set(
    (
      await db.pendaftar.findMany({
        where: { idEvent, status: "pending_payment" },
        select: { kodeUnik: true },
      })
    ).map((r) => r.kodeUnik),
  );
  for (let n = 1; n <= 999; n++) if (!used.has(n)) return n;
  throw new Error("Kuota kode unik untuk event ini habis (1–999).");
}

/** Format an integer as Indonesian Rupiah, e.g. 150127 -> "Rp 150.127". */
export function formatIDR(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

/** Format just the integer part with thousand separators. */
export function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}
