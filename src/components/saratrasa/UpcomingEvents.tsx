'use client';

import { useEffect, useState } from "react";
import { Calendar, MapPin, Instagram, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EventCardSkeleton } from "./Skeleton";
import { RevealOnScroll } from "./RevealOnScroll";
import { EventDetailModal } from "./EventDetailModal";
import { BlobShape, SparkleDecoration } from "./DecorativePatterns";

/** Upcoming event summary returned by GET /api/event/upcoming. */
interface UpcomingEvent {
  id: string;
  judul: string;
  deskripsi: string;
  tanggal: string; // ISO date string
  waktuMulai: string | null;
  lokasi: string;
  linkGmaps: string | null;
  fotoCover: string | null;
  harga: number;
  kuotaMax: number;
}

/** Format ISO date → "12 Maret 2025" (id-ID locale). */
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

/** Truncate to max chars, append ellipsis if cut. */
function truncate(s: string, max = 100): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

/** Format price → "Rp 75.000" or "Gratis" if 0. */
function formatHarga(harga: number): string {
  if (!harga || harga === 0) return "Gratis";
  return `Rp ${harga.toLocaleString("id-ID")}`;
}

/**
 * CoverImage — event card cover with a fade-in transition on load.
 *
 * Layout: a 16:9 box. While the image is still loading (or if there's no
 * cover at all), the box shows a blush-pink placeholder gradient with a
 * Calendar icon — same shape as the loaded image, so the card never
 * collapses. Once the <img> fires `onLoad`, we cross-fade it in via
 * opacity (500ms) for a smooth hand-off from placeholder → image.
 *
 * `loading="lazy"` keeps off-screen covers from fetching until the user
 * scrolls near them — a real bandwidth saver on long lists.
 */
function CoverImage({ src, alt }: { src: string | null; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // Reset on src change so re-renders with a new image start at opacity 0.
  // Uses the "adjusting state during render" pattern instead of an effect
  // to avoid cascading renders (see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  if (src !== prevSrc) {
    setPrevSrc(src);
    setLoaded(false);
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-secondary/40">
      {/* Placeholder — visible until the image finishes loading. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-background transition-opacity duration-500",
          loaded ? "opacity-0" : "opacity-100",
        )}
      >
        <Calendar className="size-16 text-primary/30" />
      </div>

      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-all duration-500",
            "group-hover:scale-105",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}

/**
 * UpcomingSkeletonCard — single placeholder card.
 * Delegates to the shared <EventCardSkeleton /> so the shimmer-sweep
 * animation stays consistent across every event-list surface.
 */
function UpcomingSkeletonCard() {
  return <EventCardSkeleton />;
}

/**
 * EmptyStateUpcoming — "no upcoming events" placeholder.
 *
 * A large Calendar illustration floats gently in a blush-pink card with
 * twinkling sparkles around it and a soft blob behind. Below the icon is
 * a friendly Indonesian heading + copy ("Tim kami sedang merencanakan aksi
 * berikutnya") and an Instagram CTA button so the user has somewhere to go.
 *
 * Animation: float-vertical on the icon, sparkle-twinkle on 4 sparkles
 * (staggered via inline animation-delay), all disabled under
 * prefers-reduced-motion (CSS guard in globals.css).
 */
function EmptyStateUpcoming() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5 }}
      className="relative mt-10 overflow-hidden rounded-3xl border border-dashed border-primary/20 bg-gradient-to-br from-secondary/40 via-secondary/15 to-transparent p-10 text-center sm:p-14"
    >
      {/* Decorative pink blob — sits behind the icon, very low opacity */}
      <BlobShape
        color="pink"
        className="-left-10 top-1/2 size-56 -translate-y-1/2 sm:size-72"
        opacity={0.1}
        animate={!reduceMotion}
      />
      <BlobShape
        color="amber"
        className="-right-8 -top-8 size-44 sm:size-56"
        opacity={0.08}
        animate={!reduceMotion}
      />

      {/* Twinkling sparkles around the calendar icon — 4 of them, staggered */}
      {!reduceMotion && (
        <SparkleDecoration
          color="pink"
          sparkles={[
            { top: "20%", left: "20%", size: 14, delay: 0,   duration: 2.4 },
            { top: "15%", left: "75%", size: 11, delay: 0.6, duration: 2.8 },
            { top: "70%", left: "18%", size: 12, delay: 1.2, duration: 3.0 },
            { top: "75%", left: "78%", size: 13, delay: 0.3, duration: 2.6 },
          ]}
        />
      )}

      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-5">
        {/* Large animated Calendar illustration */}
        <div className="relative inline-flex size-24 items-center justify-center rounded-3xl bg-card shadow-md ring-1 ring-inset ring-primary/15 sm:size-28">
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-3xl bg-primary/5",
              !reduceMotion && "animate-pulse-ring-soft",
            )}
          />
          <Calendar
            className={cn(
              "size-12 text-primary sm:size-14",
              !reduceMotion && "animate-float-vertical",
            )}
            aria-hidden
          />
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-2xl font-bold text-foreground">
            Belum ada event mendatang
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Tim kami sedang merencanakan aksi berikutnya. Pantau Instagram{" "}
            <a
              href="https://instagram.com/saratrasaaa"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              @saratrasaaa
            </a>{" "}
            untuk info terbaru!
          </p>
        </div>

        <a
          href="https://instagram.com/saratrasaaa"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "btn-press inline-flex items-center gap-2 rounded-full",
            "bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md",
            "transition-all duration-200 hover:bg-primary/90 hover:shadow-lg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          )}
        >
          <Instagram className="size-4" aria-hidden />
          Ikuti @saratrasaaa
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </motion.div>
  );
}

