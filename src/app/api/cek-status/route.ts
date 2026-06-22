import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { validateStatusLookup, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

type PendaftarWithEvent = Prisma.PendaftarGetPayload<{
  include: { event: true };
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
    // Rate limit: 20 status checks per IP per 60 seconds (anti-brute-force).
    const ip = getClientIp(req) || "unknown";
    const rl = rateLimit(`cekstatus:${ip}`, 20, 60_000);
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
    const nama = sp.get("nama") || undefined;

    const lookup = validateStatusLookup({
      kodeReferensi: kode,
      kontak,
      namaDepan: nama,
    });
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: 400 });
    }

    let pendaftar: PendaftarWithEvent | null = null;

    if (lookup.mode === "kode") {
      const kodeNorm = (kode as string).trim().toUpperCase();
      pendaftar = await db.pendaftar.findUnique({
        where: { kodeReferensi: kodeNorm },
        include: { event: true },
      });
    } else if (lookup.mode === "kombinasi") {
      const kontakNorm = (kontak as string).trim();
      const namaNorm = (nama as string).trim();
      // SQLite doesn't support `mode: "insensitive"`; rely on `startsWith`
      // for the nama depan. Take the most recent match if multiple exist.
      pendaftar = await db.pendaftar.findFirst({
        where: {
          kontak: kontakNorm,
          nama: { startsWith: namaNorm },
        },
        orderBy: { createdAt: "desc" },
        include: { event: true },
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
