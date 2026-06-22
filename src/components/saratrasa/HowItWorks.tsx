'use client';

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { UserPlus, QrCode, Ticket, ArrowDown, CheckCircle2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RevealOnScroll } from "./RevealOnScroll";

interface Step {
  number: string;
  stepIndex: number;
  title: string;
  body: string;
  icon: LucideIcon;
}

const STEP_COLORS: { accent: string; border: string; bg: string; badge: string; iconBg: string; iconText: string; numberGradient: string }[] = [
  {
    accent: "text-primary",
    border: "border-t-primary/30",
    bg: "bg-gradient-to-b from-primary/5 to-card",
    badge: "bg-primary text-primary-foreground",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    numberGradient: "linear-gradient(135deg, #FF2D78, #FFD6E5)",
  },
  {
    accent: "text-[var(--amber)]",
    border: "border-t-[var(--amber)]/30",
    bg: "bg-gradient-to-b from-[var(--amber)]/5 to-card",
    badge: "bg-[var(--amber)] text-[var(--ink)]",
    iconBg: "bg-[var(--amber)]/10",
    iconText: "text-[var(--amber)]",
    numberGradient: "linear-gradient(135deg, #FFB100, #FFF6F2)",
  },
  {
    accent: "text-[var(--success)]",
    border: "border-t-[var(--success)]/30",
    bg: "bg-gradient-to-b from-[var(--success)]/5 to-card",
    badge: "bg-[var(--success)] text-white",
    iconBg: "bg-[var(--success)]/10",
    iconText: "text-[var(--success)]",
    numberGradient: "linear-gradient(135deg, #1F8A5F, #FFF6F2)",
  },
];

const STEPS: Step[] = [
  {
    number: "01",
    stepIndex: 0,
    title: "Daftar & Isi Data",
    body: "Pilih event aktif, isi nama + kontak + jumlah orang. Total tagihan muncul real-time.",
    icon: UserPlus,
  },
  {
    number: "02",
    stepIndex: 1,
    title: "Bayar via QRIS",
    body: "Scan QRIS statis. Transfer PERSIS sampai 3 digit terakhir (kode unik). Upload bukti opsional.",
    icon: QrCode,
  },
  {
    number: "03",
    stepIndex: 2,
    title: "Dapat Tiket QR",
    body: "Verifikasi otomatis beberapa menit setelah transfer. Cek status, simpan tiket QR digital kamu.",
    icon: Ticket,
  },
];

function StepCard({ step, index }: { step: Step; index: number }) {
  const reduceMotion = useReducedMotion();
  const Icon = step.icon;
  const color = STEP_COLORS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
      className={cn(
        "group relative rounded-2xl border border-border p-6 transition-all duration-300",
        "hover:border-primary/30 hover:shadow-md",
        "border-t-2",
        color.border,
        color.bg,
      )}
    >
      {/* Giant step number — gradient text, more prominent */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-5 top-4 font-mono text-6xl font-bold select-none transition-opacity duration-300 group-hover:opacity-80"
        style={{
          background: color.numberGradient,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          opacity: 0.25,
        }}
      >
        {step.number}
      </span>

      <div className="relative z-10 flex flex-col gap-4">
        {/* Step badge + icon row */}
        <div className="flex items-center gap-3">
          {/* Circular step badge */}
          <span
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
              color.badge,
            )}
          >
            {step.stepIndex + 1}
          </span>
          {/* Icon container */}
          <div
            className={cn(
              "inline-flex size-12 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110",
              color.iconBg,
            )}
          >
            <Icon className={cn("size-5", color.iconText)} aria-hidden />
          </div>
          {/* Completion badge on last step */}
          {isLast && (
            <div className="ml-auto">
              <CheckCircle2 className="size-6 text-[var(--success)] opacity-60 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
            </div>
          )}
        </div>
        <h3 className="font-display text-xl font-bold text-foreground">
          {step.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
      </div>
    </motion.div>
  );
}

