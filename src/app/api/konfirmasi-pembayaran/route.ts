import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acquireLock } from "@/lib/security";

/**
 * POST /api/konfirmasi-pembayaran
 * Dipanggil frontend saat polling YoBasePay check_public return SUCCESS.
 *
 * Body: { trxId: string, kodeReferensi: string }
 * Response 200: { ok: true, kodeReferensi }
 * Response 200: { ok: true, alreadyVerified: true } — idempoten
 * Response 404: tidak ditemukan
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
    }

    const { trxId, kodeReferensi } = body as { trxId?: string; kodeReferensi?: string };
    if (!trxId || !kodeReferensi) {
      return NextResponse.json({ error: "trxId dan kodeReferensi wajib diisi." }, { status: 400 });
    }

    const release = await acquireLock(`konfirmasi:${kodeReferensi}`);
    try {
      const pendaftar = await db.pendaftar.findUnique({
        where: { kodeReferensi: kodeReferensi.trim().toUpperCase() },
        select: { kodeReferensi: true, status: true, trxId: true, idEvent: true, totalBayar: true },
      });

      if (!pendaftar) {
        return NextResponse.json({ error: "Pendaftaran tidak ditemukan." }, { status: 404 });
      }

      // Idempoten: sudah verified sebelumnya
      if (pendaftar.status === "verified") {
        return NextResponse.json({ ok: true, alreadyVerified: true });
      }

      // Cocokkan trxId (optional extra check)
      if (pendaftar.trxId && pendaftar.trxId !== trxId) {
        return NextResponse.json({ error: "trxId tidak cocok." }, { status: 400 });
      }

      await db.pendaftar.update({
        where: { kodeReferensi: pendaftar.kodeReferensi },
        data: { status: "verified", verifiedAt: new Date() },
      });

      // Tambahkan log ke webhookLog agar tampil di "Payment History" tab admin
      // meskipun diverifikasi melalui polling frontend, bukan webhook murni.
      await db.webhookLog.create({
        data: {
          ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0] || "polling-client",
          eventId: pendaftar.kodeReferensi,
          payload: JSON.stringify({
            source: "frontend_polling",
            trxId,
            kodeReferensi,
          }),
          status: "verified_via_polling",
        },
      });

      return NextResponse.json({ ok: true, kodeReferensi: pendaftar.kodeReferensi });
    } finally {
      release();
    }
  } catch (err) {
    console.error("[api/konfirmasi-pembayaran]", err);
    return NextResponse.json({ error: "Terjadi kesalahan." }, { status: 500 });
  }
}
