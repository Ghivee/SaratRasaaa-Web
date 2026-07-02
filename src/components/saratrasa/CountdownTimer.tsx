'use client';

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CountdownTimerProps {
  /** Target event date in ISO format "YYYY-MM-DD". Countdown is computed to start-of-day local time. */
  targetDate: string;
  /** Optional label, e.g. "Menuju event:". Defaults to "Menuju event:". */
  label?: string;
  /** Optional event title shown under the label, e.g. "Bersih Pantai Pangandaran #3". */
  eventTitle?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const EMPTY_TIME: TimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

/** Compute the time difference between now and target. Returns zeros if already past. */
function computeTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return EMPTY_TIME;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

/** Build a Date for start-of-day of the given YYYY-MM-DD in local time. */
function parseStartOfDay(iso: string): Date | null {
  // Expecting "YYYY-MM-DD" — split to avoid TZ surprises from `new Date(iso)`.
  const parts = iso.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function TimeBox({ value, unit, isSeconds = false }: { value: number; unit: string; isSeconds?: boolean }) {
  return (
    <div
      className={cn(
        "bg-gradient-to-b from-secondary to-secondary/70 rounded-xl p-3 text-center min-w-[64px] sm:min-w-[80px]",
        "border-t-2 border-t-primary/30 shadow-md",
        "transition-transform duration-200 hover:scale-105",
        isSeconds && "animate-pulse-subtle"
      )}
    >
      <div
        className="font-mono text-3xl font-bold tabular-nums text-primary sm:text-4xl"
        style={{ textShadow: "0 1px 2px rgba(255, 45, 120, 0.15)" }}
      >
        {pad(value)}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
        {unit}
      </div>
    </div>
  );
}

function Colon() {
  return (
    <span
      aria-hidden
      className="font-mono text-2xl font-bold text-primary animate-pulse sm:text-3xl self-center"
    >
      :
    </span>
  );
}

export function CountdownTimer({ targetDate, label = "Menuju event:", eventTitle }: CountdownTimerProps) {
  const reduceMotion = useReducedMotion();
  const target = React.useMemo(() => parseStartOfDay(targetDate), [targetDate]);

  // Start with zeros so SSR + first client paint match. Update post-mount.
  const [timeLeft, setTimeLeft] = React.useState<TimeLeft>(EMPTY_TIME);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (!target) return;

    // Sync immediately so we don't show zeros for a full second.
    setTimeLeft(computeTimeLeft(target));

    const id = window.setInterval(() => {
      setTimeLeft(computeTimeLeft(target));
    }, 1000);

    return () => window.clearInterval(id);
  }, [target]);

  // Invalid date guard — render nothing useful, just muted text.
  if (!target) {
    return (
      <Card className="border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Tanggal event tidak valid.
        </p>
      </Card>
    );
  }

  const isPast = mounted && target.getTime() <= Date.now();
  const isLive = isPast && timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

  return (
    <Card
      className={cn(
        "p-4 sm:p-5 shadow-lg",
        "bg-gradient-to-r from-primary/5 via-card to-[var(--amber)]/5",
        "ring-1 ring-primary/20 animate-ring-pulse",
        "border-border/50"
      )}
    >
      <div className="flex flex-col items-center justify-center gap-1.5 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-primary sm:text-base">
          {label}
        </p>
        {eventTitle && (
          <p className="font-display text-base font-bold text-foreground sm:text-lg">
            {eventTitle}
          </p>
        )}
      </div>

      {isPast ? (
        isLive ? (
          <div className="mt-4 flex justify-center">
            <Badge
              className={cn(
                "rounded-full px-5 py-2 text-sm font-semibold text-white",
                "bg-[var(--success)] shadow-lg shadow-[var(--success)]/30",
                "animate-pulse-amber" // reuse existing pulse animation
              )}
              style={{ boxShadow: "0 0 20px rgba(31, 138, 95, 0.3)" }}
            >
              <span
                aria-hidden
                className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-white"
              />
              Event sedang berlangsung!
            </Badge>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Event telah selesai.
          </p>
        )
      ) : (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3"
        >
          <TimeBox value={timeLeft.days} unit="Hari" />
          <Colon />
          <TimeBox value={timeLeft.hours} unit="Jam" />
          <Colon />
          <TimeBox value={timeLeft.minutes} unit="Menit" />
          <Colon />
          <TimeBox value={timeLeft.seconds} unit="Detik" isSeconds />
        </motion.div>
      )}
    </Card>
  );
}

export default CountdownTimer;
