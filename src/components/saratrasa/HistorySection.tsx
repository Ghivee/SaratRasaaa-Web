'use client';

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MapPin, MessageCircle, Calendar, ArrowRight, ArrowRightCircle } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShimmerSkeleton } from "./Skeleton";
import { BlobShape } from "./DecorativePatterns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { HistoryEvent } from "./types";
import { RevealOnScroll } from "./RevealOnScroll";

interface HistorySectionProps {
  events: HistoryEvent[];
  loading: boolean;
  /** Optional callback fired when the empty-state CTA "Daftar Event Aktif" is clicked.
   *  If absent, the button dispatches a `saratrasa:goto` event so home-client
   *  can switch to the daftar view (same pattern as GalleryView). */
  onDaftarActive?: () => void;
}

/** Pick cover image: explicit fotoCover > fotoDok[0] > keyword-based default. */
function pickCover(event: HistoryEvent): string {
  if (event.fotoCover) return event.fotoCover;
  if (event.fotoDok && event.fotoDok.length > 0) return event.fotoDok[0];
  const j = (event.judul || "").toLowerCase();
  if (j.includes("sungai") || j.includes("cikapundung")) {
    return "/history-cikapundung.jpg";
  }
  if (j.includes("donor") || j.includes("darah")) {
    return "/history-donor.jpg";
  }
  return "/hero-volunteers.jpg";
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

function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

function HistorySkeletonCard() {
  return (
    <Card className="overflow-hidden py-0">
      <ShimmerSkeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <ShimmerSkeleton className="h-5 w-3/4" />
        <ShimmerSkeleton className="h-4 w-1/2" />
        <ShimmerSkeleton className="h-4 w-2/3" />
        <ShimmerSkeleton className="mt-2 h-8 w-40" />
      </div>
    </Card>
  );
}

export function HistorySection({ events, loading, onDaftarActive }: HistorySectionProps) {
  const reduceMotion = useReducedMotion();
  const [openId, setOpenId] = React.useState<string | null>(null);
  // loadedCovers tracks which event cover images have finished loading,
  // keyed by event.id. Used to cross-fade the placeholder out and fade
  // the <Image> in (500ms opacity transition).
  const [loadedCovers, setLoadedCovers] = React.useState<Record<string, boolean>>({});
  const markCoverLoaded = React.useCallback((id: string) => {
    setLoadedCovers((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);
  const active = React.useMemo(
    () => events.find((e) => e.id === openId) ?? null,
    [events, openId]
  );

  function handleDaftarActive() {
    if (onDaftarActive) {
      onDaftarActive();
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("saratrasa:goto", { detail: "daftar" }));
    }
  }

  return (
    <section
      id="history"
      className="px-4 py-14 sm:px-6 lg:px-8 lg:py-20"
      aria-labelledby="history-heading"
    >
      <div className="mx-auto w-full max-w-7xl">
        <RevealOnScroll className="max-w-3xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Riwayat Aksi
          </p>
          <h2
            id="history-heading"
            className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Cerita Volunter Kami
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Setiap bekas kaki di lapangan jadi cerita.
          </p>
        </RevealOnScroll>

        {/* Loading state */}
        {loading && (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <HistorySkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && events.length === 0 && (
          <div className="mt-10">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="relative mx-auto flex max-w-2xl flex-col items-center gap-5 overflow-hidden rounded-3xl border border-dashed border-primary/20 bg-gradient-to-br from-secondary/40 via-secondary/15 to-transparent p-10 text-center sm:p-14"
            >
              {/* Decorative blobs — pink on the left, amber on the right */}
              <BlobShape
                color="pink"
                className="-left-12 -top-8 size-52"
                opacity={0.1}
                animate={!reduceMotion}
              />
              <BlobShape
                color="amber"
                className="-right-10 -bottom-10 size-44"
                opacity={0.08}
                animate={!reduceMotion}
              />

              {/* Large animated MessageCircle illustration with pulse ring */}
              <div className="relative z-10 inline-flex size-24 items-center justify-center rounded-full bg-card shadow-md ring-1 ring-inset ring-primary/15 sm:size-28">
                <div
                  aria-hidden
                  className={cn(
                    "absolute inset-0 rounded-full bg-primary/5",
                    !reduceMotion && "animate-pulse-ring-soft",
                  )}
                />
                <MessageCircle
                  className={cn(
                    "size-12 text-primary sm:size-14",
                    !reduceMotion && "animate-float-vertical",
                  )}
                  aria-hidden
                />
              </div>

              <div className="relative z-10 space-y-2">
                <h3 className="font-display text-2xl font-bold text-foreground">
                  Cerita pertama Saratrasaa akan muncul di sini
                </h3>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Kami belum punya dokumentasi event yang sudah selesai — tapi
                  aksi sedang berjalan! Daftar event aktif sekarang, jadi bagian
                  dari cerita pertama yang akan dikenang.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleDaftarActive}
                className={cn(
                  "btn-press relative z-10 inline-flex items-center gap-2 rounded-full",
                  "bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md",
                  "hover:bg-primary/90 hover:shadow-lg transition-all duration-200",
                )}
              >
                <ArrowRightCircle className="size-4" aria-hidden />
                Daftar Event Aktif
              </Button>
            </motion.div>
          </div>
        )}

        {/* Cards grid */}
        {!loading && events.length > 0 && (
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event, i) => {
              const cover = pickCover(event);
              const recap = event.recap ? truncate(event.recap, 120) : null;
              return (
                <motion.div
                  key={event.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                >
                  <Card className="group h-full overflow-hidden py-0 transition-shadow duration-300 hover:shadow-md">
                    <div className="relative aspect-video w-full overflow-hidden bg-secondary/40">
                      {/* Placeholder behind the image — a blush-pink box that
                          cross-fades out once <Image> fires onLoad. Without
                          this, the card shows an empty white square while
                          the bytes stream in, which reads as "broken". */}
                      <div
                        aria-hidden
                        className={cn(
                          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-background transition-opacity duration-500",
                          loadedCovers[event.id] ? "opacity-0" : "opacity-100",
                        )}
                      >
                        <Calendar className="size-10 text-primary/30" aria-hidden />
                      </div>
                      <Image
                        src={cover}
                        alt={`Dokumentasi ${event.judul}`}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        loading="lazy"
                        onLoad={() => markCoverLoaded(event.id)}
                        className={cn(
                          "object-cover transition-all duration-500 group-hover:scale-105",
                          loadedCovers[event.id] ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {/* Gradient overlay — pink-soft wash from bottom, fades in on hover */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--pink-soft)]/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      />
                      <Badge
                        className="absolute left-3 top-3 rounded-full bg-[var(--success)] px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm"
                      >
                        Selesai
                      </Badge>
                      {/* "Lihat Cerita" pill — slides up from bottom of image on hover */}
                      <Badge
                        aria-hidden
                        className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 translate-y-8 bg-background/95 px-3 py-1 text-xs font-semibold text-foreground opacity-0 shadow-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                      >
                        Lihat Cerita
                        <ArrowRight className="size-3" aria-hidden />
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-3 p-5">
                      <h3 className="font-display text-lg font-bold leading-snug text-foreground">
                        {event.judul}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="size-3.5" aria-hidden />
                          {formatTanggal(event.tanggal)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5" aria-hidden />
                          {event.lokasi}
                        </span>
                      </div>
                      {recap && (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {recap}
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOpenId(event.id)}
                        className="mt-1 h-9 w-fit px-0 text-primary hover:bg-transparent hover:text-primary/80"
                      >
                        Baca cerita lengkap
                        <ArrowRight className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl font-bold text-foreground">
                  {active.judul}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" aria-hidden />
                    {formatTanggal(active.tanggal)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden />
                    {active.lokasi}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {active.recap ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {active.recap}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Recap belum ditambahkan untuk event ini.
                </p>
              )}

              {active.fotoDok.length > 0 && (
                <div
                  className={cn(
                    "grid gap-3",
                    active.fotoDok.length === 1
                      ? "grid-cols-1"
                      : "grid-cols-2"
                  )}
                >
                  {active.fotoDok.map((src, idx) => (
                    <div
                      key={`${active.id}-${idx}`}
                      className={cn(
                        "relative overflow-hidden rounded-xl border border-border",
                        active.fotoDok!.length === 1 ? "aspect-video" : "aspect-square"
                      )}
                    >
                      <Image
                        src={src}
                        alt={`Dokumentasi ${active.judul} ke-${idx + 1}`}
                        fill
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default HistorySection;
