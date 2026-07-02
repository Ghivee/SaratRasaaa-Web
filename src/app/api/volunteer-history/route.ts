import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

type PendaftarWithEvent = Prisma.PendaftarGetPayload<{
  include: { event: true };
}>;

/**
 * GET /api/volunteer-history?kontak=...&otp=...
 *
 * Returns the FULL registration history for a volunteer identified by the
 * (kontak + otp) combination. Same IDOR-safe validation as
 * /api/cek-status — HP-only search is rejected. Enforced by
 * `validateStatusLookup` from src/lib/security.ts (security fix #5).
 *
 * Rate limited: 10 req/min/IP (stricter than cek-status's 20/min — this
 * endpoint returns more data per call, so brute-force attempts are more
 * dangerous).
 *
 * Response 200:
 *   {
 *     volunteer: {
 *       nama, kontak, totalRegistrations, totalVerified, totalPending,
 *       totalRejected, totalPeople, firstEventDate, memberSince
 *     },
 *     history: [
 *       { kodeReferensi, nama, jumlahOrang, totalBayar, status,
 *         createdAt, verifiedAt, event: { judul, tanggal, lokasi, status } }
 *     ]
 *   }
 *
 * Response 400: invalid lookup query (HP-only, or missing params) — `error`
 * Response 404: no records found for this kontak + otp — `error`
 * Response 429: rate-limited — `error` + Retry-After header
 * Response 500: unexpected server error
 */
export async function GET(req: NextRequest) {
  try {
    // Rate limit — 10 history lookups per IP per 60 seconds.
    // Stricter than cek-status (20/min) because this endpoint returns ALL
    // matching records, not a single one, so each request is "heavier".
    const ip = getClientIp(req) || "unknown";
    const rl = rateLimit(`volunteer-history:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak pencarian dari perangkat ini. Tunggu sebentar ya." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    const sp = req.nextUrl.searchParams;
    const kontak = sp.get("kontak") || "";
    const nama = sp.get("nama") || "";

    const kontakNorm = kontak.trim();
    const namaNorm = nama.trim().toLowerCase();

    if (!kontakNorm || !namaNorm || namaNorm.length < 2) {
      return NextResponse.json(
        { error: "Pencarian riwayat wajib menggunakan nomor HP dan nama lengkap (minimal 2 karakter)." },
        { status: 400 },
      );
    }

    // Fetch ALL pendaftar records matching kontak prefix,
    // sorted by createdAt desc so the most recent registration shows first.
    const records = await db.pendaftar.findMany({
      where: {
        kontak: kontakNorm,
        nama: {
          contains: namaNorm,
          mode: "insensitive"
        }
      },
      orderBy: { createdAt: "desc" },
      include: { event: true },
    });

    if (records.length === 0) {
      return NextResponse.json(
        {
          error:
            "Belum ada riwayat pendaftaran untuk kombinasi nomor HP + nama depan ini. Periksa kembali input kamu.",
        },
        { status: 404 },
      );
    }

    // Aggregate stats from the fetched records. Single-pass for efficiency.
    let totalVerified = 0;
    let totalPending = 0;
    let totalRejected = 0;
    let totalPeople = 0;
    let earliestCreatedAt: Date | null = null;

    for (const r of records) {
      if (r.status === "verified") totalVerified += 1;
      else if (r.status === "pending_payment") totalPending += 1;
      else if (r.status === "rejected") totalRejected += 1;

      // Only count verified + pending participants toward total people —
      // rejected registrations don't actually attend the event.
      if (r.status !== "rejected") {
        totalPeople += r.jumlahOrang;
      }

      if (!earliestCreatedAt || r.createdAt < earliestCreatedAt) {
        earliestCreatedAt = r.createdAt;
      }
    }

    // Use the first record's nama (the most recent registration) as the
    // "display nama". This is the full nama (e.g. "Dewi Saraswati"), not
    // just the prefix the user typed — friendlier greeting.
    const displayNama = records[0].nama;

    // firstEventDate / memberSince: YYYY-MM-DD of the earliest createdAt.
    // These are the same value semantically (the volunteer "became a member"
    // when they registered for their first event). Kept as separate fields
    // in the response shape so the client can format them differently if
    // desired (e.g. "Member sejak Januari 2025" vs. an exact date chip).
    const firstEventDate = earliestCreatedAt
      ? earliestCreatedAt.toISOString().slice(0, 10)
      : null;

    const volunteer = {
      nama: displayNama,
      kontak: kontakNorm,
      totalRegistrations: records.length,
      totalVerified,
      totalPending,
      totalRejected,
      totalPeople,
      firstEventDate,
      memberSince: firstEventDate,
    };

    const history: Array<{
      kodeReferensi: string;
      nama: string;
      jumlahOrang: number;
      totalBayar: number;
      status: string;
      createdAt: string;
      verifiedAt: string | null;
      event: {
        judul: string;
        tanggal: string;
        lokasi: string;
        status: string;
      };
    }> = records.map((r: PendaftarWithEvent) => ({
      kodeReferensi: r.kodeReferensi,
      nama: r.nama,
      jumlahOrang: r.jumlahOrang,
      totalBayar: r.totalBayar,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      event: {
        judul: r.event.judul,
        tanggal: r.event.tanggal,
        lokasi: r.event.lokasi,
        status: r.event.status,
      },
    }));

    return NextResponse.json({ volunteer, history }, { status: 200 });
  } catch (err) {
    console.error("[api/volunteer-history]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
