'use client';

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Trophy,
  Medal,
  Crown,
  Users,
  CalendarCheck,
  UserCheck,
  Clock,
  Trash2,
  TreePine,
  Droplet,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/saratrasa";
import { Button } from "@/components/ui/button";
import { ShimmerSkeleton } from "./Skeleton";
import { RevealOnScroll } from "./RevealOnScroll";
import { CountUp } from "./CountUp";
import { SparkleDecoration } from "./DecorativePatterns";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface LeaderboardEntry {
  rank: number;
  nama: string;
  initials: string;
  totalEvents: number;
  totalPeople: number;
  totalSpent: number;
  firstEvent: string; // YYYY-MM-DD
  recentEvent: string;
}

interface CommunityImpact {
  totalVolunteers: number;
  totalEvents: number;
  totalParticipants: number;
  totalHoursSaved: number;
  trashCollected: number;
  treesPlanted: number;
  bloodBags: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  communityImpact: CommunityImpact;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const PODIUM_TONE = {
  gold: {
    ring: "ring-amber-400/60",
    bg: "bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/20",
    medal: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950",
    avatar: "bg-gradient-to-br from-amber-400 to-amber-600 text-white",
    crown: "text-amber-500",
    label: "text-amber-700 dark:text-amber-300",
    height: "sm:pt-12 sm:pb-8",
    glow: "shadow-[0_8px_30px_-4px_rgba(255,177,0,0.35)]",
  },
  silver: {
    ring: "ring-slate-300/60",
    bg: "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/40 dark:to-slate-900/20",
    medal: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800",
    avatar: "bg-gradient-to-br from-slate-300 to-slate-500 text-white",
    crown: "text-slate-400",
    label: "text-slate-600 dark:text-slate-300",
    height: "sm:pt-8 sm:pb-6",
    glow: "shadow-[0_6px_24px_-6px_rgba(100,116,139,0.35)]",
  },
  bronze: {
    ring: "ring-orange-300/60",
    bg: "bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/40 dark:to-orange-900/20",
    medal: "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950",
    avatar: "bg-gradient-to-br from-orange-400 to-orange-600 text-white",
    crown: "text-orange-400",
    label: "text-orange-700 dark:text-orange-300",
    height: "sm:pt-6 sm:pb-5",
    glow: "shadow-[0_6px_24px_-6px_rgba(234,88,12,0.35)]",
  },
} as const;

const RANK_TONE = {
  // For ranked list below podium (rank 4+)
  rest: {
    avatar: "bg-gradient-to-br from-primary/70 to-primary text-white",
    badge: "bg-primary/10 text-primary",
  },
} as const;

type ToneKey = keyof typeof PODIUM_TONE;

function toneForRank(rank: number): ToneKey | null {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}

interface ImpactStat {
  key: keyof CommunityImpact;
  label: string;
  icon: LucideIcon;
  tone: "pink" | "amber" | "success" | "sky";
  suffix?: string;
  /** Gradient for the count-up number text. */
  gradient: string;
}

const IMPACT_STATS: ImpactStat[] = [
  {
    key: "totalVolunteers",
    label: "Total Relawan",
    icon: Users,
    tone: "pink",
    gradient: "linear-gradient(135deg, #1F1115, #FF2D78)",
  },
  {
    key: "totalEvents",
    label: "Event Selesai",
    icon: CalendarCheck,
    tone: "amber",
    gradient: "linear-gradient(135deg, #1F1115, #FFB100)",
  },
  {
    key: "totalParticipants",
    label: "Total Partisipan",
    icon: UserCheck,
    tone: "success",
    gradient: "linear-gradient(135deg, #1F1115, #1F8A5F)",
  },
  {
    key: "totalHoursSaved",
    label: "Jam Relawan",
    icon: Clock,
    tone: "pink",
    suffix: " jam kebaikan",
    gradient: "linear-gradient(135deg, #1F1115, #FF2D78)",
  },
  {
    key: "trashCollected",
    label: "Karung Plastik",
    icon: Trash2,
    tone: "success",
    suffix: " karung",
    gradient: "linear-gradient(135deg, #1F1115, #1F8A5F)",
  },
  {
    key: "treesPlanted",
    label: "Pohon Ditanam",
    icon: TreePine,
    tone: "amber",
    suffix: " pohon",
    gradient: "linear-gradient(135deg, #1F1115, #FFB100)",
  },
  {
    key: "bloodBags",
    label: "Kantong Darah",
    icon: Droplet,
    tone: "pink",
    suffix: " kantong",
    gradient: "linear-gradient(135deg, #1F1115, #FF2D78)",
  },
];

const IMPACT_TONE_STYLES: Record<
  ImpactStat["tone"],
  { circle: string; icon: string; border: string }
> = {
  pink: {
    circle: "bg-primary/10",
    icon: "text-primary",
    border: "border-t-primary/30",
  },
  amber: {
    circle: "bg-[var(--amber)]/10",
    icon: "text-[var(--amber)]",
    border: "border-t-[var(--amber)]/30",
  },
  success: {
    circle: "bg-[var(--success)]/10",
    icon: "text-[var(--success)]",
    border: "border-t-[var(--success)]/30",
  },
  sky: {
    circle: "bg-sky-500/10",
    icon: "text-sky-500",
    border: "border-t-sky-500/30",
  },
};

/* -------------------------------------------------------------------------- */
/* Podium                                                                      */
/* -------------------------------------------------------------------------- */

function PodiumCard({ entry, idx }: { entry: LeaderboardEntry; idx: number }) {
  const reduce = useReducedMotion();
  const toneKey = toneForRank(entry.rank);
  const tone = toneKey ? PODIUM_TONE[toneKey] : null;
  if (!tone) return null;

  // Podium order on desktop: 2nd, 1st, 3rd (so the #1 sits center-stage).
  // On mobile, fall back to a simple stacked list in rank order.
  return (
    <motion.div
      className={cn(
        "relative flex flex-col items-center rounded-2xl border border-border p-4 text-center",
        "bg-card",
        tone.bg,
        "ring-2 ring-offset-2 ring-offset-background",
        tone.ring,
        tone.height,
        tone.glow,
        idx === 0 ? "sm:order-2 sm:scale-105 sm:-mt-4" : "",
        idx === 1 ? "sm:order-1" : "",
        idx === 2 ? "sm:order-3" : "",
      )}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.55,
        delay: reduce ? 0 : 0.15 + idx * 0.12,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {/* Crown / Medal */}
      <div className="mb-2 flex items-center justify-center">
        {entry.rank === 1 ? (
          <Crown
            className={cn(
              "size-7 drop-shadow-sm",
              tone.crown,
              "animate-crown-bob",
            )}
            aria-hidden
            fill="currentColor"
          />
        ) : (
          <Medal
            className={cn("size-6 drop-shadow-sm", tone.crown)}
            aria-hidden
            fill="currentColor"
          />
        )}
      </div>

      {/* Avatar with initials */}
      <div
        className={cn(
          "relative flex size-16 items-center justify-center rounded-full font-display text-xl font-bold shadow-sm",
          tone.avatar,
          entry.rank === 1 && "sm:size-20",
        )}
        aria-hidden
      >
        {entry.initials}
        {/* Rank badge */}
        <span
          className={cn(
            "absolute -bottom-1 -right-1 inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ring-2 ring-background",
            tone.medal,
          )}
        >
          {entry.rank}
        </span>
      </div>

      {/* Name */}
      <p
        className={cn(
          "mt-3 line-clamp-1 font-display text-base font-bold text-foreground",
          entry.rank === 1 ? "sm:text-lg" : "",
        )}
        title={entry.nama}
      >
        {entry.nama}
      </p>

      {/* Stats row */}
      <div className="mt-2 flex items-center justify-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Trophy className="size-3.5 text-primary" aria-hidden />
          <span className="font-semibold text-foreground">
            {entry.totalEvents}
          </span>{" "}
          event
        </span>
        <span className="size-1 rounded-full bg-border" aria-hidden />
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Users className="size-3.5 text-[var(--amber)]" aria-hidden />
          <span className="font-semibold text-foreground">
            {entry.totalPeople}
          </span>{" "}
          orang
        </span>
      </div>

      {/* Recent event — small caption, hidden on tiny screens */}
      <p
        className="mt-2 line-clamp-1 text-[11px] text-muted-foreground"
        title={entry.recentEvent}
      >
        {entry.recentEvent}
      </p>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ranked list row (rank 4+)                                                   */
/* -------------------------------------------------------------------------- */

function RankedRow({ entry, idx }: { entry: LeaderboardEntry; idx: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm",
        "transition-all duration-200 hover:shadow-md hover:border-primary/30",
      )}
      initial={reduce ? false : { opacity: 0, x: -16 }}
      whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.4,
        delay: reduce ? 0 : 0.05 * idx,
        ease: "easeOut",
      }}
    >
      {/* Rank number */}
      <div
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          RANK_TONE.rest.badge,
        )}
        aria-label={`Peringkat ${entry.rank}`}
      >
        {entry.rank}
      </div>

      {/* Avatar */}
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          RANK_TONE.rest.avatar,
        )}
        aria-hidden
      >
        {entry.initials}
      </div>

      {/* Name + recent event */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-foreground">
          {entry.nama}
        </p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={entry.recentEvent}
        >
          {entry.recentEvent}
        </p>
      </div>

      {/* Stats — total events + total people */}
      <div className="flex shrink-0 items-center gap-3 text-right">
        <div className="text-center">
          <p className="font-mono text-sm font-bold text-foreground">
            {entry.totalEvents}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            event
          </p>
        </div>
        <div className="hidden text-center sm:block">
          <p className="font-mono text-sm font-bold text-foreground">
            {entry.totalPeople}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            orang
          </p>
        </div>
        <div className="hidden text-right md:block">
          <p className="font-mono text-xs font-semibold text-foreground">
            {formatIDR(entry.totalSpent)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            total donasi
          </p>
        </div>
      </div>
    </motion.li>
  );
}

