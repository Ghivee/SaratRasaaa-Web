import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acquireLock } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const { kodeReferensi } = (await req.json()) as { kodeReferensi?: string };

    if (!kodeReferensi) {
      return NextResponse.json(
        { error: "kodeReferensi diperlukan." },
        { status: 400 },
      );
    }

    // Acquire lock to prevent race conditions (e.g. concurrent confirm and cancel)
    const release = await acquireLock(kodeReferensi);
    try {
      const pendaftar = await db.pendaftar.findUnique({
        where: { kodeReferensi },
      });

      if (!pendaftar) {
        return NextResponse.json(
          { error: "Pendaftar tidak ditemukan." },
          { status: 404 },
        );
      }

      if (pendaftar.status !== "pending_payment") {
        return NextResponse.json(
          { error: "Pendaftar tidak dapat dibatalkan (status bukan pending)." },
          { status: 400 },
        );
      }

      await db.pendaftar.update({
        where: { kodeReferensi },
        data: {
          status: "failed",
          catatanAdmin: "Waktu pembayaran habis (otomatis).",
        },
      });

      return NextResponse.json({ success: true }, { status: 200 });
    } finally {
      release();
    }
  } catch (err) {
    console.error("[api/cancel-pendaftaran]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
