import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { verifyAdminToken, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { formatIDR } from "@/lib/saratrasa";

/**
 * POST /api/admin/pendaftar/notify
 *
 * Generates a friendly Indonesian WhatsApp-style notification message for a
 * verified pendaftar, using the LLM skill (z-ai-web-dev-sdk). The message
 * includes the event details, kode referensi, total bayar, and a link to
 * check status. The admin can then copy the message or open WhatsApp with
 * the pendaftar's phone number pre-filled.
 *
 *   body: { kode: string }
 *   →  { ok: true, message: string, pendaftar: {...}, shareUrl: string }
 *
 * Requires X-Admin-Token header (security fix #2 — never hardcoded in bundle).
 * Rate limited to 10 requests / minute / IP — LLM calls are expensive, so we
 * cap the burst rate even for authenticated admins.
 *
 * NOTE: z-ai-web-dev-sdk MUST only run server-side. It is imported statically
 * at the top of this file (no `'use client'` here — this is a route handler).
 */
export async function POST(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json(
      { error: "Token admin tidak valid." },
      { status: 401 },
    );
  }

  // Rate limit — LLM calls are expensive. 10/min/IP is generous for admin use.
  const ip = getClientIp(req) || "unknown";
  const rl = rateLimit(`admin-notify:${ip}`, 10, 60_000);
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
    const { kode } = body as { kode?: string };

    if (!kode || typeof kode !== "string") {
      return NextResponse.json(
        { error: "Parameter kode wajib diisi." },
        { status: 400 },
      );
    }

    const kodeReferensi = kode.trim().toUpperCase();

    // Fetch the pendaftar + its event in a single Prisma call.
    const pendaftar = await db.pendaftar.findUnique({
      where: { kodeReferensi },
      include: {
        event: {
          select: {
            id: true,
            judul: true,
            tanggal: true,
            lokasi: true,
            harga: true,
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

    // Build the share URL — points back to the public status-check page.
    // The Caddy gateway exposes only port 3000 externally, so relative origin.
    const origin = req.nextUrl.origin;
    const shareUrl = `${origin}/?kode=${encodeURIComponent(pendaftar.kodeReferensi)}`;

    // Compose the LLM prompt with all the relevant context.
    // We disable "thinking" for speed — this is a short, templated message.
    let message: string;
    try {
      const zai = await ZAI.create();
      const response = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah asisten yang menulis pesan notifikasi WhatsApp singkat, ramah, dan hangat dalam Bahasa Indonesia untuk komunitas relawan Saratrasaa. Pesan maksimal 500 karakter, gunakan emoji secukupnya, sertakan kode referensi dan link cek status.",
          },
          {
            role: "user",
            content: `Buatkan pesan notifikasi untuk pendaftar yang baru saja terverifikasi:\n\nNama: ${pendaftar.nama}\nKode Referensi: ${pendaftar.kodeReferensi}\nEvent: ${pendaftar.event.judul}\nTanggal: ${pendaftar.event.tanggal}\nLokasi: ${pendaftar.event.lokasi}\nJumlah Orang: ${pendaftar.jumlahOrang}\nTotal Bayar: ${formatIDR(pendaftar.totalBayar)}\n\nPesan harus berisi:\n- Sapaan ramah\n- Konfirmasi verifikasi\n- Detail event (tanggal, lokasi)\n- Pengingat untuk simpan kode referensi\n- Link cek status: ${shareUrl}\n- Penutup hangat`,
          },
        ],
        thinking: { type: "disabled" },
      });

      // The SDK returns an OpenAI-style response. Extract the assistant text.
      const choice = response?.choices?.[0];
      const content =
        typeof choice?.message?.content === "string"
          ? choice.message.content.trim()
          : "";

      if (!content) {
        return NextResponse.json(
          { error: "LLM tidak mengembalikan pesan. Coba lagi." },
          { status: 502 },
        );
      }

      // Hard cap at 1000 chars to keep the WhatsApp URL sane even if the
      // model ignores the 500-char system instruction.
      message = content.slice(0, 1000);
    } catch (llmErr) {
      console.error("[api/admin/pendaftar/notify LLM]", llmErr);
      return NextResponse.json(
        {
          error:
            "Gagal membuat pesan dengan LLM. Periksa konfigurasi .z-ai-config atau coba lagi sebentar.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message,
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
    });
  } catch (err) {
    console.error("[api/admin/pendaftar/notify POST]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
