'use client';

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Calendar,
  MapPin,
  Check,
  Trash2,
  Droplet,
  Sprout,
  Users,
  ArrowRight,
  Clock,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RevealOnScroll } from "./RevealOnScroll";
import { ShimmerSkeleton } from "./Skeleton";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ImpactIcon = "trash" | "droplet" | "sprout" | "users" | "check";

interface TimelineItemBase {
  id: string;
  judul: string;
  tanggal: string; // YYYY-MM-DD
  lokasi: string;
  fotoCover: string | null;
}

interface ClosedItem extends TimelineItemBase {
  status: "closed";
  recap: string;
  impact: { label: string; icon: ImpactIcon };
}

interface ActiveItem extends TimelineItemBase {
  status: "active";
  sisaKuota: number;
  kuotaMax: number;
}

interface UpcomingItem extends TimelineItemBase {
  status: "upcoming";
  harga: number;
  kuotaMax: number;
}

type TimelineItem = ClosedItem | ActiveItem | UpcomingItem;

interface TimelineResponse {
  timeline: TimelineItem[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const IMPACT_ICON_MAP: Record<ImpactIcon, LucideIcon> = {
  trash: Trash2,
  droplet: Droplet,
  sprout: Sprout,
  users: Users,
  check: Check,
};

/** Split an ISO date into { day, monthShort, year } for compact display. */
function parseDate(iso: string): { day: string; monthShort: string; year: string } {
  try {
    const d = new Date(iso);
    return {
      day: d.toLocaleDateString("id-ID", { day: "2-digit" }),
      monthShort: d.toLocaleDateString("id-ID", { month: "short" }),
      year: d.toLocaleDateString("id-ID", { year: "numeric" }),
    };
  } catch {
    return { day: "?", monthShort: "?", year: "" };
  }
}

function formatTanggal(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatHarga(harga: number): string {
  if (!harga || harga === 0) return "Gratis";
  return `Rp ${harga.toLocaleString("id-ID")}`;
}

/** Pick a cover image: explicit fotoCover > keyword-based default. */
function pickCover(item: TimelineItem): string {
  if (item.fotoCover && item.fotoCover.trim() !== "") return item.fotoCover;
  const j = (item.judul || "").toLowerCase();
  if (j.includes("sungai") || j.includes("cikapundung")) {
    return "/history-cikapundung.jpg";
  }
  if (j.includes("donor") || j.includes("darah")) {
    return "/history-donor.jpg";
  }
  if (j.includes("pantai")) {
    return "/hero-volunteers.jpg";
  }
  if (j.includes("mangrove")) {
    return "/hero-volunteers.jpg";
  }
  return "/hero-volunteers.jpg";
}

/** Per-status accent — drives the timeline line color + node tint. */
const STATUS_ACCENT = {
  closed: {
    text: "text-[var(--success)]",
    bg: "bg-[var(--success)]",
    bgSoft: "bg-[var(--success)]/10",
    border: "border-[var(--success)]/30",
    ring: "ring-[var(--success)]/30",
    badge: "bg-[var(--success)] text-white",
    badgeLabel: "Selesai",
    dotColor: "bg-[var(--success)]",
    lineColor: "var(--success)",
    lineStyle: "solid" as const,
  },
  active: {
    text: "text-primary",
    bg: "bg-primary",
    bgSoft: "bg-primary/10",
    border: "border-primary/30",
    ring: "ring-primary/40",
    badge: "bg-primary text-primary-foreground",
    badgeLabel: "Berlangsung",
    dotColor: "bg-primary",
    lineColor: "var(--primary)",
    lineStyle: "solid" as const,
  },
  upcoming: {
    text: "text-[var(--amber)]",
    bg: "bg-[var(--amber)]",
    bgSoft: "bg-[var(--amber)]/10",
    border: "border-[var(--amber)]/30",
    ring: "ring-[var(--amber)]/30",
    badge: "bg-[var(--amber)] text-white",
    badgeLabel: "Coming Soon",
    dotColor: "bg-[var(--amber)]",
    lineColor: "var(--amber)",
    lineStyle: "dashed" as const,
  },
};

/* -------------------------------------------------------------------------- */
/* DateMarker                                                                 */
/* -------------------------------------------------------------------------- */

/** A circular date marker that sits on the timeline line. For closed events,
 *  a small checkmark is overlaid in the center. For active events, the marker
 *  pulses (a gentle ring animation).
 *
 *  Wrapped in a shadcn Tooltip so hovering/focusing the marker reveals the
 *  full Indonesian-formatted event date (e.g. "5 Agustus 2025"). The tooltip
 *  is keyboard-accessible (focusable trigger) and respects hover-none touch
 *  devices by virtue of Radix's pointer+focus heuristics. */
function DateMarker({ item }: { item: TimelineItem }) {
  const accent = STATUS_ACCENT[item.status];
  const { day, monthShort } = parseDate(item.tanggal);
  const isClosed = item.status === "closed";
  const isActive = item.status === "active";

  const marker = (
    <div
      className={cn(
        "relative z-10 flex size-14 flex-col items-center justify-center rounded-full border-2 bg-background shadow-sm sm:size-16",
        "cursor-help transition-shadow hover:shadow-md",
        accent.border,
        isActive && "animate-ring-pulse",
      )}
    >
      <span className={cn("font-mono text-base font-bold leading-none sm:text-lg", accent.text)}>
        {day}
      </span>
      <span className={cn("text-[10px] font-semibold uppercase leading-none", accent.text)}>
        {monthShort}
      </span>

      {/* Closed: checkmark badge in the top-right of the marker */}
      {isClosed && (
        <span
          className={cn(
            "absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-background shadow-sm",
            accent.bg,
          )}
          aria-label="Selesai"
        >
          <Check className="size-3 text-white" aria-hidden />
        </span>
      )}

      {/* Active: pulsing outer ring (separate element so it doesn't resize the marker) */}
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/25"
          style={{ animation: "ping-soft 2s ease-out infinite" }}
        />
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Tabindex=0 ensures keyboard users can focus the marker and the
            tooltip opens on focus. Radix already adds tabindex when used as
            a trigger, but we set it explicitly to be safe. */}
        <span tabIndex={0} className="inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-full">
          {marker}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <span className="font-data">{formatTanggal(item.tanggal)}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/* -------------------------------------------------------------------------- */
/* EventCard                                                                  */
/* -------------------------------------------------------------------------- */

interface EventCardProps {
  item: TimelineItem;
  onDaftar: () => void;
  index: number;
}

function EventCard({ item, onDaftar, index }: EventCardProps) {
  const accent = STATUS_ACCENT[item.status];
  const cover = pickCover(item);
  const reduceMotion = useReducedMotion();

  // Staggered entrance — each card slides in from its side with a small delay.
  // Mobile: from the right (vertical timeline). Desktop: from above/below
  // alternating. Disabled under reduced-motion.
  const isOdd = index % 2 === 1;

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.08, 0.4) }}
      className={cn(
        "group w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md sm:w-80",
        "hover:-translate-y-0.5",
        accent.border,
      )}
    >
      {/* Cover thumbnail with fade-in */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary/40">
        <Image
          src={cover}
          alt={`Foto ${item.judul}`}
          fill
          sizes="(max-width: 640px) 80vw, 320px"
          loading="lazy"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Soft gradient + status badge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-60"
        />
        <Badge
          className={cn(
            "absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm",
            accent.badge,
          )}
        >
          {accent.badgeLabel}
        </Badge>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold leading-snug text-foreground">
          {item.judul}
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5" aria-hidden />
            {formatTanggal(item.tanggal)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {item.lokasi}
          </span>
        </div>

        {/* Status-specific content */}
        {item.status === "closed" && (
          <div
            className={cn(
              "mt-1 flex items-center gap-2 rounded-lg border px-3 py-2",
              accent.border,
              accent.bgSoft,
            )}
          >
            {(() => {
              const Icon = IMPACT_ICON_MAP[item.impact.icon];
              return (
                <>
                  <Icon className={cn("size-4 shrink-0", accent.text)} aria-hidden />
                  <span className={cn("text-xs font-semibold", accent.text)}>
                    {item.impact.label}
                  </span>
                </>
              );
            })()}
          </div>
        )}

        {item.status === "active" && (
          <div className="mt-1 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" aria-hidden />
                Sisa kuota
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums",
                  item.sisaKuota <= 5
                    ? "border-[var(--amber)]/50 text-[var(--amber)]"
                    : "border-primary/40 text-primary",
                  item.sisaKuota <= 5 && "animate-pulse-amber",
                )}
              >
                {item.sisaKuota} / {item.kuotaMax}
              </Badge>
            </div>
            <Button
              type="button"
              onClick={onDaftar}
              disabled={item.sisaKuota <= 0}
              className="h-9 w-full rounded-full bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              Daftar Sekarang
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        )}

        {item.status === "upcoming" && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              Kuota {item.kuotaMax}
            </span>
            <span className="font-mono text-sm font-bold text-[var(--amber)]">
              {formatHarga(item.harga)}
            </span>
          </div>
        )}
      </div>
    </motion.article>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                  */
/* -------------------------------------------------------------------------- */

function TimelineSkeleton() {
  return (
    <div className="mt-10">
      {/* Desktop: horizontal skeleton */}
      <div className="hidden lg:flex lg:items-center lg:gap-8 lg:overflow-x-auto lg:pb-4 scrollbar-hide">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <ShimmerSkeleton className="size-16 rounded-full" />
            <ShimmerSkeleton className="h-56 w-80 rounded-2xl" />
          </div>
        ))}
      </div>
      {/* Mobile: vertical skeleton */}
      <div className="lg:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-6 flex items-start gap-4">
            <ShimmerSkeleton className="size-14 rounded-full" />
            <ShimmerSkeleton className="h-44 w-full rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EmptyState                                                                 */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <div className="mt-10">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-secondary bg-secondary/40 p-8 text-center sm:p-12">
        <div className="inline-flex size-14 items-center justify-center rounded-full bg-background text-primary ring-1 ring-inset ring-border">
          <Calendar className="size-7" aria-hidden />
        </div>
        <h3 className="font-display text-xl font-bold text-foreground">
          Perjalanan Saratrasaa belum dimulai
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Timeline akan muncul di sini begitu event pertama dibuka. Sementara itu,
          pantau Instagram{" "}
          <a
            href="https://instagram.com/saratrasaaa"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            @saratrasaaa
          </a>{" "}
          untuk info terbaru.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Today indicator — shows where "today" sits on the timeline                 */
