import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateUpload } from "@/lib/security";
import { supabase } from "@/lib/supabase";
/**
 * POST /api/upload-bukti
 * Upload a bukti transfer (payment proof) for an existing Pendaftar.
 *
 * Body: { kodeReferensi, file }
 *   - file: base64 data URL (e.g. "data:image/jpeg;base64,...")
 *
 * Validation:
 *   - kodeReferensi must exist in Pendaftar (404 otherwise)
 *   - file goes through `validateUpload` from src/lib/security.ts which
 *     enforces MIME allowlist (jpeg/png/pdf), size cap (2MB), and
 *     magic-byte sniffing (security fix #4).
 *
 * On success: bytes are written to /public/uploads/bukti-<kode>-<ts>.<ext>
 * and the relative path `/uploads/<filename>` is stored on
 * Pendaftar.buktiTransfer.
 *
 * Response 200: { ok: true, url: "/uploads/<filename>" }
 * Response 400: validation error
 * Response 404: kodeReferensi not found
 * Response 500: unexpected server error
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body request tidak valid." },
        { status: 400 },
      );
    }

    const { kodeReferensi, file } = body as {
      kodeReferensi?: unknown;
      file?: unknown;
    };

    if (typeof kodeReferensi !== "string" || !kodeReferensi.trim()) {
      return NextResponse.json(
        { error: "kodeReferensi wajib diisi." },
        { status: 400 },
      );
    }
    if (typeof file !== "string" || !file.startsWith("data:")) {
      return NextResponse.json(
        { error: "File wajib diisi sebagai data URL base64." },
        { status: 400 },
      );
    }

    const kodeNorm = kodeReferensi.trim().toUpperCase();

    const existing = await db.pendaftar.findUnique({
      where: { kodeReferensi: kodeNorm },
      select: { kodeReferensi: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Kode referensi tidak ditemukan." },
        { status: 404 },
      );
    }

    const v = validateUpload(file);
    if (!v.ok || !v.ext) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    // Re-extract the base64 payload and decode to bytes.
    const match = /^data:([^;]+);base64,(.+)$/.exec(file);
    if (!match) {
      return NextResponse.json(
        { error: "Format file tidak valid." },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(match[2], "base64");

    const filename = `bukti-${kodeNorm}-${Date.now()}.${v.ext}`;
    
    const { data, error } = await supabase.storage
      .from("uploads")
      .upload(filename, bytes, {
        contentType: v.mime,
        upsert: false,
      });

    if (error) {
      console.error("[api/upload-bukti] Supabase error:", error);
      return NextResponse.json(
        { error: "Gagal menyimpan gambar ke cloud." },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("uploads")
      .getPublicUrl(filename);
    
    const relPath = publicUrlData.publicUrl;
    await db.pendaftar.update({
      where: { kodeReferensi: kodeNorm },
      data: { buktiTransfer: relPath },
    });

    return NextResponse.json({ ok: true, url: relPath }, { status: 200 });
  } catch (err) {
    console.error("[api/upload-bukti]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
