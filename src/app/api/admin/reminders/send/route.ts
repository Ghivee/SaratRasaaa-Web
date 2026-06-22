import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { verifyAdminToken, getClientIp } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/reminders/send
 *
 * Generates a friendly Indonesian WhatsApp-style event reminder message for a
 * verified pendaftar whose event is upcoming (within 7 days). Uses the LLM
 * skill (z-ai-web-dev-sdk) to compose the message.
 *
 *   body: { kodeReferensi: string }
 *   →  { ok: true, message: string, shareUrl: string }
 *
 * Requires X-Admin-Token header (security fix #2 — never hardcoded in bundle).
 * Rate limited to 10 req/min/IP — LLM calls are expensive.
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

    // Compute daysUntil — same logic as the GET /api/admin/reminders endpoint.
    const iso = pendaftar.event.tanggal;
    const datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
    const [y, m, d] = datePart.split("-").map(Number);
    const eventMs =
      y && m && d ? Date.UTC(y, m - 1, d) : Number.NaN;
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const diffMs = Number.isFinite(eventMs) ? eventMs - now : 0;
    const daysUntil = Math.max(
      0,
      Math.ceil(diffMs / DAY_MS),
    );

    // Build the share URL — points back to the public status-check page so
    // the relawan can pull up their ticket / QR code quickly.
    const origin = req.nextUrl.origin;
    const shareUrl = `${origin}/?kode=${encodeURIComponent(pendaftar.kodeReferensi)}`;

    // Compose the LLM prompt with the event + pendaftar context.
    // thinking disabled for speed — this is a short, templated message.
    let message: string;
    try {
      const zai = await ZAI.create();
      const response = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah asisten yang menulis pesan pengingat event WhatsApp singkat dan hangat dalam Bahasa Indonesia untuk komunitas relawan Saratrasaa. Pesan maksimal 400 karakter, gunakan emoji secukupnya.",
          },
          {
            role: "user",
            content: `Buatkan pesan pengingat event untuk:\n\nNama: ${pendaftar.nama}\nEvent: ${pendaftar.event.judul}\nTanggal: ${pendaftar.event.tanggal}\nLokasi: ${pendaftar.event.lokasi}\nJumlah Orang: ${pendaftar.jumlahOrang}\nKode Referensi: ${pendaftar.kodeReferensi}\nHari menuju event: ${daysUntil}\n\nPesan harus berisi:\n- Sapaan ramah\n- Pengingat tanggal + lokasi event\n- Pengingat bawa kode referensi/tiket\n- Tips singkat (bawa botol minum, pakai sunscreen, dll)\n- Penutup hangat`,
          },
        ],
        thinking: { type: "disabled" },
      });

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

      // Hard cap at 800 chars to keep the WhatsApp URL sane even if the model
      // ignores the 400-char system instruction.
      message = content.slice(0, 800);
    } catch (llmErr) {
      console.error("[api/admin/reminders/send LLM]", llmErr);
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
      shareUrl,
      // Echo the pendaftar + event context so the dialog can render a summary
      // block (like NotificationDialog does) without a second round-trip.
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
