'use client';

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Sparkles, ArrowRight, History, ChevronDown, Mouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DotPattern } from "./DecorativePatterns";
import type { ActiveEventSummary } from "./types";
import { StackedPhotoGallery } from "./StackedPhotoGallery";

interface HeroProps {
  activeEvent: ActiveEventSummary | null;
  onDaftar: () => void;
}

function scrollToHistory() {
  if (typeof document === "undefined") return;
  document.getElementById("history")?.scrollIntoView({ behavior: "smooth" });
}

/**
 * ScrollIndicator — a small "scroll to explore" hint at the bottom of the hero.
 *
 * Renders a stylized mouse outline with a bouncing dot + a "Scroll untuk
 * eksplor" label and an animated chevron. Clicking it scrolls to the next
 * section (StatsDashboard). Hidden entirely under prefers-reduced-motion
 * (the indicator is purely decorative; the page is still scrollable).
 */
function ScrollIndicator() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <motion.button
      type="button"
      onClick={() => {
        // Scroll to the StatsDashboard section (first major section after hero).
        // Falls back to "cara-kerja" if StatsDashboard isn't mounted yet.
        const target =
          document.getElementById("stats") ??
          document.getElementById("cara-kerja");
        target?.scrollIntoView({ behavior: "smooth" });
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.0, duration: 0.6 }}
      className="group absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary rounded-xl px-3 py-2"
      aria-label="Scroll ke bawah untuk eksplor"
    >
      {/* Stylized mouse outline with bouncing dot inside */}
      <span
        aria-hidden
        className="relative flex size-7 items-start justify-center rounded-full border-2 border-current p-1.5"
      >
        <span className="block size-1 animate-bounce-chevron rounded-full bg-current" />
      </span>
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest">
        <Mouse className="size-3" aria-hidden />
        Scroll untuk eksplor
      </span>
      <ChevronDown
        className="size-3 animate-bounce-chevron"
        aria-hidden
      />
    </motion.button>
  );
}

/**
 * PARTICLES — 6 ambient pink dots that drift upward + fade, rendered behind
 * the hero content. Each particle has its own:
 *   - left%      : horizontal anchor (spread across the hero width)
 *   - bottom%    : vertical start position (lower third so they have room to travel)
 *   - size       : diameter in px (4–8px — small, never loud)
 *   - distance   : how far up it drifts before fading (80–160px)
 *   - duration   : cycle time (8–14s — slow, ambient)
 *   - delay      : staggered start so they don't all fire at once
 *   - opacity    : peak opacity (0.3–0.6 — subtle)
 *
 * The values are hand-tuned (not random) so SSR + client renders match —
 * Math.random() would cause a hydration mismatch.
 */
const PARTICLES = [
  { left: "12%", bottom: "8%",  size: 6, distance: 140, duration: 11, delay: 0,   opacity: 0.45 },
  { left: "28%", bottom: "22%", size: 4, distance: 100, duration: 9,  delay: 2.5, opacity: 0.35 },
  { left: "44%", bottom: "12%", size: 8, distance: 160, duration: 13, delay: 1,   opacity: 0.5 },
  { left: "62%", bottom: "30%", size: 5, distance: 90,  duration: 10, delay: 4,   opacity: 0.4 },
  { left: "78%", bottom: "10%", size: 6, distance: 130, duration: 12, delay: 1.5, opacity: 0.45 },
  { left: "88%", bottom: "26%", size: 4, distance: 80,  duration: 8,  delay: 3,   opacity: 0.3 },
] as const;

