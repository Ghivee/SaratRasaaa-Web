import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminToken, acquireLock } from "@/lib/security";

/**
 * Admin pendaftar management.
 *
 * GET  /api/admin/pendaftar           — list all pendaftar (optionally filtered by ?idEvent= or ?status=)
 * POST /api/admin/pendaftar           — verify or reject a pendaftar
 *   body: { kodeReferensi, action: "verify" | "reject" }
 *
 * All routes require X-Admin-Token header (security fix #2 — never hardcoded).
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

    const pendaftar = await db.pendaftar.findMany({
      where,
      include: {
        event: {
          select: { judul: true, tanggal: true, lokasi: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ pendaftar });
  } catch (err) {
    console.error("[api/admin/pendaftar GET]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const tokenOk = verifyAdminToken(req.headers.get("x-admin-token"));
  if (!tokenOk) {
    return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { kodeReferensi, action, catatan } = body as {
      kodeReferensi?: string;
      action?: string;
      catatan?: string;
    };

    if (!kodeReferensi || !action) {
      return NextResponse.json(
        { error: "kodeReferensi dan action wajib diisi." },
        { status: 400 },
      );
    }

    if (action !== "verify" && action !== "reject") {
      return NextResponse.json(
        { error: "Action harus 'verify' atau 'reject'." },
        { status: 400 },
      );
    }

    // Lock to prevent race with webhook auto-verification.
    const release = await acquireLock(`pendaftar:${kodeReferensi}`);
    try {
      const existing = await db.pendaftar.findUnique({
        where: { kodeReferensi },
        select: { kodeReferensi: true, status: true },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Pendaftar tidak ditemukan." },
          { status: 404 },
        );
      }

      if (existing.status !== "pending_payment") {
        return NextResponse.json(
          {
            error: `Status saat ini: ${existing.status}. Hanya pending_payment yang bisa diubah manual.`,
          },
          { status: 409 },
        );
      }

      const newStatus = action === "verify" ? "verified" : "rejected";
      const updateData =
        action === "verify"
          ? { status: newStatus, verifiedAt: new Date() }
          : {
              status: newStatus,
              catatanAdmin: catatan?.trim() ? catatan.trim().slice(0, 500) : null,
            };

      await db.pendaftar.update({
        where: { kodeReferensi },
        data: updateData,
      });

      return NextResponse.json({
        ok: true,
        kodeReferensi,
        status: newStatus,
      });
    } finally {
      release();
    }
  } catch (err) {
    console.error("[api/admin/pendaftar POST]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