/* -------------------------------------------------------------------------- */

/**
 * Compute the position of "today" as a percentage (0–100) along the timeline.
 * Returns null if today is outside the timeline's date range (strictly before
 * the first event or strictly after the last). Uses UTC midnight comparisons
 * for stability regardless of server timezone.
 *
 * The timeline is laid out with the first event at the left edge and the
 * last at the right edge (justify-between), so a linear interpolation in
 * time matches the visual position of the markers.
 */
function computeTodayPosition(timeline: TimelineItem[]): number | null {
  if (timeline.length < 2) return null;
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const firstMs = parseIsoToUtcMs(first.tanggal);
  const lastMs = parseIsoToUtcMs(last.tanggal);
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return null;
  if (lastMs <= firstMs) return null;
  const nowMs = Date.now();
  if (nowMs <= firstMs || nowMs >= lastMs) return null;
  return ((nowMs - firstMs) / (lastMs - firstMs)) * 100;
}

/** Parse a YYYY-MM-DD (or full ISO) string into UTC milliseconds at midnight. */
function parseIsoToUtcMs(iso: string): number {
  const datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d);
}

/**
 * Desktop today indicator — a vertical dashed pink line + a small "Hari ini"
 * pill label, absolutely positioned at the given percentage along the
 * horizontal timeline. Sits behind the cards (z-0) so the line passes
 * through the markers without covering them.
 */
