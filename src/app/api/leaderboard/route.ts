import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/leaderboard?limit=10
 *
 * Public endpoint (no auth) — returns the top volunteers (ranked by number
 * of verified event registrations) plus a community-impact summary that
 * powers the LeaderboardSection on the beranda.
 *
 * Volunteers are aggregated by their `kontak` (phone) field so that the
 * same person registering for multiple events is counted as ONE volunteer.
 * The phone number itself is NEVER returned — only the display `nama` and
 * the initials derived from it.
 *
 * Ranking:
 *   1. totalEvents (verified) desc
 *   2. totalPeople desc        (sum of jumlahOrang on verified registrations)
 *   3. totalSpent desc         (sum of totalBayar on verified registrations)
 *   4. firstEvent asc          (longest-tenured volunteer wins ties)
 *
 * Query params:
 *   - limit  : 1..50, default 10  (clamped to range)
 *
 * Response 200:
 *   {
 *     leaderboard: [
 *       { rank, nama, initials, totalEvents, totalPeople, totalSpent,
 *         firstEvent, recentEvent }
 *     ],
 *     communityImpact: {
 *       totalVolunteers, totalEvents, totalParticipants, totalHoursSaved,
 *       trashCollected, treesPlanted, bloodBags
 *     }
 *   }
 *
 * Community-impact derivation:
 *   - totalVolunteers   : distinct kontak among verified pendaftar
 *   - totalEvents       : count of closed events
 *   - totalParticipants : sum of jumlahOrang from verified pendaftar
 *   - totalHoursSaved   : totalParticipants * 5  (~5 volunteer-hours / event)
 *   - trashCollected / treesPlanted / bloodBags :
 *       parse the recap text of each closed event for an explicit number
 *       ("24 karung", "120 pohon", "80 kantong"); if the recap doesn't
 *       mention a number, fall back to a category default derived from
 *       the judul keywords (Sungai|Pantai → trash, Mangrove → trees,
 *       Donor → blood).
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Per-category default counts when the recap doesn't contain a number. */
const DEFAULT_TRASH_PER_EVENT = 15;
const DEFAULT_TREES_PER_EVENT = 50;
const DEFAULT_BLOOD_PER_EVENT = 30;

/**
 * Shape of a verified-pendaftar row + its parent event, as fetched from
 * Prisma. Declared explicitly so the aggregation logic below is typed
 * against the actual Prisma return shape (nested `event` object) rather
 * than a hand-rolled flat type.
 */
interface VerifiedRow {
  nama: string;
  kontak: string;
  jumlahOrang: number;
  totalBayar: number;
  createdAt: Date;
  event: {
    tanggal: string;
    judul: string;
  };
}

