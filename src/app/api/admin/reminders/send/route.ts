import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/reminders/send
 *
 * Membuat pesan pengingat event WhatsApp untuk pendaftar yang sudah
 * terverifikasi dan event-nya akan segera berlangsung (dalam 7 hari).
 * Pesan dibuat menggunakan template statis dalam Bahasa Indonesia.
 *
 *   body: { kodeReferensi: string }
 *   →  { ok: true, message: string, shareUrl: string }
 *
 * Memerlukan header X-Admin-Token.
 * Rate limit: 10 req/menit/IP.
 */

function generateReminderMessage(params: {
  nama: string;
  eventJudul: string;
  eventTanggal: string;
  eventLokasi: string;
  jumlahOrang: number;
  kodeReferensi: string;
  daysUntil: number;
}): string {
  const { nama, eventJudul, eventTanggal, eventLokasi, jumlahOrang, kodeReferensi, daysUntil } = params;

  const urgency = daysUntil <= 1
    ? "🔔 *BESOK!*"
    : daysUntil <= 3
      ? `⏰ *${daysUntil} hari lagi!*`
      : `📅 *${daysUntil} hari lagi*`;

  return [
    `Halo ${nama}! 👋`,
    ``,
    `Jangan lupa ya, event kita ${urgency}`,
    ``,
    `🎪 *${eventJudul}*`,
    `📅 Tanggal: ${eventTanggal}`,
    `📍 Lokasi: ${eventLokasi}`,
    `👥 Peserta: ${jumlahOrang} orang`,
    `🎫 Kode: *${kodeReferensi}*`,
    ``,
    `📝 *Tips persiapan:*`,
    `• Bawa botol minum sendiri 💧`,
    `• Pakai sunscreen & topi 🧴`,
    `• Pakai baju yang nyaman & sepatu tertutup 👟`,
    `• Bawa semangat dan senyuman! 😄`,
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
  const rl = rateLimit(`admin-reminder-send:${ip}`, 10, 60_000);
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
    const { kodeReferensi: kodeRaw } = body as { kodeReferensi?: string };

    if (!kodeRaw || typeof kodeRaw !== "string") {
      return NextResponse.json(
        { error: "Parameter kodeReferensi wajib diisi." },
        { status: 400 },
      );
    }

    const kodeReferensi = kodeRaw.trim().toUpperCase();

    const pendaftar = await db.pendaftar.findUnique({
      where: { kodeReferensi },
      include: {
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
        { error: "Pendaftar tidak ditemukan." },
        { status: 404 },
      );
    }

    if (pendaftar.status !== "verified") {
      return NextResponse.json(
        {
          error:
            "Pendaftar belum terverifikasi. Hanya pendaftar terverifikasi yang bisa dikirimi pengingat.",
        },
        { status: 400 },
      );
    }

    // Hitung hari menuju event
    const iso = pendaftar.event.tanggal;
    const datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
    const [y, m, d] = datePart.split("-").map(Number);
    const eventMs = y && m && d ? Date.UTC(y, m - 1, d) : Number.NaN;
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const diffMs = Number.isFinite(eventMs) ? eventMs - now : 0;
    const daysUntil = Math.max(0, Math.ceil(diffMs / DAY_MS));

    const origin = req.nextUrl.origin;
    const shareUrl = `${origin}/?kode=${encodeURIComponent(pendaftar.kodeReferensi)}`;

    const message = generateReminderMessage({
      nama: pendaftar.nama,
      eventJudul: pendaftar.event.judul,
      eventTanggal: pendaftar.event.tanggal,
      eventLokasi: pendaftar.event.lokasi,
      jumlahOrang: pendaftar.jumlahOrang,
      kodeReferensi: pendaftar.kodeReferensi,
      daysUntil,
    });

    return NextResponse.json({
      ok: true,
      message,
      shareUrl,
      pendaftar: {
        kodeReferensi: pendaftar.kodeReferensi,
        nama: pendaftar.nama,
        kontak: pendaftar.kontak,
        jumlahOrang: pendaftar.jumlahOrang,
        status: pendaftar.status,
      },
      event: {
        judul: pendaftar.event.judul,
        tanggal: pendaftar.event.tanggal,
        lokasi: pendaftar.event.lokasi,
      },
      daysUntil,
    });
  } catch (err) {
    console.error("[api/admin/reminders/send POST]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