export function UpcomingEvents() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/event/upcoming", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="upcoming" className="container mx-auto px-4 py-12 md:py-16">
      <RevealOnScroll>
        <h2 className="font-display text-3xl font-bold md:text-4xl">
          Aksi Mendatang
        </h2>
        <p className="mt-2 text-muted-foreground">
          Pantau event berikutnya. Daftar sebelum kuota habis.
        </p>
      </RevealOnScroll>

      {/* Loading */}
      {loading && (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <UpcomingSkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && events.length === 0 && (
        <EmptyStateUpcoming />
      )}

      {/* Cards */}
      {!loading && events.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event, i) => (
            <RevealOnScroll key={event.id} delay={i * 0.1}>
              <article
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(event.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(event.id);
                  }
                }}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
              >
                {/* Cover — fades in on load; blush-pink placeholder behind. */}
                <CoverImage
                  src={event.fotoCover}
                  alt={event.judul}
                />
                <span className="pointer-events-none absolute left-3 top-3 m-0 rounded-full bg-[var(--amber)]/90 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
                  Coming Soon
                </span>

                {/* Body */}
                <div className="space-y-3 p-5">
                  <h3 className="font-display text-lg font-bold leading-tight text-ink">
                    {event.judul}
                  </h3>
                  <div className="flex gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 shrink-0" />
                      <span>{formatTanggal(event.tanggal)}{event.waktuMulai ? ` • ${event.waktuMulai} WIB` : ""}</span>
                    </span>
                    {event.linkGmaps ? (
                      <a 
                        href={event.linkGmaps} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex items-center gap-1.5 hover:text-primary transition-colors hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin className="size-3.5 shrink-0" />
                        <span>{event.lokasi}</span>
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span>{event.lokasi}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {truncate(event.deskripsi, 100)}
                  </p>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="font-mono font-bold text-primary">
                      {formatHarga(event.harga)}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-ink">
                      kuota {event.kuotaMax}
                    </span>
                  </div>
                </div>
              </article>
            </RevealOnScroll>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedId && (
        <EventDetailModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}

export default UpcomingEvents;
