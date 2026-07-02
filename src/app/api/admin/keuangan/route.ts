import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

const ADMIN_SECRET = process.env.ADMIN_TOKEN;

async function verifyAdminToken() {
  if (!ADMIN_SECRET) return true;
  const reqHeaders = await headers();
  return reqHeaders.get("x-admin-token") === ADMIN_SECRET;
}

export async function GET(request: Request) {
  if (!(await verifyAdminToken())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const idEvent = searchParams.get("idEvent");

    const whereClause = idEvent ? { idEvent } : {};

    const list = await db.keuangan.findMany({
      where: whereClause,
      orderBy: { tanggal: "desc" },
      include: { event: { select: { judul: true } } },
    });

    const verifiedPendaftars = await db.pendaftar.findMany({
      where: {
        ...whereClause,
        status: "verified",
      },
      include: { event: { select: { judul: true } } },
    });

    const pendaftarList = verifiedPendaftars.map(p => ({
      id: p.kodeReferensi,
      idEvent: p.idEvent,
      tipe: "IN",
      nominal: p.totalBayar,
      kategori: "Pemasukan Tiket",
      keterangan: `Pembayaran tiket - ${p.nama} (${p.jumlahOrang} orang)`,
      tanggal: p.verifiedAt || p.createdAt,
      event: p.event,
    }));

    const combinedList = [...list, ...pendaftarList].sort((a, b) => 
      new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
    );

    const income = combinedList.filter(k => k.tipe === "IN").reduce((acc, k) => acc + k.nominal, 0);
    const expense = combinedList.filter(k => k.tipe === "OUT").reduce((acc, k) => acc + k.nominal, 0);
    const balance = income - expense;

    return NextResponse.json({
      balance,
      income,
      expense,
      history: combinedList,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Gagal memuat data keuangan" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await verifyAdminToken())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tipe, nominal, kategori, keterangan, idEvent, tanggal } = body;

    if (!nominal || !kategori || !keterangan) {
      return NextResponse.json(
        { error: "Semua kolom wajib diisi" },
        { status: 400 }
      );
    }

    const resolvedTipe = tipe === "IN" ? "IN" : "OUT";

      const rec = await db.keuangan.create({
        data: {
          tipe: resolvedTipe,
          nominal: Number(nominal),
          kategori,
          keterangan,
          idEvent: idEvent || null,
          tanggal: tanggal ? new Date(tanggal) : new Date(),
        },
      });

    return NextResponse.json({ success: true, data: rec }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Gagal menyimpan pengeluaran" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await verifyAdminToken())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, tipe, nominal, kategori, keterangan, idEvent, tanggal } = body;

    if (!id || !nominal || !kategori || !keterangan) {
      return NextResponse.json(
        { error: "Semua kolom wajib diisi" },
        { status: 400 }
      );
    }

    const resolvedTipe = tipe === "IN" ? "IN" : "OUT";

    const rec = await db.keuangan.update({
      where: { id },
      data: {
        tipe: resolvedTipe,
        nominal: Number(nominal),
        kategori,
        keterangan,
        idEvent: idEvent || null,
        tanggal: tanggal ? new Date(tanggal) : new Date(),
      },
    });

    return NextResponse.json({ success: true, data: rec }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Gagal mengubah catatan keuangan" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await verifyAdminToken())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID tidak ditemukan" }, { status: 400 });
    }

    await db.keuangan.delete({
      where: { id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Gagal menghapus catatan keuangan" },
      { status: 500 }
    );
  }
}
