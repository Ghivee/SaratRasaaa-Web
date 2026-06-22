'use client';

import * as React from "react";
import { CalendarCheck, Users, Trash2, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerSkeleton } from "./Skeleton";
import { RevealOnScroll } from "./RevealOnScroll";
import { CountUp } from "./CountUp";

interface ImpactStats {
  karungPlastik: number;
  kantongDarah: number;
  pohonDitanam: number;
}

interface StatsPayload {
  stats: {
    totalEvents: number;
    totalVolunteers: number;
    totalVerifiedPendaftar: number;
    upcomingEvents: number;
    impact: ImpactStats;
  };
}

type Tone = "pink" | "amber" | "success";

interface StatDef {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  /** Extractor from payload — defaults to 0 if missing. */
  getValue: (s: StatsPayload["stats"]) => number;
}

const STATS: StatDef[] = [
  { key: "events", label: "Event Selesai", icon: CalendarCheck, tone: "pink", getValue: (s) => s.totalEvents ?? 0 },
  { key: "volunteers", label: "Relawan Terverifikasi", icon: Users, tone: "amber", getValue: (s) => s.totalVolunteers ?? 0 },
  { key: "trash", label: "Karung Plastik Ditarik", icon: Trash2, tone: "success", getValue: (s) => s.impact?.karungPlastik ?? 0 },
  { key: "upcoming", label: "Aksi Mendatang", icon: Sparkles, tone: "pink", getValue: (s) => s.upcomingEvents ?? 0 },
];

const TONE_STYLES: Record<Tone, { circle: string; icon: string; border: string; gradient: string; textGradient: string }> = {
  pink: {
    circle: "bg-primary/10",
    icon: "text-primary",
    border: "border-t-primary/30",
    gradient: "hover:bg-gradient-to-br hover:from-card hover:to-primary/5",
    textGradient: "linear-gradient(135deg, #1F1115, #FF2D78)",
  },
  amber: {
    circle: "bg-[var(--amber)]/10",
    icon: "text-[var(--amber)]",
    border: "border-t-[var(--amber)]/30",
    gradient: "hover:bg-gradient-to-br hover:from-card hover:to-[var(--amber)]/5",
    textGradient: "linear-gradient(135deg, #1F1115, #FFB100)",
  },
  success: {
    circle: "bg-[var(--success)]/10",
    icon: "text-[var(--success)]",
    border: "border-t-[var(--success)]/30",
    gradient: "hover:bg-gradient-to-br hover:from-card hover:to-[var(--success)]/5",
    textGradient: "linear-gradient(135deg, #1F1115, #1F8A5F)",
  },
};

function StatCard({ def, value, loading }: { def: StatDef; value: number; loading: boolean }) {
  const Icon = def.icon;
  const tone = TONE_STYLES[def.tone];
  return (
    <div
      className={cn(
        "group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300",
        "hover:shadow-md hover:ring-2 hover:ring-primary/20",
        "border-t-2",
        tone.border,
        tone.gradient,
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "inline-flex size-12 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110",
            tone.circle,
          )}
          style={{
            transition: "box-shadow 300ms ease, transform 300ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 0 12px 2px rgba(255, 45, 120, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <Icon className={cn("size-5", tone.icon)} aria-hidden />
        </div>
        {loading ? (
          <ShimmerSkeleton className="h-10 w-24" />
        ) : (
          <CountUp
            value={value}
            duration={1.1}
            gradient={tone.textGradient}
            className="text-4xl font-bold"
          />
        )}
      </div>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{def.label}</p>
    </div>
  );
}

export function StatsDashboard() {
  const [data, setData] = React.useState<StatsPayload["stats"] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/stats", { headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as StatsPayload;
        if (cancelled) return;
        setData(json.stats);
        setLoading(false);
      })
      .catch((err) => {
        // Silent fail — hide the section, never break the page.
        console.warn("[StatsDashboard] failed to load stats:", err);
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Error state: hide the section silently so the page never breaks.
  if (failed) return null;

  return (
    <section
      id="stats"
      aria-label="Statistik komunitas Saratrasaa"
      className="relative overflow-hidden bg-gradient-to-b from-secondary/30 to-background px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
    >
      {/* Pattern overlay — a faint pink dot grid that sits behind the
          stat cards. The radial-gradient pattern repeats every 24px and
          is held at 4% opacity so it reads as texture, not decoration.
          pointer-events-none + aria-hidden keep it purely cosmetic. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--pink-primary) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.04,
        }}
      />

      {/* Decorative wave at the BOTTOM of the section — a soft pink-soft
          sine curve that bleeds into the next section. Sits at the very
          bottom edge, full width, height 48px so it doesn't crowd the
          stat cards above. */}
      <svg
        aria-hidden
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-0 left-0 right-0 -z-0 h-8 w-full sm:h-12"
      >
        <path
          d="M0,30 Q150,10 300,30 T600,30 T900,30 T1200,30 L1200,60 L0,60 Z"
          fill="var(--pink-soft)"
          opacity="0.25"
        />
        <path
          d="M0,40 Q150,20 300,40 T600,40 T900,40 T1200,40"
          fill="none"
          stroke="var(--pink-primary)"
          strokeWidth="1.5"
          opacity="0.18"
        />
      </svg>

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        {/* Section Header */}
        <RevealOnScroll className="mb-10 max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Dampak Kami
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Angka Bicara Lebih Keras
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Setiap angka adalah bukti nyata aksi relawan Saratrasaa.
          </p>
        </RevealOnScroll>

        <RevealOnScroll delay={0.15}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {STATS.map((def) => (
              <StatCard
                key={def.key}
                def={def}
                value={data ? def.getValue(data) : 0}
                loading={loading}
              />
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

export default StatsDashboard;