function StepConnector({
  isMobile,
  /** Index of the step this connector follows (0-based). Used to pick the
   *  gradient — step 0→1 is pink→amber, step 1→2 is amber→green. This
   *  visually reinforces the "progress through the Saratrasaa palette"
   *  metaphor already established by STEP_COLORS above. */
  index = 0,
}: {
  isMobile: boolean;
  index?: number;
}) {
  // Per-connector gradient stops. Each connector blends the color of the
  // step on its left into the color of the step on its right, so the whole
  // rail reads as one continuous pink → amber → green sweep.
  const STOPS: { from: string; to: string; dot: string }[] = [
    { from: "#FF2D78", to: "#FFB100", dot: "#FF2D78" }, // step 0 → 1
    { from: "#FFB100", to: "#1F8A5F", dot: "#FFB100" }, // step 1 → 2
  ];
  const stop = STOPS[index] ?? STOPS[0];
  const gradId = `howitworks-connector-${index}`;

  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center",
        isMobile ? "py-2" : "px-2 flex-shrink-0",
      )}
    >
      <div
        className={cn(
          "flex items-center",
          isMobile ? "flex-col" : "flex-row",
        )}
      >
        {/* Gradient line — an SVG <line> with a linearGradient stroke so the
            connector smoothly transitions from the previous step's color to
            the next step's color. The line itself is solid (no dashes) so
            the gradient reads cleanly. The previous dashed variant was OK
            but didn't carry the palette story; this one does. */}
        <svg
          width={isMobile ? 2 : 48}
          height={isMobile ? 32 : 2}
          viewBox={isMobile ? "0 0 2 32" : "0 0 48 2"}
          className="text-primary/40"
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={stop.from} />
              <stop offset="100%" stopColor={stop.to} />
            </linearGradient>
          </defs>
          {isMobile ? (
            <line x1="1" y1="0" x2="1" y2="32" stroke={`url(#${gradId})`} strokeWidth="2" />
          ) : (
            <line x1="0" y1="1" x2="48" y2="1" stroke={`url(#${gradId})`} strokeWidth="2" />
          )}
        </svg>

        {/* Decorative dot at the connection point — picked up from the
            "from" color so it visually anchors the gradient start. Tiny
            (size-2 = 8px) + low-opacity ring around it for a soft halo. */}
        <span className="relative inline-flex size-2.5 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full opacity-25 blur-[2px]"
            style={{ backgroundColor: stop.dot }}
          />
          <span
            className="relative size-2 rounded-full"
            style={{ backgroundColor: stop.dot }}
          />
        </span>

        {/* Arrow chevron at the end of the connector */}
        {isMobile ? (
          <ArrowDown className="size-4" style={{ color: stop.to }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path
              d="M6 4L14 10L6 16"
              stroke={stop.to}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="cara-kerja"
      aria-labelledby="cara-kerja-heading"
      className="bg-gradient-to-b from-background via-secondary/20 to-background px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl">
        <RevealOnScroll className="max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Cara Kerja
          </p>
          <h2
            id="cara-kerja-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Gampang Banget, 3 Langkah
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Dari klik daftar sampai pegang tiket, kurang dari 5 menit.
          </p>
        </RevealOnScroll>

        {/* Desktop: horizontal layout */}
        <div className="mt-10 hidden md:flex md:flex-row md:items-stretch md:gap-0">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.number}>
              <div className="flex-1">
                <StepCard step={step} index={i} />
              </div>
              {i < STEPS.length - 1 && (
                <StepConnector isMobile={false} index={i} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Mobile: vertical layout */}
        <div className="mt-10 flex flex-col items-stretch gap-0 md:hidden">
          {STEPS.map((step, i) => (
            <React.Fragment key={step.number}>
              <StepCard step={step} index={i} />
              {i < STEPS.length - 1 && (
                <StepConnector isMobile={true} index={i} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
