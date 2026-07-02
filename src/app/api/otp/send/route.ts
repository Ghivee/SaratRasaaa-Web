import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendFonnteMessage } from "@/lib/fonnte";

export async function POST(req: NextRequest) {
  try {
    const { nomorWa } = await req.json();

    if (!nomorWa) {
      return NextResponse.json({ error: "Nomor WA wajib diisi" }, { status: 400 });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiry to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Save to database, clean up existing OTPs for this number
    await db.$transaction([
      db.otpVerification.deleteMany({
        where: { nomorWa }
      }),
      db.otpVerification.create({
        data: {
          nomorWa,
          otp,
          expiresAt
        }
      })
    ]);

    // Send via Fonnte
    const message = `Halo! 👋\n\nKode Verifikasi (OTP) Saratrasaa Anda adalah:\n*${otp}*\n\nKode ini berlaku selama 5 menit. Jangan bagikan kode ini kepada siapapun.`;
    const success = await sendFonnteMessage(nomorWa, message);

    if (!success) {
      return NextResponse.json(
        { error: "Gagal mengirim pesan WhatsApp. Pastikan nomor valid atau coba lagi nanti." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[api/otp/send]", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
