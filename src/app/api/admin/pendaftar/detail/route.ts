import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/pendaftar/detail?kode=<kodeReferensi>
 *
 * Returns full detail for a single pendaftar — used by the admin
 * pendaftar detail modal. Includes the full event info and the
 * bukti transfer URL (resolved to a full path).
 *
 * Requires X-Admin-Token header.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const kode = req.nextUrl.searchParams.get("kode");
    if (!kode) {
      return NextResponse.json(
        { error: "Parameter kode wajib diisi." },
        { status: 400 },
      );
    }

    const pendaftar = await db.pendaftar.findUnique({
      where: { kodeReferensi: kode },
      include: {
        event: {
          select: {
            id: true,
            judul: true,
            tanggal: true,
            lokasi: true,
            harga: true,
            kuotaMax: true,
          },
        },
        peserta: {
          orderBy: { urutan: "asc" },
        },
      },
    });

    if (!pendaftar) {
      return NextResponse.json(
        { error: "Pendaftar tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      pendaftar: {
        kodeReferensi: pendaftar.kodeReferensi,
        nama: pendaftar.nama,
        kontak: pendaftar.kontak,
        jumlahOrang: pendaftar.jumlahOrang,
        hargaDasar: pendaftar.hargaDasar,
        kodeUnik: pendaftar.kodeUnik,
        totalBayar: pendaftar.totalBayar,
        status: pendaftar.status,
        catatanAdmin: pendaftar.catatanAdmin,
        buktiTransfer: pendaftar.buktiTransfer,
        createdAt: pendaftar.createdAt,
        verifiedAt: pendaftar.verifiedAt,
        event: pendaftar.event,
        peserta: pendaftar.peserta.map((p) => ({
          urutan: p.urutan,
          namaLengkap: p.namaLengkap,
          namaPanggilan: p.namaPanggilan,
          umur: p.umur,
          alamat: p.alamat,
          fotoDiri: p.fotoDiri,
          instagram: p.instagram,
          nomorWa: p.nomorWa,
        })),
      },
    });
  } catch (err) {
    console.error("[api/admin/pendaftar/detail]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
