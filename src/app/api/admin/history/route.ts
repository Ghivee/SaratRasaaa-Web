/**
 * Admin History API — Saratrasaa
 *
 * Adds a post-event recap + documentation photos to an event whose status is
 * `closed`. Security fix #2: every request must carry `X-Admin-Token`.
 *
 *   POST /api/admin/history
 *     { idEvent, recap, fotos: [base64, base64, ...] }   (1–10 photos)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateUpload, verifyAdminToken } from "@/lib/security";
import { supabase } from "@/lib/supabase";
const MAX_RECAP_LEN = 2000;
const MIN_FOTOS = 1;
const MAX_FOTOS = 10;

/** Unauthorised response — same wording everywhere for consistency. */
function unauth() {
  return NextResponse.json({ error: "Token admin tidak valid." }, { status: 401 });
}

/** Read & verify the X-Admin-Token header. Returns null if valid. */
function requireAdmin(req: NextRequest): NextResponse | null {
  const tokenHeader = req.headers.get("x-admin-token");
  if (!verifyAdminToken(tokenHeader)) return unauth();
  return null;
}

/**
 * Persist one base64 data URL to /public/uploads.
 * Returns the relative web path or an error description.
 */
async function saveDataUrl(
  dataUrl: string,
  filenamePrefix: string,
): Promise<{ relativePath: string } | { error: string }> {
  if (!supabase) {
    return { error: "Koneksi penyimpanan file belum dikonfigurasi. Periksa SUPABASE_SERVICE_ROLE_KEY." };
  }
  const result = validateUpload(dataUrl);
  if (!result.ok || !result.ext) {
    return { error: result.error || "File tidak valid." };
  }
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!match) return { error: "Format file tidak valid." };

  const filename = `${filenamePrefix}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${result.ext}`;

  const bytes = Buffer.from(match[1], "base64");
  
  const { error } = await supabase.storage
    .from("uploads")
    .upload(filename, bytes, {
      contentType: result.mime,
      upsert: false,
    });

  if (error) {
    return { error: `Gagal menyimpan file: ${error.message}` };
  }

  const { data: publicUrlData } = supabase.storage
    .from("uploads")
    .getPublicUrl(filename);

  return { relativePath: publicUrlData.publicUrl };
}

/* -------------------------------------------------------------------------- */
/* POST — tambahHistory (recap + documentation photos)                         */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const fail = requireAdmin(req);
  if (fail) return fail;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body request bukan JSON valid." }, { status: 400 });
  }

  // ----- idEvent -----
  const idEvent = typeof body.idEvent === "string" ? body.idEvent.trim() : "";
  if (!idEvent) {
    return NextResponse.json({ error: "idEvent wajib diisi." }, { status: 400 });
  }

  const event = await db.event.findUnique({ where: { id: idEvent } });
  if (!event) {
    return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
  }
  if (event.status !== "closed") {
    return NextResponse.json(
      { error: `Recap hanya bisa ditambahkan untuk event berstatus closed (saat ini: ${event.status}).` },
      { status: 400 },
    );
  }

  // ----- recap -----
  const recap = typeof body.recap === "string" ? body.recap.trim() : "";
  if (!recap) {
    return NextResponse.json({ error: "recap wajib diisi." }, { status: 400 });
  }
  if (recap.length > MAX_RECAP_LEN) {
    return NextResponse.json(
      { error: `recap terlalu panjang (maks ${MAX_RECAP_LEN} karakter).` },
      { status: 400 },
    );
  }

  // ----- fotos -----
  if (!Array.isArray(body.fotos) || !body.fotos.every((f) => typeof f === "string")) {
    return NextResponse.json(
      { error: "fotos wajib berupa array berisi base64 data URL." },
      { status: 400 },
    );
  }
  const fotos = body.fotos as string[];
  const existing = event.fotoDok ? event.fotoDok.split(",").map((s) => s.trim()).filter(Boolean) : [];
  
  if (fotos.length + existing.length < 1) {
    return NextResponse.json(
      { error: `Dokumentasi harus memiliki minimal 1 foto.` },
      { status: 400 },
    );
  }
  if (fotos.length > MAX_FOTOS) {
    return NextResponse.json(
      { error: `Jumlah foto baru maksimal ${MAX_FOTOS}.` },
      { status: 400 },
    );
  }

  // ----- persist each photo (report which one fails) -----
  const savedPaths: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const prefix = `history-dok/dok-${idEvent}-${i}`;
    const saved = await saveDataUrl(fotos[i], prefix);
    if ("error" in saved) {
      return NextResponse.json(
        { error: `Foto ke-${i + 1} gagal: ${saved.error}` },
        { status: 400 },
      );
    }
    savedPaths.push(saved.relativePath);
  }

  // ----- append to existing fotoDok (comma-separated, preserve order) -----
  const mergedFotoDok = [...existing, ...savedPaths].join(",");

  try {
    await db.event.update({
      where: { id: idEvent },
      data: {
        recap,
        fotoDok: mergedFotoDok,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Gagal menyimpan recap: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    addedPhotos: savedPaths.length,
    event: { id: event.id, judul: event.judul },
  });
}

/* -------------------------------------------------------------------------- */
/* DELETE — hapusHistory / hapusFoto                                          */
/* -------------------------------------------------------------------------- */
export async function DELETE(req: NextRequest) {
  const fail = requireAdmin(req);
  if (fail) return fail;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body request bukan JSON valid." }, { status: 400 });
  }

  const idEvent = typeof body.idEvent === "string" ? body.idEvent.trim() : "";
  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";

  if (!idEvent) {
    return NextResponse.json({ error: "idEvent wajib diisi." }, { status: 400 });
  }

  const event = await db.event.findUnique({ where: { id: idEvent } });
  if (!event) {
    return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
  }

  const existingPhotos = event.fotoDok ? event.fotoDok.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (photoUrl) {
    // Delete single photo
    if (!existingPhotos.includes(photoUrl)) {
      return NextResponse.json({ error: "Foto tidak ditemukan di dokumentasi event ini." }, { status: 404 });
    }
    
    // Extract filename from URL to delete from Supabase
    // URL format: https://.../storage/v1/object/public/uploads/filename.ext
    const urlParts = photoUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    
    if (filename && supabase) {
      await supabase.storage.from("uploads").remove([filename]);
    }

    const newPhotos = existingPhotos.filter((url) => url !== photoUrl);
    
    try {
      await db.event.update({
        where: { id: idEvent },
        data: { fotoDok: newPhotos.join(",") },
      });
      return NextResponse.json({ ok: true, message: "Foto berhasil dihapus." });
    } catch (err) {
      return NextResponse.json({ error: `Gagal menghapus foto: ${(err as Error).message}` }, { status: 500 });
    }
  } else {
    // Delete entire documentation
    if (supabase && existingPhotos.length > 0) {
      const filenames = existingPhotos.map((url) => {
        const parts = url.split("/");
        return parts[parts.length - 1];
      }).filter(Boolean);
      
      if (filenames.length > 0) {
        await supabase.storage.from("uploads").remove(filenames);
      }
    }

    try {
      await db.event.update({
        where: { id: idEvent },
        data: { recap: null, fotoDok: "" },
      });
      return NextResponse.json({ ok: true, message: "Seluruh dokumentasi berhasil dihapus." });
    } catch (err) {
      return NextResponse.json({ error: `Gagal menghapus dokumentasi: ${(err as Error).message}` }, { status: 500 });
    }
  }
}
