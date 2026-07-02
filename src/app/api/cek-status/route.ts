import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { validateStatusLookup, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

type PendaftarWithEventAndPeserta = Prisma.PendaftarGetPayload<{
  include: { event: true, peserta: true };
}>;

/**
 * GET /api/cek-status?kode=SRT-XXXXXX
 * GET /api/cek-status?kontak=...&nama=...
 *
 * IDOR-safe: requires either kode_referensi OR (kontak + nama depan) together.
 * HP-only search is rejected. Enforced by `validateStatusLookup` from
 * src/lib/security.ts (security fix #5).
 *
 * Always returns at most ONE record.
 *
 * Response 200: { pendaftar: { kodeReferensi, nama, kontak, jumlahOrang,
 *                               totalBayar, kodeUnik, hargaDasar, status,
 *                               verifiedAt, createdAt,
 *                               event: { judul, tanggal, lokasi } } }
 * Response 400: invalid lookup query (with `error`)
 * Response 404: not found (with `error`)
 * Response 500: unexpected server error
 */
export async function GET(req: NextRequest) {
  try {
    // Rate limit: 60 status checks per IP per 60 seconds (anti-brute-force).
    const ip = getClientIp(req) || "unknown";
    const rl = rateLimit(`cekstatus:${ip}`, 60, 60_000);
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
    const kode = sp.get("kode") || undefined;
    const kontak = sp.get("kontak") || undefined;
    const otp = sp.get("otp") || undefined;

    const lookup = validateStatusLookup({
      kodeReferensi: kode,
      kontak,
      otp,
    });
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: 400 });
    }

    let pendaftar: PendaftarWithEventAndPeserta | null = null;

    if (lookup.mode === "kode") {
      const kodeNorm = (kode as string).trim().toUpperCase();
      pendaftar = await db.pendaftar.findUnique({
        where: { kodeReferensi: kodeNorm },
        include: { event: true, peserta: true },
      });
    } else if (lookup.mode === "otp") {
      const kontakNorm = (kontak as string).trim();
      const otpNorm = (otp as string).trim();

      // Verify OTP in db
      const validOtp = await db.otpVerification.findFirst({
        where: {
          nomorWa: kontakNorm,
          otp: otpNorm,
          expiresAt: { gt: new Date() }
        }
      });

      if (!validOtp) {
        return NextResponse.json(
          { error: "Kode OTP tidak valid atau sudah kedaluwarsa." },
          { status: 400 },
        );
      }

      // Take the most recent match if multiple exist
      pendaftar = await db.pendaftar.findFirst({
        where: { kontak: kontakNorm },
        orderBy: { createdAt: "desc" },
        include: { event: true, peserta: true },
      });
    }

    if (!pendaftar) {
      return NextResponse.json(
        {
          error:
            "Pendaftaran tidak ditemukan. Periksa kembali kode referensi atau kombinasi nomor HP + nama depan kamu.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        pendaftar: {
          kodeReferensi: pendaftar.kodeReferensi,
          nama: pendaftar.nama,
          kontak: pendaftar.kontak,
          jumlahOrang: pendaftar.jumlahOrang,
          totalBayar: pendaftar.totalBayar,
          kodeUnik: pendaftar.kodeUnik,
          hargaDasar: pendaftar.hargaDasar,
          status: pendaftar.status,
          verifiedAt: pendaftar.verifiedAt,
          createdAt: pendaftar.createdAt,
          catatanAdmin: pendaftar.catatanAdmin,
          event: {
            judul: pendaftar.event.judul,
            tanggal: pendaftar.event.tanggal,
            lokasi: pendaftar.event.lokasi,
          },
          peserta: pendaftar.peserta.map(p => ({
            id: p.id,
            namaLengkap: p.namaLengkap,
            fotoDiriUrl: p.fotoDiriUrl,
          })),
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/cek-status]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
