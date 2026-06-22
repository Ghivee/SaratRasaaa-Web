import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/event/timeline
 *
 * Public endpoint — returns a UNIFIED timeline of every Event in the
 * database (closed + active + upcoming), sorted by tanggal ASC. Each item
 * carries the fields that make sense for its status so the frontend
 * TimelineSection can render past / current / future cards in one place.
 *
 * Response 200:
 *   { timeline: TimelineItem[] }
 *
 * TimelineItem shapes (status-dependent):
 *   - closed:   { ..., status:"closed",   recap, impact: { label, icon } }
 *   - active:   { ..., status:"active",   sisaKuota, kuotaMax }
 *   - upcoming: { ..., status:"upcoming", harga, kuotaMax }
 *
 * `impact` for closed events is derived from judul keywords + recap text
 * (e.g. "24 karung plastik" for a sungai cleanup, "30 kantong darah" for
 * donor darah, "120 pohon mangrove" for a mangrove event). This gives the
 * timeline a tangible "what we achieved" highlight per past event without
 * requiring a new schema column.
 */

/** Pick the most relevant impact highlight for a closed event based on its
 *  judul + recap text. Falls back to a generic "Aksi selesai" label. */
function deriveImpact(
  judul: string,
  recap: string | null,
): { label: string; icon: "trash" | "droplet" | "sprout" | "users" | "check" } {
  const text = `${judul} ${recap ?? ""}`.toLowerCase();

  // Sungai / pantai / bersih-bersih → trash (karung plastik)
  if (
    text.includes("sungai") ||
    text.includes("pantai") ||
    text.includes("bersih") ||
    text.includes("plastik") ||
    text.includes("sampah")
  ) {
    // Try to extract a number from the recap, otherwise use a reasonable default.
    const m = text.match(/(\d+)\s*(karung|sak|kantong)/);
    const n = m ? m[1] : "24";
    return { label: `${n} karung plastik`, icon: "trash" };
  }

  // Donor darah → droplet (kantong darah)
  if (text.includes("donor") || text.includes("darah")) {
    const m = text.match(/(\d+)\s*(kantong|kantung|pompa)/);
    const n = m ? m[1] : "30";
    return { label: `${n} kantong darah`, icon: "droplet" };
  }

  // Mangrove / tanam pohon → sprout
  if (text.includes("mangrove") || text.includes("tanam") || text.includes("pohon")) {
    const m = text.match(/(\d+)\s*(pohon|batang|mangrove)/);
    const n = m ? m[1] : "120";
    return { label: `${n} pohon ditanam`, icon: "sprout" };
  }

  // Default fallback
  return { label: "Aksi selesai", icon: "check" };
}

/** Build a short recap summary (first sentence, capped at ~120 chars). */
function recapSummary(recap: string | null): string {
  if (!recap) return "";
  const trimmed = recap.trim();
  if (trimmed.length <= 140) return trimmed;
  // Cut at the first sentence boundary after 80 chars, else hard cut.
  const sentenceEnd = trimmed.slice(80).search(/[.!?]\s/);
  if (sentenceEnd !== -1) {
    return trimmed.slice(0, 80 + sentenceEnd + 1).trim();
  }
  return trimmed.slice(0, 140).trimEnd() + "…";
}

export async function GET() {
  try {
    // Fetch all events in one pass; sort client-side by tanggal asc.
    const events = await db.event.findMany({
      orderBy: { tanggal: "asc" },
    });

    // For active events we need committed-slot counts (pending + verified).
    // Pull them in one aggregate pass per active event — typically 0 or 1.
    const activeEvents = events.filter((e) => e.status === "active");
    const counts = await Promise.all(
      activeEvents.map((e) =>
        db.pendaftar.aggregate({
          _sum: { jumlahOrang: true },
          where: {
            idEvent: e.id,
            status: { in: ["pending_payment", "verified"] },
          },
        }),
      ),
    );
    const activeTerpakai = new Map<string, number>();
    activeEvents.forEach((e, i) => {
      activeTerpakai.set(e.id, counts[i]._sum.jumlahOrang ?? 0);
    });

    const timeline = events.map((e) => {
      // Common fields every timeline node carries.
      const base = {
        id: e.id,
        judul: e.judul,
        tanggal: e.tanggal,
        lokasi: e.lokasi,
        fotoCover: e.fotoCover,
      };

      if (e.status === "closed") {
        return {
          ...base,
          status: "closed" as const,
          recap: recapSummary(e.recap),
          impact: deriveImpact(e.judul, e.recap),
        };
      }

      if (e.status === "active") {
        const terpakai = activeTerpakai.get(e.id) ?? 0;
        return {
          ...base,
          status: "active" as const,
          sisaKuota: Math.max(0, e.kuotaMax - terpakai),
          kuotaMax: e.kuotaMax,
        };
      }

      // upcoming
      return {
        ...base,
        status: "upcoming" as const,
        harga: e.harga,
        kuotaMax: e.kuotaMax,
      };
    });

    return NextResponse.json({ timeline }, { status: 200 });
  } catch (err) {
    console.error("[api/event/timeline]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
