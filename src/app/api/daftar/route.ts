import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acquireLock, getClientIp } from "@/lib/security";
import { generateKodeReferensi } from "@/lib/saratrasa";
import { rateLimit } from "@/lib/rate-limit";
import { createPayment } from "@/lib/yobasepay";

/**
 * POST /api/daftar
 * Create a new Pendaftar on the active event.
 *
 * Body: { idEvent, peserta: [{ namaLengkap, namaPanggilan, instagram?, nomorWa }] }
 *   - peserta: array of 1–5 participants, each with:
 *     - namaLengkap: non-empty
 *     - namaPanggilan: non-empty
 *     - instagram: non-empty string
 *     - nomorWa: Indonesian phone, ^(\+62|62|0)8[1-9][0-9]{6,11}$
 *
 * Race-condition protected: the entire quota-check + kode_unik generation +
 * insert runs under `acquireLock("event:<idEvent>")` so concurrent
 * registrations cannot oversell the quota or collide on kode_unik.
 *
 * The first peserta's namaLengkap + nomorWa are stored on the Pendaftar
 * record (for backward compat with admin views + cek-status lookup).
 * All peserta data is stored in the Peserta table.
 *
 * Response 201: { kodeReferensi, totalBayar, hargaDasar, kodeUnik,
 *                 jumlahOrang, eventJudul, eventTanggal, eventLokasi, linkGrupWa }
 * Response 400: validation error
 * Response 404: event not found / not active
 * Response 409: kuota penuh — `{ error: "Kuota tidak mencukupi. Sisa slot: <sisa>." }`
 * Response 500: unexpected server error
 */

const WA_RE = /^(\+62|62|0)8[1-9][0-9]{6,11}$/;

