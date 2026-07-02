import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken } from "@/lib/security";

/**
 * GET /api/admin/pendaftar/export
 *
 * Export pendaftar as CSV for offline processing / check-in sheets.
 * Optional query: ?idEvent=<id>&status=<status>
 *
 * Requires X-Admin-Token header.
 * Returns a text/csv file download.
 */
export async function GET(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const url = req.nextUrl;
    const idEvent = url.searchParams.get("idEvent") || undefined;
    const status = url.searchParams.get("status") || undefined;

    const where: { idEvent?: string; status?: string } = {};
    if (idEvent) where.idEvent = idEvent;
    if (status) where.status = status;

    const rows = await db.pendaftar.findMany({
      where,
      include: { 
        event: { select: { judul: true, tanggal: true, lokasi: true } },
        peserta: { orderBy: { urutan: "asc" } }
      },
      orderBy: { createdAt: "desc" },
    });

    const origin = req.nextUrl.origin;

    // CSV headers
    const headers = [
      "Event",
      "Tanggal Event",
      "Lokasi Event",
      "Kode Referensi",
      "Pendaftar Utama",
      "Kontak Pendaftar",
      "Status Pembayaran",
      "Jumlah Orang",
      "Total Bayar",
      "Urutan Peserta",
      "Nama Lengkap",
      "Nama Panggilan",
      "Umur",
      "Alamat",
      "Nomor WhatsApp",
      "Instagram",
      "Foto Diri URL",
    ];

    const escapeCsv = (val: unknown): string => {
      const s = val == null ? "" : String(val);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvLines: string[] = [];
    csvLines.push(headers.map(escapeCsv).join(","));
    for (const r of rows) {
      if (r.peserta.length === 0) {
        // Fallback for older entries without peserta rows
        const row = [
          r.event.judul,
          r.event.tanggal,
          r.event.lokasi,
          r.kodeReferensi,
          r.nama,
          r.kontak,
          r.status,
          r.jumlahOrang,
          r.totalBayar,
          "", // Urutan
          "", // Nama Lengkap
          "", // Nama Panggilan
          "", // Umur
          "", // Alamat
          "", // WA
          "", // IG
          "", // Foto
        ];
        csvLines.push(row.map(escapeCsv).join(","));
      } else {
        for (const p of r.peserta) {
          const fotoUrl = p.fotoDiri ? `${origin}${p.fotoDiri.startsWith("/") ? "" : "/"}${p.fotoDiri}` : "";
          const row = [
            r.event.judul,
            r.event.tanggal,
            r.event.lokasi,
            r.kodeReferensi,
            r.nama,
            r.kontak,
            r.status,
            r.jumlahOrang,
            r.totalBayar,
            p.urutan,
            p.namaLengkap,
            p.namaPanggilan,
            p.umur || "",
            p.alamat || "",
            p.nomorWa,
            p.instagram || "",
            fotoUrl,
          ];
          csvLines.push(row.map(escapeCsv).join(","));
        }
      }
    }

    const csv = csvLines.join("\n");
    // Prepend BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF";

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pendaftar-saratrasaa-${stamp}.csv"`,
      },
    });
  } catch (err) {
    console.error("[api/admin/pendaftar/export]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
