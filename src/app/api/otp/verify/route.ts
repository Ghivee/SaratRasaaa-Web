import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { nomorWa, otp } = await req.json();

    if (!nomorWa || !otp) {
      return NextResponse.json({ error: "Nomor WA dan OTP wajib diisi" }, { status: 400 });
    }

    // Find the latest OTP for this number
    const record = await db.otpVerification.findFirst({
      where: { nomorWa },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json({ error: "Kode OTP tidak ditemukan atau belum direquest." }, { status: 404 });
    }

    if (new Date() > record.expiresAt) {
      // Clean it up
      await db.otpVerification.delete({ where: { id: record.id } });
      return NextResponse.json({ error: "Kode OTP sudah kedaluwarsa. Silakan request ulang." }, { status: 400 });
    }

    if (record.otp !== otp) {
      return NextResponse.json({ error: "Kode OTP salah." }, { status: 400 });
    }

    // Verification successful! Clean up the record so it can't be used again.
    await db.otpVerification.delete({ where: { id: record.id } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[api/otp/verify]", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
