import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const url = req.nextUrl;
    const idEvent = url.searchParams.get("idEvent");

    if (!idEvent) {
      return NextResponse.json({ error: "idEvent wajib diisi." }, { status: 400 });
    }

    const event = await db.event.findUnique({
      where: { id: idEvent },
      select: { judul: true, tanggal: true, lokasi: true, waktuMulai: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    }

    const pendaftar = await db.pendaftar.findMany({
      where: { idEvent, status: "verified" },
      include: {
        checkIns: {
          orderBy: { checkedInAt: "asc" },
          take: 1,
        },
      },
      orderBy: { nama: "asc" },
    });

    let eventStartObj: Date | null = null;
    if (event.tanggal) {
      const timeStr = event.waktuMulai && event.waktuMulai.length === 5 ? `${event.waktuMulai}:00` : "23:59:59";
      eventStartObj = new Date(`${event.tanggal}T${timeStr}+07:00`);
    }

    const report = pendaftar.map((p) => {
      let statusHadir: "Tepat Waktu" | "Telat" | "Tidak Hadir" = "Tidak Hadir";
      let checkedInAt: Date | null = null;

      if (p.checkIns.length > 0) {
        checkedInAt = p.checkIns[0].checkedInAt;
        if (eventStartObj) {
          if (checkedInAt <= eventStartObj) {
            statusHadir = "Tepat Waktu";
          } else {
            statusHadir = "Telat";
          }
        } else {
          statusHadir = "Tepat Waktu";
        }
      }

      return {
        kodeReferensi: p.kodeReferensi,
        nama: p.nama,
        kontak: p.kontak,
        jumlahOrang: p.jumlahOrang,
        checkedInAt,
        statusHadir,
      };
    });

    return NextResponse.json({ event, report });
  } catch (err) {
    console.error("[api/admin/check-in/report GET]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
