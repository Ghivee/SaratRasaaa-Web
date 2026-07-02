import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { formatIDR } from "@/lib/saratrasa";

/**
 * POST /api/admin/pendaftar/notify
 *
 * Membuat pesan notifikasi WhatsApp untuk pendaftar yang sudah terverifikasi.
 * Pesan dibuat menggunakan template statis dalam Bahasa Indonesia yang hangat
 * dan ramah, berisi detail event, kode referensi, total bayar, dan link
 * cek status.
 *
 *   body: { kode: string }
 *   →  { ok: true, message: string, pendaftar: {...}, shareUrl: string }
 *
 * Memerlukan header X-Admin-Token (tidak pernah di-hardcode di frontend).
 * Rate limit: 10 request / menit / IP.
 */

function generateNotifyMessage(params: {
  nama: string;
  kodeReferensi: string;
  eventJudul: string;
  eventTanggal: string;
  eventLokasi: string;
  jumlahOrang: number;
  totalBayar: number;
  shareUrl: string;
}): string {
  const { nama, kodeReferensi, eventJudul, eventTanggal, eventLokasi, jumlahOrang, totalBayar, shareUrl } = params;
  return [
    `Halo ${nama}! 👋`,
    ``,
    `Yeay, pembayaranmu sudah kami verifikasi! ✅`,
    ``,
    `📋 *Detail Pendaftaran:*`,
    `🎪 Event: ${eventJudul}`,
    `📅 Tanggal: ${eventTanggal}`,
    `📍 Lokasi: ${eventLokasi}`,
    `👥 Jumlah Orang: ${jumlahOrang}`,
    `💰 Total Bayar: ${formatIDR(totalBayar)}`,
    ``,
    `🎫 Kode Referensi: *${kodeReferensi}*`,
    `Simpan kode ini baik-baik ya, kamu akan butuhkan saat check-in nanti.`,
    ``,
    `🔗 Cek status & tiketmu di sini:`,
    shareUrl,
    ``,
    `Sampai jumpa di lokasi! 🌿💚`,
    `— Tim Saratrasaa`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json(
      { error: "Token admin tidak valid." },
      { status: 401 },
    );
  }

  const ip = getClientIp(req) || "unknown";
  const rl = rateLimit(`admin-notify:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan pesan. Coba lagi sebentar." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = await req.json();
    const { kode, kodes } = body as { kode?: string; kodes?: string[] };

    const kodeList = kodes || (kode ? [kode] : []);

    if (!kodeList || kodeList.length === 0) {
      return NextResponse.json(
        { error: "Parameter kode wajib diisi." },
        { status: 400 },
      );
    }

    const cleanKodes = kodeList.map((k) => k.trim().toUpperCase());

    const pendaftarList = await db.pendaftar.findMany({
      where: { kodeReferensi: { in: cleanKodes } },
      include: {
        event: {
          select: {
            id: true,
            judul: true,
            tanggal: true,
            lokasi: true,
          },
        },
        peserta: {
          select: { namaPanggilan: true },
          orderBy: { urutan: "asc" },
          take: 1,
        },
      },
    });

    if (!pendaftarList || pendaftarList.length === 0) {
      return NextResponse.json(
        { error: "Pendaftar tidak ditemukan." },
        { status: 404 },
      );
    }

    const origin = req.nextUrl.origin;
    
    const results = pendaftarList.map((pendaftar) => {
      const shareUrl = `${origin}/?kode=${encodeURIComponent(pendaftar.kodeReferensi)}`;
      return {
        pendaftar: {
          kodeReferensi: pendaftar.kodeReferensi,
          nama: pendaftar.nama,
          kontak: pendaftar.kontak,
          jumlahOrang: pendaftar.jumlahOrang,
          totalBayar: pendaftar.totalBayar,
          status: pendaftar.status,
        },
        event: {
          judul: pendaftar.event.judul,
          tanggal: pendaftar.event.tanggal,
          lokasi: pendaftar.event.lokasi,
        },
        shareUrl,
      };
    });

    return NextResponse.json({
      ok: true,
      data: results,
    });
  } catch (err) {
    console.error("[api/admin/pendaftar/notify POST]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
