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
  waktuMulai: string | null;
  lokasi: string;
  linkGmaps: string | null;
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

function pickCover(item: TimelineItem): string {
  if (item.fotoCover && item.fotoCover.trim() !== "") return item.fotoCover;
  return "/hero2.jpeg";
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
        "hover:-translate-y-0.5 isolate transform-gpu",
        accent.border,
      )}
    >
      {/* Cover thumbnail with fade-in */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-secondary/40 transform-gpu isolate after:pointer-events-none after:absolute after:inset-0 after:rounded-t-2xl after:ring-1 after:ring-inset after:ring-black/5 dark:after:ring-white/5">
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
            "absolute left-4 top-4 inline-flex h-6 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold shadow-sm border-0",
            accent.badge,
          )}
        >
          {item.status === "active" && (
            <span className="shrink-0 size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
          )}
          <span>{accent.badgeLabel}</span>
        </Badge>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold leading-snug text-foreground">
          {item.judul}
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5 shrink-0" aria-hidden />
            <span>{formatTanggal(item.tanggal)}{item.waktuMulai ? ` • ${item.waktuMulai} WIB` : ""}</span>
          </span>
          {item.linkGmaps ? (
            <a 
              href={item.linkGmaps} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1 hover:text-primary transition-colors hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span>{item.lokasi}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span>{item.lokasi}</span>
            </span>
          )}
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
      {/* Desktop: horizontal skeleton matches exact alternating structure */}
      <div className="hidden lg:block">
        <div className="relative">
          <div className="absolute left-0 right-0 top-[24.75rem] h-1 w-full bg-secondary -translate-y-1/2" />
          <div className="relative flex justify-between gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {Array.from({ length: 4 }).map((_, i) => {
              const isTop = i % 2 === 0;
              return (
                <div key={i} className="flex min-w-[20rem] flex-col items-center">
                  <div className={cn("flex h-[22rem] w-full items-end justify-center", !isTop && "invisible")}>
                    {isTop && <ShimmerSkeleton className="h-[22rem] w-full rounded-2xl" />}
                  </div>
                  <div className="my-3">
                    <ShimmerSkeleton className="size-14 sm:size-16 rounded-full" />
                  </div>
                  <div className={cn("flex h-[22rem] w-full items-start justify-center", isTop && "invisible")}>
                    {!isTop && <ShimmerSkeleton className="h-[22rem] w-full rounded-2xl" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Mobile: vertical skeleton matches exact line placement */}
      <div className="lg:hidden">
        <div className="relative pl-2">
          <div className="absolute top-0 bottom-0 left-[2.125rem] w-0.5 bg-secondary sm:left-[2.25rem]" />
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="relative flex items-start gap-4">
                <div className="relative z-10 shrink-0 bg-background">
                  <ShimmerSkeleton className="size-14 sm:size-16 rounded-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <ShimmerSkeleton className="h-64 w-full rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
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
            Bersama Melangkah, Tebarkan Kebaikan
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Setiap titik di timeline ini adalah bekas kaki relawan Saratrasaa.
          </p>
        </RevealOnScroll>

        {/* Legend */}
        {!loading && !failed && timeline.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <RevealOnScroll delay={0.1} className="flex flex-wrap gap-3">
              <LegendDot color="var(--success)" label="Selesai" />
              <LegendDot color="var(--primary)" label="Berlangsung" pulsing />
              <LegendDot color="var(--amber)" label="Mendatang" dashed />
            </RevealOnScroll>
            <RevealOnScroll delay={0.2} className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground italic">
              <ArrowRight className="size-4 animate-pulse" />
              Bisa digeser ke samping
            </RevealOnScroll>
          </div>
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
                  className="absolute left-0 right-0 top-[26.75rem] h-1 w-full -translate-y-1/2"
                  preserveAspectRatio="none"
                >
                  {/* Background base line */}
                  <line
                    x1="0"
                    y1="2"
                    x2="100%"
                    y2="2"
                    stroke="hsl(var(--border))"
                    strokeWidth="2"
                  />
                  {/* Per-segment colored overlays */}
                  {timeline.map((item, i) => {
                    if (i === timeline.length - 1) return null;
                    const next = timeline[i + 1];
                    const segmentColor = (
                      item.status === "upcoming"
                        ? "var(--amber)"
                        : item.status === "active"
                          ? "var(--primary)"
                          : "var(--success)"
                    );
                    const isDashed = item.status === "upcoming";
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



                {/* Nodes + cards row — alternating top/bottom */}
                <div className="relative flex justify-between gap-4 overflow-x-auto pb-6 pt-2 scrollbar-hide">
                  {timeline.map((item, i) => {
                    const isTop = i % 2 === 0; // even index → card above the line
                    return (
                      <div
                        key={item.id}
                        role="listitem"
                        className="flex min-w-[20rem] flex-col items-center"
                      >
                        {/* Top card slot */}
                        <div className={cn("flex h-[24rem] w-full items-end justify-center", !isTop && "invisible")}>
                          {isTop && (
                            <EventCard item={item} onDaftar={handleDaftar} index={i} />
                          )}
                        </div>

                        {/* Marker */}
                        <div className="my-3">
                          <DateMarker item={item} />
                        </div>

                        {/* Bottom card slot */}
                        <div className={cn("flex h-[24rem] w-full items-start justify-center", isTop && "invisible")}>
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
                  className="absolute top-0 bottom-0 left-[2.125rem] w-0.5 bg-border sm:left-[2.25rem]"
                />

                <ol className="space-y-6">
                  {timeline.map((item, i) => (
                    <React.Fragment key={item.id}>

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
