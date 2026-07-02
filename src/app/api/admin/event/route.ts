/**
 * Admin Event API — Saratrasaa
 *
 * Security fix #2 in action: the admin token is sent in the `X-Admin-Token`
 * header on every request and validated server-side via `verifyAdminToken`.
 * The token is NEVER hardcoded in any client bundle — the admin types it into
 * a password input that lives only in component state.
 *
 *   GET  /api/admin/event       — list all events (admin only)
 *   POST /api/admin/event       — create OR edit an event
 *                                 (edit when `id` is present in the body)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acquireLock, validateUpload, verifyAdminToken } from "@/lib/security";
import { supabase } from "@/lib/supabase";
const VALID_STATUSES = new Set(["upcoming", "active", "closed"]);
const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;

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
 * Persist a base64 data URL to /public/uploads and return the relative
 * web-facing path (`/uploads/<filename>`).
 */
async function saveDataUrl(
  dataUrl: string,
  filenamePrefix: string,
): Promise<{ relativePath: string; ext: string } | { error: string }> {
  if (!supabase) {
    return { error: "Koneksi penyimpanan file belum dikonfigurasi. Periksa SUPABASE_SERVICE_ROLE_KEY." };
  }
  const result = validateUpload(dataUrl);
  if (!result.ok || !result.ext) {
    return { error: result.error || "File tidak valid." };
  }
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
  if (!match) return { error: "Format file tidak valid." };

  const filename = `${filenamePrefix}-${Date.now()}-${Math.random()
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

  return { relativePath: publicUrlData.publicUrl, ext: result.ext };
}

/* -------------------------------------------------------------------------- */
/* GET — list all events (admin only)                                          */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const fail = requireAdmin(req);
  if (fail) return fail;

  const events = await db.event.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ events });
}

/* -------------------------------------------------------------------------- */
/* POST — create or edit an event                                              */
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

  // ----- field-by-field validation (Indonesian error messages) -----
  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  if (!judul) return NextResponse.json({ error: "judul wajib diisi." }, { status: 400 });

  const deskripsi = typeof body.deskripsi === "string" ? body.deskripsi.trim() : "";
  if (!deskripsi) return NextResponse.json({ error: "deskripsi wajib diisi." }, { status: 400 });

  const tanggal = typeof body.tanggal === "string" ? body.tanggal.trim() : "";
  if (!tanggal) return NextResponse.json({ error: "tanggal wajib diisi." }, { status: 400 });
  if (!TANGGAL_RE.test(tanggal)) {
    return NextResponse.json({ error: "tanggal harus format YYYY-MM-DD." }, { status: 400 });
  }

  const lokasi = typeof body.lokasi === "string" ? body.lokasi.trim() : "";
  if (!lokasi) return NextResponse.json({ error: "lokasi wajib diisi." }, { status: 400 });

  const harga = Number(body.harga);
  if (!Number.isInteger(harga) || harga <= 0) {
    return NextResponse.json({ error: "harga wajib diisi (bilangan bulat > 0)." }, { status: 400 });
  }

  const kuotaMax = Number(body.kuotaMax);
  if (!Number.isInteger(kuotaMax) || kuotaMax < 1 || kuotaMax > 1000) {
    return NextResponse.json(
      { error: "kuotaMax wajib diisi (bilangan bulat 1–1000)." },
      { status: 400 },
    );
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!status) return NextResponse.json({ error: "status wajib diisi." }, { status: 400 });
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status harus salah satu dari: upcoming, active, closed." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined;
  const fotoCover = typeof body.fotoCover === "string" ? body.fotoCover : undefined;

  // linkGrupWa — optional WhatsApp group link for registered participants
  const linkGrupWa =
    typeof body.linkGrupWa === "string" && body.linkGrupWa.trim()
      ? body.linkGrupWa.trim()
      : null;

  const waktuMulai =
    typeof body.waktuMulai === "string" && body.waktuMulai.trim()
      ? body.waktuMulai.trim()
      : null;

  const linkGmaps =
    typeof body.linkGmaps === "string" && body.linkGmaps.trim()
      ? body.linkGmaps.trim()
      : null;

  // ----- optional cover photo upload (validate + persist BEFORE touching DB) -----
  let fotoCoverPath: string | undefined;
  if (fotoCover) {
    const saved = await saveDataUrl(fotoCover, "cover");
    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
    fotoCoverPath = saved.relativePath;
  }

  // ----- shared payload (used by both create and update paths) -----
  const data = {
    judul,
    deskripsi,
    tanggal,
    waktuMulai,
    lokasi,
    linkGmaps,
    harga,
    kuotaMax,
    status,
    linkGrupWa,
    ...(fotoCoverPath ? { fotoCover: fotoCoverPath } : {}),
  };

  try {
    if (status === "active") {
      // Enforce the "only ONE active event at a time" rule under a mutex so two
      // concurrent admin requests cannot both end up with active rows.
      const release = await acquireLock("event:active");
      try {
        // Demote any OTHER currently-active events to `upcoming`.
        await db.event.updateMany({
          where: { status: "active", ...(id ? { id: { not: id } } : {}) },
          data: { status: "upcoming" },
        });

        if (id) {
          const updated = await db.event.update({ where: { id }, data });
          return NextResponse.json({
            ok: true,
            event: { id: updated.id, judul: updated.judul, status: updated.status },
          });
        }
        const created = await db.event.create({ data });
        return NextResponse.json({
          ok: true,
          event: { id: created.id, judul: created.judul, status: created.status },
        });
      } finally {
        release();
      }
    }

    // Non-active: no lock needed, just upsert.
    if (id) {
      const updated = await db.event.update({ where: { id }, data });
      return NextResponse.json({
        ok: true,
        event: { id: updated.id, judul: updated.judul, status: updated.status },
      });
    }
    const created = await db.event.create({ data });
    return NextResponse.json({
      ok: true,
      event: { id: created.id, judul: created.judul, status: created.status },
    });
  } catch (err) {
    // Prisma throws P2025 when `update` is called for a missing id.
    const message = (err as Error).message || "Gagal menyimpan event.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE — hapus event (admin only)                                           */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest) {
  const fail = requireAdmin(req);
  if (fail) return fail;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id || typeof id !== "string" || !id.trim()) {
    return NextResponse.json(
      { error: "Parameter 'id' wajib diisi." },
      { status: 400 },
    );
  }

  try {
    // Check if event exists
    const event = await db.event.findUnique({
      where: { id: id.trim() },
      select: {
        id: true,
        judul: true,
        _count: { select: { pendaftar: true } },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Event tidak ditemukan." },
        { status: 404 },
      );
    }

    // Delete event (cascade will handle pendaftar, peserta, checkIns)
    await db.event.delete({ where: { id: id.trim() } });

    return NextResponse.json({
      ok: true,
      message: `Event "${event.judul}" berhasil dihapus.`,
    });
  } catch (err) {
    const message = (err as Error).message || "Gagal menghapus event.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
