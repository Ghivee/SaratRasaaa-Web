'use client';

import { RevealOnScroll } from '@/components/saratrasa/RevealOnScroll';
import { cn } from '@/lib/utils';
import { Quote } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Data — 6 authentic-sounding Indonesian volunteer testimonials               */
/* -------------------------------------------------------------------------- */

import type { Testimoni } from "./types";

function getInitials(name: string) {
  const parts = name.split(" ");
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

const colors = [
  "bg-primary/20 text-primary",
  "bg-[var(--amber)]/20 text-[var(--amber)]",
  "bg-[var(--success)]/20 text-[var(--success)]",
  "bg-secondary text-primary"
];



/* -------------------------------------------------------------------------- */
/* TestimonialCard                                                             */
/* -------------------------------------------------------------------------- */

function TestimonialCard({ t, index }: { t: Testimoni, index: number }) {
  const color = colors[index % colors.length];
  return (
    <div className="flex min-w-[280px] snap-start flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md md:min-w-0 overflow-hidden">
      {/* Decorative quote mark */}
      <Quote className="size-8 text-primary/40" fill="currentColor" />

      {/* Quote text */}
      <p className="flex-1 text-sm italic leading-relaxed text-foreground/90 sm:text-base break-words break-all">
        {t.pesan}
      </p>

      {/* Separator */}
      <div className="h-px w-full bg-border" />

      {/* Author row */}
      <div className="flex items-center gap-3">
        {/* Avatar circle with initials */}
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold',
            color
          )}
        >
          {getInitials(t.nama)}
        </div>
        <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-bold leading-tight text-ink truncate">
              {t.nama}
            </h3>
            <p className="text-xs text-muted-foreground truncate">{t.peran}</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TestimonialSection — "Kata Relawan"                                         */
/* -------------------------------------------------------------------------- */

export function TestimonialSection({ testimonis = [] }: { testimonis?: Testimoni[] }) {
  if (!testimonis || testimonis.length === 0) return null;
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="relative overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background py-16 sm:py-20 lg:py-24"
    >
      {/* Decorative oversized quotation marks — two huge, very-faded glyphs
          that frame the section like a pull-quote in a magazine. Top-left
          (opening ") and bottom-right (closing ") for diagonal balance.
          The font-display family (Bricolage Grotesque) gives them weight.
          pointer-events-none + aria-hidden — purely decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 left-2 select-none font-display text-[12rem] leading-none text-primary/[0.05] sm:text-[16rem] lg:text-[20rem]"
      >
        &ldquo;
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-2 select-none font-display text-[12rem] leading-none text-[var(--amber)]/[0.05] sm:text-[16rem] lg:text-[20rem]"
      >
        &rdquo;
      </span>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <RevealOnScroll className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Kata Relawan
          </p>
          <h2
            id="testimonials-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Mereka Sudah Turun, Ini Ceritanya
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Testimoni jujur dari relawan yang sudah ikut aksi Saratrasaa.
          </p>
        </RevealOnScroll>

        {/* Testimonial cards — horizontal scroll on mobile, 3-col grid on desktop */}
        <RevealOnScroll delay={0.15}>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-3 md:gap-6">
            {testimonis.map((t, i) => (
              <TestimonialCard key={t.id} t={t} index={i} />
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

export default TestimonialSection;