/* -------------------------------------------------------------------------- */
/* Impact stat card                                                            */
/* -------------------------------------------------------------------------- */

function ImpactStatCard({
  stat,
  value,
  loading,
}: {
  stat: ImpactStat;
  value: number;
  loading: boolean;
}) {
  const Icon = stat.icon;
  const tone = IMPACT_TONE_STYLES[stat.tone];
  return (
    <div
      className={cn(
        "group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-300",
        "hover:shadow-md hover:ring-2 hover:ring-primary/15",
        "border-t-2",
        tone.border,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110",
            tone.circle,
          )}
        >
          <Icon className={cn("size-5", tone.icon)} aria-hidden />
        </div>
        {loading ? (
          <ShimmerSkeleton className="h-8 w-20" />
        ) : (
          <CountUp
            value={value}
            duration={1.1}
            gradient={stat.gradient}
            suffix={stat.suffix ?? ""}
            className="text-2xl font-bold sm:text-3xl"
          />
        )}
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground sm:text-sm">
        {stat.label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main section                                                                */
/* -------------------------------------------------------------------------- */

export function LeaderboardSection() {
  const [data, setData] = React.useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/leaderboard?limit=10", {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LeaderboardResponse;
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        // Silent fail — never break the beranda.
        console.warn("[LeaderboardSection] failed to load:", err);
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  const podium = data?.leaderboard.slice(0, 3) ?? [];
  const rest = data?.leaderboard.slice(3) ?? [];
  const impact = data?.communityImpact;

  return (
    <section
      id="leaderboard"
      aria-label="Papan relawan teratas Saratrasaa"
      className="relative overflow-hidden bg-gradient-to-b from-background to-secondary/20 px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
    >
      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
          {/* LEFT: Leaderboard --------------------------------------------------- */}
          <div className="lg:col-span-7">
            <RevealOnScroll className="mb-8 max-w-xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
                Relawan Teratas
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Juara Kebaikan Saratrasaa
              </h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Mereka yang konsisten hadir, berkeringat, dan berbagi tawa di
                setiap aksi. Terima kasih, relawan!
              </p>
            </RevealOnScroll>

            {loading ? (
              <LeaderboardSkeleton />
            ) : podium.length === 0 ? (
              <EmptyLeaderboard />
            ) : (
              <>
                {/* Podium — 2nd, 1st, 3rd on desktop; stacked on mobile.
                    Wrapped in a relative container so the sparkle decoration
                    can sit behind/around the cards. */}
                <div className="relative">
                  {/* Sparkle decoration — small twinkling sparkles around
                      the top 3. pointer-events-none so it never blocks the
                      cards. Hidden under reduced-motion (SparkleDecoration
                      renders static sparkles instead). */}
                  <SparkleDecoration
                    color="pink"
                    sparkles={[
                      { top: "6%", left: "8%", size: 12, delay: 0.0, duration: 2.8 },
                      { top: "0%", left: "48%", size: 14, delay: 0.6, duration: 3.2 },
                      { top: "10%", left: "88%", size: 10, delay: 1.2, duration: 2.6 },
                      { top: "44%", left: "2%", size: 9, delay: 0.4, duration: 3.0 },
                      { top: "44%", left: "94%", size: 11, delay: 1.0, duration: 3.4 },
                      { top: "82%", left: "20%", size: 8, delay: 0.8, duration: 2.4 },
                      { top: "82%", left: "76%", size: 9, delay: 1.4, duration: 2.8 },
                    ]}
                  />
                  <div className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                    {podium.map((entry, idx) => (
                      <PodiumCard key={entry.rank} entry={entry} idx={idx} />
                    ))}
                  </div>
                </div>

                {/* Ranked list (4+) */}
                {rest.length > 0 && (
                  <RevealOnScroll delay={0.2}>
                    <ul className="mt-5 space-y-2" aria-label="Peringkat 4 ke bawah">
                      {rest.map((entry, idx) => (
                        <RankedRow key={entry.rank} entry={entry} idx={idx} />
                      ))}
                    </ul>
                  </RevealOnScroll>
                )}

                {/* "Lihat Semua" — placeholder button that hints at a future
                    full-leaderboard view. For now it just scrolls to the
                    community-impact panel on the right (mobile) so the user
                    sees more of the section. */}
                <div className="mt-6 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="group rounded-full border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50"
                    onClick={() => {
                      const el = document.getElementById("impact-panel");
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                  >
                    Lihat Semua
                    <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Community impact -------------------------------------------- */}
          <div id="impact-panel" className="lg:col-span-5 scroll-mt-20">
            <RevealOnScroll className="mb-8 max-w-md">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--amber)]">
                Dampak Bersama
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                Kebaikan yang Terkumpul
              </h2>
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                Setiap angka di bawah ini lahir dari gotong-royong kita semua.
              </p>
            </RevealOnScroll>

            <RevealOnScroll delay={0.15}>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {IMPACT_STATS.map((stat) => (
                  <ImpactStatCard
                    key={stat.key}
                    stat={stat}
                    value={impact ? impact[stat.key] : 0}
                    loading={loading}
                  />
                ))}
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading + empty states                                                      */
/* -------------------------------------------------------------------------- */

function LeaderboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Podium skeleton */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl border border-border bg-card p-4",
              i === 1 && "sm:py-8",
            )}
          >
            <div className="flex flex-col items-center gap-2">
              <ShimmerSkeleton className="size-12 rounded-full" />
              <ShimmerSkeleton className="h-4 w-24" />
              <ShimmerSkeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      {/* Ranked rows skeleton */}
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <ShimmerSkeleton className="size-9 rounded-full" />
            <ShimmerSkeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <ShimmerSkeleton className="h-4 w-32" />
              <ShimmerSkeleton className="h-3 w-48" />
            </div>
            <ShimmerSkeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyLeaderboard() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Trophy className="size-7 text-primary" aria-hidden />
      </div>
      <p className="font-display text-lg font-semibold text-foreground">
        Belum ada relawan terverifikasi
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Daftar event aktif berikutnya dan jadilah yang pertama di papan juara
        kebaikan Saratrasaa.
      </p>
    </div>
  );
}

export default LeaderboardSection;