/** Generate 1-2 letter initials from a nama (e.g. "Dewi Saraswati" → "DS"). */
function initialsFromNama(nama: string): string {
  const clean = nama.trim().replace(/\s+/g, " ");
  if (!clean) return "?";
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) {
    // Single-word name → take first two chars uppercased.
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface ImpactNumber {
  trash: number;
  trees: number;
  blood: number;
}

/**
 * Derive impact numbers from a single closed event's judul + recap.
 * First tries to parse an explicit count from the recap; if none found,
 * uses the per-category default when the judul matches a known keyword.
 */
function deriveEventImpact(judul: string, recap: string | null): ImpactNumber {
  const text = `${judul} ${recap ?? ""}`.toLowerCase();
  const result: ImpactNumber = { trash: 0, trees: 0, blood: 0 };

  // Trash: Sungai / Pantai / bersih / sampah / plastik
  if (
    text.includes("sungai") ||
    text.includes("pantai") ||
    text.includes("bersih") ||
    text.includes("plastik") ||
    text.includes("sampah")
  ) {
    const m = text.match(/(\d+)\s*(?:karung|sak|kantong)/);
    result.trash = m ? parseInt(m[1], 10) : DEFAULT_TRASH_PER_EVENT;
    return result;
  }

  // Blood: Donor / darah
  if (text.includes("donor") || text.includes("darah")) {
    const m = text.match(/(\d+)\s*(?:kantong|kantung|pompa)/);
    result.blood = m ? parseInt(m[1], 10) : DEFAULT_BLOOD_PER_EVENT;
    return result;
  }

  // Trees: Mangrove / tanam / pohon / bibit
  if (
    text.includes("mangrove") ||
    text.includes("tanam") ||
    text.includes("pohon") ||
    text.includes("bibit")
  ) {
    const m = text.match(/(\d+)\s*(?:pohon|batang|mangrove|bibit)/);
    result.trees = m ? parseInt(m[1], 10) : DEFAULT_TREES_PER_EVENT;
    return result;
  }

  return result;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const rawLimit = parseInt(sp.get("limit") || String(DEFAULT_LIMIT), 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
      : DEFAULT_LIMIT;

    // Single pass for both leaderboard + community-impact participant totals.
    // Only verified pendaftar count toward community impact (per brief §5).
    const verifiedRows: VerifiedRow[] = await db.pendaftar.findMany({
      where: { status: "verified" },
      select: {
        nama: true,
        kontak: true,
        jumlahOrang: true,
        totalBayar: true,
        createdAt: true,
        event: { select: { tanggal: true, judul: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Aggregate by kontak so the same phone = one volunteer.
    // Use a Map for O(n) grouping; preserve nama from the most recent row.
    interface AggVolunteer {
      kontak: string;
      nama: string;
      totalEvents: number;
      totalPeople: number;
      totalSpent: number;
      firstEvent: string; // YYYY-MM-DD (event tanggal)
      recentEvent: string; // event judul
      recentCreatedAt: Date;
    }
    const byKontak = new Map<string, AggVolunteer>();
    for (const row of verifiedRows) {
      const eventTanggal = row.event.tanggal;
      const eventJudul = row.event.judul;
      const existing = byKontak.get(row.kontak);
      if (existing) {
        existing.totalEvents += 1;
        existing.totalPeople += row.jumlahOrang;
        existing.totalSpent += row.totalBayar;
        // firstEvent: keep the EARLIEST eventTanggal seen.
        if (eventTanggal < existing.firstEvent) {
          existing.firstEvent = eventTanggal;
        }
        // recentEvent: rows are ASC by createdAt so later rows overwrite.
        existing.recentEvent = eventJudul;
        existing.recentCreatedAt = row.createdAt;
        // Use the most recent row's nama as the display name (more current).
        existing.nama = row.nama;
      } else {
        byKontak.set(row.kontak, {
          kontak: row.kontak,
          nama: row.nama,
          totalEvents: 1,
          totalPeople: row.jumlahOrang,
          totalSpent: row.totalBayar,
          firstEvent: eventTanggal,
          recentEvent: eventJudul,
          recentCreatedAt: row.createdAt,
        });
      }
    }

    // Rank: totalEvents desc → totalPeople desc → totalSpent desc → firstEvent asc.
    const ranked = Array.from(byKontak.values()).sort((a, b) => {
      if (b.totalEvents !== a.totalEvents) return b.totalEvents - a.totalEvents;
      if (b.totalPeople !== a.totalPeople) return b.totalPeople - a.totalPeople;
      if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
      return a.firstEvent.localeCompare(b.firstEvent);
    });

    const leaderboard = ranked.slice(0, limit).map((v, i) => ({
      rank: i + 1,
      nama: v.nama,
      initials: initialsFromNama(v.nama),
      totalEvents: v.totalEvents,
      totalPeople: v.totalPeople,
      totalSpent: v.totalSpent,
      firstEvent: v.firstEvent,
      recentEvent: v.recentEvent,
    }));

    // Community impact ------------------------------------------------------
    const totalVolunteers = byKontak.size;
    const totalParticipants = verifiedRows.reduce(
      (sum, r) => sum + r.jumlahOrang,
      0,
    );
    const totalHoursSaved = totalParticipants * 5;

    // Count closed events + parse impact from their recap.
    const closedEvents = await db.event.findMany({
      where: { status: "closed" },
      select: { judul: true, recap: true },
    });
    const totalEvents = closedEvents.length;

    let trashCollected = 0;
    let treesPlanted = 0;
    let bloodBags = 0;
    for (const e of closedEvents) {
      const impact = deriveEventImpact(e.judul, e.recap);
      trashCollected += impact.trash;
      treesPlanted += impact.trees;
      bloodBags += impact.blood;
    }

    return NextResponse.json(
      {
        leaderboard,
        communityImpact: {
          totalVolunteers,
          totalEvents,
          totalParticipants,
          totalHoursSaved,
          trashCollected,
          treesPlanted,
          bloodBags,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/leaderboard]", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