interface PesertaInput {
  namaLengkap?: unknown;
  namaPanggilan?: unknown;
  umur?: unknown;
  alamat?: unknown;
  instagram?: unknown;
  nomorWa?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 registrations per IP per 60 seconds (anti-spam).
    const ip = getClientIp(req) || "unknown";
    const rl = rateLimit(`daftar:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak pendaftaran dari perangkat ini. Tunggu sebentar ya." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body request tidak valid." },
        { status: 400 },
      );
    }

    const { idEvent, peserta: pesertaRaw } = body as {
      idEvent?: unknown;
      peserta?: unknown;
    };

    if (typeof idEvent !== "string" || !idEvent.trim()) {
      return NextResponse.json(
        { error: "idEvent wajib diisi." },
        { status: 400 },
      );
    }

    // Validate peserta array
    if (!Array.isArray(pesertaRaw) || pesertaRaw.length === 0) {
      return NextResponse.json(
        { error: "Data peserta wajib diisi (minimal 1 orang)." },
        { status: 400 },
      );
    }

    const jml = pesertaRaw.length;
    if (jml < 1 || jml > 5) {
      return NextResponse.json(
        { error: "Jumlah peserta harus antara 1 dan 5 orang." },
        { status: 400 },
      );
    }

    // Validate each peserta
    const pesertaList: PesertaInput[] = pesertaRaw as PesertaInput[];
    for (let i = 0; i < pesertaList.length; i++) {
      const p = pesertaList[i];
      const label = `Peserta ${i + 1}`;

      if (typeof p.namaLengkap !== "string" || p.namaLengkap.trim().length < 2) {
        return NextResponse.json(
          { error: `${label}: Nama lengkap minimal 2 karakter.` },
          { status: 400 },
        );
      }
      if (typeof p.namaPanggilan !== "string" || p.namaPanggilan.trim().length < 1) {
        return NextResponse.json(
          { error: `${label}: Nama panggilan wajib diisi (min. 1 karakter).` },
          { status: 400 },
        );
      }
      if (typeof p.umur !== "number" || Number.isNaN(p.umur) || p.umur < 5 || p.umur > 100) {
        return NextResponse.json(
          { error: `${label}: Umur wajib diisi (5 - 100 tahun).` },
          { status: 400 },
        );
      }
      if (typeof p.alamat !== "string" || p.alamat.trim().length < 3) {
        return NextResponse.json(
          { error: `${label}: Alamat wajib diisi (min. 3 karakter).` },
          { status: 400 },
        );
      }
      if (typeof p.nomorWa !== "string" || !WA_RE.test(p.nomorWa.trim())) {
        return NextResponse.json(
          { error: `${label}: Nomor WhatsApp tidak valid. Contoh: 081234567890 atau +6281234567890.` },
          { status: 400 },
        );
      }
      // instagram is mandatory
      if (typeof p.instagram !== "string" || p.instagram.trim().length < 1) {
        return NextResponse.json(
          { error: `${label}: Instagram wajib diisi.` },
          { status: 400 },
        );
      }
    }

    const idEventTrim = idEvent.trim();

    // --- Critical section: hold the per-event lock for the whole flow. ---
    const release = await acquireLock(`event:${idEventTrim}`);
    try {
      const event = await db.event.findUnique({
        where: { id: idEventTrim },
      });
      if (!event || event.status !== "active") {
        return NextResponse.json(
          {
            error:
              "Event tidak ditemukan atau pendaftaran telah ditutup.",
          },
          { status: 404 },
        );
      }

      const agg = await db.pendaftar.aggregate({
        _sum: { jumlahOrang: true },
        where: {
          idEvent: event.id,
          status: { in: ["pending_payment", "verified"] },
        },
      });
      const terpakai = agg._sum.jumlahOrang ?? 0;
      const sisa = Math.max(0, event.kuotaMax - terpakai);

      if (terpakai + jml > event.kuotaMax) {
        return NextResponse.json(
          { error: `Kuota tidak mencukupi. Sisa slot: ${sisa}.` },
          { status: 409 },
        );
      }

      const kodeReferensi = await generateKodeReferensi();
      const totalBayar = jml * event.harga;

      // Panggil YoBasePay createpayment
      const ybResult = await createPayment(totalBayar);
      if (!ybResult.success) {
        return NextResponse.json(
          { error: `Gagal membuat transaksi pembayaran: ${ybResult.error}` },
          { status: 502 },
        );
      }

      const actualTotalBayar = ybResult.amount ?? totalBayar;
      const kodeUnik = actualTotalBayar - totalBayar;

      // Use first peserta's data for the Pendaftar record (backward compat)
      const firstPeserta = pesertaList[0];
      const primaryNama = (firstPeserta.namaLengkap as string).trim();
      const primaryWa = (firstPeserta.nomorWa as string).trim();

      // Create Pendaftar + all Peserta records in a transaction
      await db.$transaction([
        db.pendaftar.create({
          data: {
            kodeReferensi,
            idEvent: event.id,
            nama: primaryNama,
            kontak: primaryWa,
            jumlahOrang: jml,
            hargaDasar: totalBayar,
            kodeUnik: kodeUnik,
            totalBayar: actualTotalBayar,
            trxId: ybResult.trxId ?? null,
            qrImageUrl: ybResult.qrImageUrl ?? null,
            status: "pending_payment",
          },
        }),
        // Create Peserta records
        db.peserta.createMany({
          data: pesertaList.map((p, idx) => ({
            kodeReferensi,
            urutan: idx + 1,
            namaLengkap: (p.namaLengkap as string).trim(),
            namaPanggilan: (p.namaPanggilan as string).trim(),
            umur: p.umur as number,
            alamat: (p.alamat as string).trim(),
            instagram: (p.instagram as string).trim().replace(/^@/, ""),
            nomorWa: (p.nomorWa as string).trim(),
          })),
        }),
      ]);

      return NextResponse.json(
        {
          kodeReferensi,
          totalBayar: actualTotalBayar,
          jumlahOrang: jml,
          eventJudul: event.judul,
          eventTanggal: event.tanggal,
          eventLokasi: event.lokasi,
          linkGrupWa: event.linkGrupWa || null,
          trxId: ybResult.trxId ?? null,
          qrImageUrl: ybResult.qrImageUrl ?? null,
          expiredAt: ybResult.expiredAt ?? null,
        },
        { status: 201 },
      );
    } finally {
      // ALWAYS release the lock, even on early returns / thrown errors.
      release();
    }
  } catch (err) {
    console.error("[api/daftar]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