function TodayIndicatorDesktop({ pct }: { pct: number }) {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 z-0"
      style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
    >
      {/* Dashed vertical line spanning the full timeline height */}
      <div
        className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-primary/50"
      />
      {/* Pulsing dot on the line itself, at the marker-row vertical center */}
      <div
        className="absolute left-1/2 top-[2.875rem] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary animate-today-pulse"
      />
      {/* "Hari ini" pill — positioned above the line so it doesn't overlap
          the marker row. */}
      <div
        className={cn(
          "absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm",
          !reduce && "animate-today-pulse",
        )}
      >
        Hari ini
      </div>
    </div>
  );
}

/**
 * Mobile today row — a small "Hari ini" separator inserted between two
 * events where today falls. Renders a row with a pink dot on the timeline
 * rail and a label.
 */
function TodayRowMobile() {
  return (
    <motion.li
      initial={false}
      animate={{ opacity: 1 }}
      className="relative flex items-start gap-4"
      aria-label="Hari ini"
    >
      {/* Dot on the vertical line */}
      <div className="relative z-10 shrink-0">
        <div className="flex size-14 items-center justify-center sm:size-16">
          <span className="size-4 rounded-full bg-primary animate-today-pulse" />
        </div>
      </div>
      {/* Label card */}
      <div className="flex min-w-0 flex-1 items-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <Clock className="size-3.5" aria-hidden />
          Hari ini
        </div>
      </div>
    </motion.li>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export function TimelineSection() {
  const reduceMotion = useReducedMotion();
  const [timeline, setTimeline] = React.useState<TimelineItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/event/timeline", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TimelineResponse;
        if (cancelled) return;
        setTimeline(data.timeline ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("[TimelineSection] failed to load timeline:", err);
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Dispatch the global `saratrasa:goto` event so home-client.tsx swaps to
   *  the "daftar" view — same pattern used by DaftarWizard's "Cek Status"
   *  button. */
  const handleDaftar = React.useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("saratrasa:goto", { detail: "daftar" }),
    );
  }, []);

  // Compute the "today" position along the timeline. null when today is
  // outside the timeline's date range — in that case we don't render the
  // indicator. Memoized so it doesn't flicker on re-render.
  const todayPct = React.useMemo(
    () => computeTodayPosition(timeline),
    [timeline],
  );

  // For mobile, find the insertion index for the "Hari ini" row — i.e. the
  // index of the first event whose tanggal is strictly after today. -1 means
  // don't insert (today is outside the timeline range).
  const todayInsertIdx = React.useMemo(() => {
    if (todayPct === null) return -1;
    const nowMs = Date.now();
    for (let i = 0; i < timeline.length; i++) {
      const ms = parseIsoToUtcMs(timeline[i].tanggal);
      if (Number.isFinite(ms) && ms > nowMs) return i;
    }
    return -1;
  }, [timeline, todayPct]);

  return (
    <section
      id="timeline"
      aria-labelledby="timeline-heading"
      className="px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl">
        <RevealOnScroll className="max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Perjalanan Kami
          </p>
          <h2
            id="timeline-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Dari Sungai ke Pantai, Satu Aksi Sekaligus
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Setiap titik di timeline ini adalah bekas kaki relawan Saratrasaa.
          </p>
        </RevealOnScroll>

        {/* Legend */}
        {!loading && !failed && timeline.length > 0 && (
          <RevealOnScroll delay={0.1} className="mt-6 flex flex-wrap gap-3">
            <LegendDot color="var(--success)" label="Selesai" />
            <LegendDot color="var(--primary)" label="Berlangsung" pulsing />
            <LegendDot color="var(--amber)" label="Mendatang" dashed />
          </RevealOnScroll>
        )}

        {/* Loading */}
        {loading && <TimelineSkeleton />}

        {/* Empty / failed */}
        {!loading && (failed || timeline.length === 0) && <EmptyState />}

        {/* Timeline */}
        {!loading && !failed && timeline.length > 0 && (
          <>
            {/* ============== DESKTOP: horizontal alternating timeline ============== */}
            <div
              className="mt-12 hidden lg:block"
              role="list"
              aria-label="Timeline perjalanan Saratrasaa"
            >
              <div className="relative">
                {/* The horizontal line — sits at the vertical center of the markers.
                    Rendered as a single SVG so we can color each segment by the
                    status of the node that STARTS it. */}
                <svg
                  aria-hidden
                  className="absolute left-0 right-0 top-[2.875rem] h-1 w-full"
                  preserveAspectRatio="none"
                >
                  {/* Background base line */}
                  <line
                    x1="0"
                    y1="2"
                    x2="100%"
                    y2="2"
                    stroke="var(--pink-soft)"
                    strokeWidth="2"
                  />
                  {/* Per-segment colored overlays */}
                  {timeline.map((item, i) => {
                    if (i === timeline.length - 1) return null;
                    const next = timeline[i + 1];
                    // Segment color: take the "lower priority" status (upcoming is most future).
                    const segmentColor = (
                      item.status === "upcoming" || next.status === "upcoming"
                        ? "var(--amber)"
                        : item.status === "active" || next.status === "active"
                          ? "var(--primary)"
                          : "var(--success)"
                    );
                    const isDashed =
                      item.status === "upcoming" || next.status === "upcoming";
                    return (
                      <line
                        key={item.id}
                        x1={`${(i / (timeline.length - 1)) * 100}%`}
                        y1="2"
                        x2={`${((i + 1) / (timeline.length - 1)) * 100}%`}
                        y2="2"
                        stroke={segmentColor}
                        strokeWidth="3"
                        strokeDasharray={isDashed ? "6 6" : undefined}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </svg>

                {/* Today indicator — a vertical dashed pink line + "Hari ini"
                    pill, only rendered when today falls strictly inside the
                    timeline's date range. */}
                {todayPct !== null && (
                  <TodayIndicatorDesktop pct={todayPct} />
                )}

                {/* Nodes + cards row — alternating top/bottom */}
                <div className="relative flex justify-between gap-4 overflow-x-auto pb-4 scrollbar-hide">
                  {timeline.map((item, i) => {
                    const isTop = i % 2 === 0; // even index → card above the line
                    return (
                      <div
                        key={item.id}
                        role="listitem"
                        className="flex min-w-[20rem] flex-col items-center"
                      >
                        {/* Top card slot */}
                        <div className={cn("flex h-[22rem] w-full items-end justify-center", !isTop && "invisible")}>
                          {isTop && (
                            <EventCard item={item} onDaftar={handleDaftar} index={i} />
                          )}
                        </div>

                        {/* Marker */}
                        <div className="my-3">
                          <DateMarker item={item} />
                        </div>

                        {/* Bottom card slot */}
                        <div className={cn("flex h-[22rem] w-full items-start justify-center", isTop && "invisible")}>
                          {!isTop && (
                            <EventCard item={item} onDaftar={handleDaftar} index={i} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ============== MOBILE / TABLET: vertical timeline ============== */}
            <div
              className="mt-10 lg:hidden"
              role="list"
              aria-label="Timeline perjalanan Saratrasaa"
            >
              <div className="relative pl-2">
                {/* Vertical line — sits behind the markers, indented to align
                    with the marker center (marker is 56px / 64px wide, so the
                    line goes at ~28-32px from the left edge). */}
                <div
                  aria-hidden
                  className="absolute top-0 bottom-0 left-[2.125rem] w-0.5 bg-[var(--pink-soft)] sm:left-[2.25rem]"
                />

                <ol className="space-y-6">
                  {timeline.map((item, i) => (
                    <React.Fragment key={item.id}>
                      {/* Insert the "Hari ini" row before the first event
                          whose tanggal is strictly after today. */}
                      {todayInsertIdx === i && <TodayRowMobile />}
                      <motion.li
                        role="listitem"
                        initial={reduceMotion ? false : { opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.5, delay: Math.min(i * 0.08, 0.4) }}
                        className="relative flex items-start gap-4"
                      >
                        {/* Marker on the left, sitting on the vertical line */}
                        <div className="relative z-10 shrink-0 bg-background">
                          <DateMarker item={item} />
                        </div>

                        {/* Card on the right */}
                        <div className="min-w-0 flex-1">
                          <EventCard item={item} onDaftar={handleDaftar} index={i} />
                        </div>
                      </motion.li>
                    </React.Fragment>
                  ))}
                </ol>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* LegendDot                                                                  */
/* -------------------------------------------------------------------------- */

function LegendDot({
  color,
  label,
  pulsing,
  dashed,
}: {
  color: string;
  label: string;
  pulsing?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
      <span
        className={cn("inline-block size-2.5 rounded-full", pulsing && "animate-pulse")}
        style={{
          backgroundColor: color,
          backgroundImage: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 8px)`
            : undefined,
        }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export default TimelineSection;
