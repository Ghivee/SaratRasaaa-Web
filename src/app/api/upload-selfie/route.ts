import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateUpload } from "@/lib/security";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/upload-selfie
 * Upload a selfie for an existing Peserta.
 *
 * Body: { kodeReferensi, urutan, file }
 *   - file: base64 data URL (e.g. "data:image/jpeg;base64,...")
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body request tidak valid." }, { status: 400 });
    }

    const { kodeReferensi, urutan, file } = body as { kodeReferensi?: string; urutan?: number; file?: string; };

    if (!kodeReferensi || !urutan || !file) {
      return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
    }

    const kodeNorm = kodeReferensi.trim().toUpperCase();

    const peserta = await db.peserta.findFirst({
      where: { kodeReferensi: kodeNorm, urutan: Number(urutan) },
      select: { id: true },
    });
    if (!peserta) {
      return NextResponse.json({ error: "Peserta tidak ditemukan." }, { status: 404 });
    }

    const v = validateUpload(file);
    if (!v.ok || !v.ext) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    const match = /^data:([^;]+);base64,(.+)$/.exec(file);
    if (!match) {
      return NextResponse.json({ error: "Format file tidak valid." }, { status: 400 });
    }
    const bytes = Buffer.from(match[2], "base64");

    const filename = `foto-diri/${kodeNorm}-${urutan}-${Date.now()}.${v.ext}`;

    if (!supabase) {
      return NextResponse.json(
        { error: "Koneksi penyimpanan file belum dikonfigurasi. Periksa SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 },
      );
    }
    
    const { error } = await supabase.storage
      .from("uploads")
      .upload(filename, bytes, { contentType: v.mime, upsert: false });

    if (error) {
      console.error("[api/upload-selfie] Supabase error:", error);
      return NextResponse.json({ error: "Gagal menyimpan foto ke cloud." }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from("uploads").getPublicUrl(filename);
    const relPath = publicUrlData.publicUrl;

    await db.peserta.update({
      where: { id: peserta.id },
      data: { fotoDiri: relPath },
    });

    return NextResponse.json({ ok: true, url: relPath }, { status: 200 });
  } catch (err) {
    console.error("[api/upload-selfie]", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
