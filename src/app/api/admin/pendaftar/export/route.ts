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
      include: { event: { select: { judul: true, tanggal: true, lokasi: true } } },
      orderBy: { createdAt: "desc" },
    });

    // CSV headers
    const headers = [
      "Kode Referensi",
      "Nama",
      "Kontak",
      "Event",
      "Tanggal Event",
      "Lokasi",
      "Jumlah Orang",
      "Harga Dasar",
      "Kode Unik",
      "Total Bayar",
      "Status",
      "Bukti Transfer",
      "Catatan Admin",
      "Dibuat Pada",
      "Diverifikasi Pada",
    ];

    const escapeCsv = (val: unknown): string => {
      const s = val == null ? "" : String(val);
      // Quote if contains comma, quote, or newline
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvLines: string[] = [];
    csvLines.push(headers.map(escapeCsv).join(","));
    for (const r of rows) {
      const row = [
        r.kodeReferensi,
        r.nama,
        r.kontak,
        r.event.judul,
        r.event.tanggal,
        r.event.lokasi,
        r.jumlahOrang,
        r.hargaDasar,
        r.kodeUnik,
        r.totalBayar,
        r.status,
        r.buktiTransfer || "",
        r.catatanAdmin || "",
        r.createdAt.toISOString(),
        r.verifiedAt ? r.verifiedAt.toISOString() : "",
      ];
      csvLines.push(row.map(escapeCsv).join(","));
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