export function Hero({ activeEvent, onDaftar }: HeroProps) {
  const reduceMotion = useReducedMotion();
  const noActive = !activeEvent;
  const lowQuota = !!activeEvent && activeEvent.sisaKuota <= 5;
  const [isFlipped, setIsFlipped] = React.useState(false);
  return (
    <section
      id="beranda"
      className="relative w-full overflow-hidden px-4 pt-8 pb-12 sm:px-6 sm:pt-10 lg:px-8 lg:pt-10 flex flex-col justify-start"
    >
      {/* Subtle DotPattern overlay — a grid of tiny pink dots at 5% opacity
          sitting behind the hero content. Adds texture without competing
          with the gradient washes. aria-hidden + pointer-events-none
          (inherited from DotPattern's props). */}
      <DotPattern
        color="pink"
        size={28}
        opacity={0.05}
        className="-z-10"
      />

      {/* Decorative gradient overlay — 3 large blurred circles (pink + amber
          at 5% opacity) sitting behind the hero content. Adds warmth without
          competing with the foreground. pointer-events-none + aria-hidden so
          it's purely cosmetic.

          The wrapper carries `animate-hue-shift` (20s loop) so the wash of
          pink + amber slowly drifts its hue — a barely-perceptible ambient
          motion that makes the hero feel alive. Skipped under
          prefers-reduced-motion (CSS guard in globals.css). */}
      <div
        aria-hidden
        className="animate-hue-shift pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        {/* Top-right pink wash */}
        <div className="absolute -right-24 -top-24 size-[32rem] rounded-full bg-primary/5 blur-3xl" />
        {/* Bottom-left amber wash */}
        <div className="absolute -bottom-32 -left-24 size-[28rem] rounded-full bg-[var(--amber)]/5 blur-3xl" />
        {/* Center pink wash — softer, sits behind the grid */}
        <div className="absolute left-1/2 top-1/2 size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        {/* Diagonal gradient film — a low-opacity linear gradient that
            stretches corner-to-corner, tinted pink→amber→pink. Combined
            with the hue-shift on the parent this creates a slow color
            drift across the whole hero backdrop. */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--pink-primary) 0%, var(--amber) 50%, var(--pink-primary) 100%)",
            backgroundSize: "200% 200%",
          }}
        />
      </div>

      {/* Floating particle dots — 6 tiny pink dots that drift upward + fade,
          giving the hero a sense of gentle ambient motion. Each particle
          gets its own random-ish left%, float-distance, duration, delay,
          and opacity via inline CSS custom props consumed by the
          `particle-float` keyframe (globals.css). Only rendered when
          motion is OK — under reduced-motion the dots are skipped entirely
          (the @media rule freezes them anyway, but we avoid rendering
          anything for cleaner SSR). */}
      {!reduceMotion && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="animate-particle-float absolute rounded-full bg-primary"
              style={{
                left: p.left,
                bottom: p.bottom,
                width: p.size,
                height: p.size,
                // Custom props consumed by the `particle-float` keyframe.
                ["--float-distance" as string]: `${p.distance}px`,
                ["--particle-opacity" as string]: p.opacity,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                animationIterationCount: "infinite",
                animationTimingFunction: "ease-in-out",
              }}
            />
          ))}
        </div>
      )}

      {/* Floating geometric shapes — pastel pink & amber, low opacity.
          Only rendered when motion is OK (no reduced-motion). */}
      {!reduceMotion && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {/* Floating circle — top-left area */}
          <div
            className="absolute left-[8%] top-[12%] size-10 rounded-full border-2 border-primary/15 bg-primary/5 sm:size-14"
            style={{ animation: 'float-slow 9s ease-in-out infinite' }}
          />
          {/* Floating triangle — right-center area */}
          <div
            className="absolute right-[12%] top-[35%] size-0 border-l-[14px] border-r-[14px] border-b-[24px] border-l-transparent border-r-transparent border-b-[var(--amber)]/15 sm:border-l-[18px] sm:border-r-[18px] sm:border-b-[30px]"
            style={{ animation: 'float-slow 11s ease-in-out infinite', animationDelay: '2s' }}
          />
          {/* Small floating circle — bottom-right */}
          <div
            className="absolute bottom-[18%] right-[25%] size-6 rounded-full bg-[var(--amber)]/10 sm:size-8"
            style={{ animation: 'float-slow 8s ease-in-out infinite', animationDelay: '1s' }}
          />
          {/* Tiny floating diamond — center-left */}
          <div
            className="absolute left-[20%] bottom-[25%] size-5 rotate-45 rounded-sm bg-primary/10 sm:size-7"
            style={{ animation: 'float-slow 10s ease-in-out infinite', animationDelay: '3.5s' }}
          />
        </div>
      )}

      <div className="mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-2 lg:gap-8 relative z-10">
        {/* Left column */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-4 sm:gap-5"
        >
          {/* Badge with shimmer effect */}
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-xs font-medium text-foreground relative overflow-hidden">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            Komunitas Volunteer Muda
            {/* Shimmer overlay — a gradient that slides across the badge */}
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
              style={{
                backgroundSize: '200% 100%',
                animation: 'shimmer 3s ease-in-out infinite',
              }}
            />
          </div>

          <h1
            className="font-display font-bold leading-[1.1] tracking-tight text-foreground"
            style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
          >
            Tangan kecil yang menggerakkan{' '}
            <span className="relative inline-block">
              kebaikan besar
              {/* Pink underline accent */}
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-primary/60 sm:h-[4px]"
              />
            </span>
            .
          </h1>

          <p className="max-w-prose text-sm text-muted-foreground sm:text-base leading-relaxed">
            Saratrasaa adalah wadah pemuda-pemudi di Banjarnegara yang bergerak aktif memberikan dampak positif melalui berbagai kegiatan sosial. Mulai dari kunjungan berbagi ke panti asuhan, program edukasi ke sekolah-sekolah, hingga aksi nyata kepedulian lingkungan lainnya.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-1">
            <Button
              type="button"
              onClick={onDaftar}
              disabled={noActive}
              className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              Daftar Sekarang
              <ArrowRight className="size-4 ml-1" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={scrollToHistory}
              className="h-10 rounded-full px-5 text-sm font-medium text-foreground hover:bg-secondary hover:text-foreground"
            >
              <History className="size-4 mr-1" aria-hidden />
              Lihat Riwayat
            </Button>
          </div>

          {activeEvent && (
            <div className="mt-3 sm:mt-4 w-full max-w-lg rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/50 p-4 transition-all duration-300 hover:shadow-md border-l-4 border-l-primary">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <span className="inline-block size-2 animate-pulse rounded-full bg-primary" aria-hidden />
                Pendaftaran dibuka
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-lg font-bold text-foreground">
                  {activeEvent.judul}
                </p>
                <Badge
                  className={cn(
                    "rounded-full bg-background px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-inset ring-border",
                    lowQuota && "animate-pulse-amber bg-[var(--amber)] text-foreground"
                  )}
                >
                  Sisa kuota: {activeEvent.sisaKuota}
                </Badge>
              </div>
            </div>
          )}
        </motion.div>

        {/* Right column — image with floating blobs + decorative tape */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative mt-8 lg:mt-0 mx-auto w-full flex items-center justify-center lg:justify-end"
        >
          {/* Decorative blobs */}
          <div
            aria-hidden
            className="animate-float-slow pointer-events-none absolute -left-6 -top-6 size-32 rounded-full bg-primary/30 blur-2xl sm:size-44"
          />
          <div
            aria-hidden
            className="animate-float-slow pointer-events-none absolute -bottom-8 -right-6 size-36 rounded-full bg-[var(--amber)]/30 blur-2xl sm:size-52"
            style={{ animationDelay: "1.4s" }}
          />

          {/* Pink glow behind image frame */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-4 rounded-3xl"
            style={{ boxShadow: '0 0 60px -15px rgba(255, 45, 120, 0.15)' }}
          />

          <StackedPhotoGallery />
        </motion.div>
      </div>
    </section>
  );
}

export default Hero;
