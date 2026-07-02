'use client';

import * as React from "react";
import {
  MapPin,
  Sparkles,
  Calendar,
  Camera,
  ZoomIn,
  Quote,
  Images,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerSkeleton } from "./Skeleton";
import { RevealOnScroll } from "./RevealOnScroll";
import { SectionDivider } from "./SectionDivider";
import { PhotoLightbox } from "./PhotoLightbox";

import type { GalleryItem } from "@/components/saratrasa/types";

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

/**
 * Build the ordered photo list for a gallery story.
 * Mirrors HistorySection's pickCover logic: if an explicit fotoCover exists,
 * surface it first (so the signature shot leads), then append the rest of
 * fotoDok, skipping any photo that's already the cover to avoid duplicates.
 */
function buildPhotoList(item: GalleryItem): string[] {
  const docs = item.fotoDok ?? [];
  if (!item.fotoCover) return docs;
  const rest = docs.filter((p) => p !== item.fotoCover);
  return [item.fotoCover, ...rest];
}

/**
 * Dispatch a saratrasa:goto custom event so the GalleryView CTA can ask
 * the home-client to switch views (e.g. back to beranda). Mirrors the
 * pattern used by DaftarWizard's "Cek Status Pembayaran" button.
 */
function gotoView(view: "beranda" | "daftar" | "cek-status" | "galeri") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("saratrasa:goto", { detail: view }));
}

function GallerySkeletonCard() {
  // Visual match for a story card skeleton — header row, lokasi line,
  // recap box, and a 4-col photo grid. Uses <ShimmerSkeleton /> so the
  // shimmer-sweep animation stays consistent across the app.
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <ShimmerSkeleton className="h-8 w-2/3" />
        <ShimmerSkeleton className="h-5 w-32" />
        <ShimmerSkeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <ShimmerSkeleton className="size-4 rounded-full" />
        <ShimmerSkeleton className="h-4 w-40" />
      </div>
      <div className="mt-5 rounded-lg bg-secondary/20 p-4">
        <ShimmerSkeleton className="h-4 w-full" />
        <ShimmerSkeleton className="mt-2 h-4 w-11/12" />
        <ShimmerSkeleton className="mt-2 h-4 w-3/4" />
      </div>
      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <ShimmerSkeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function StoryCard({ item }: { item: GalleryItem }) {
  const photos = buildPhotoList(item);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);

  function openLightbox(idx: number) {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  }

  // First photo (the cover) gets a 2×2 span — but only when there are
  // enough siblings to fill the grid around it. With 1-2 photos the big
  // tile would leave awkward gaps, so we fall back to a uniform grid.
  const coverSpans = photos.length >= 3;

  return (
    <article className="group/story relative bg-card rounded-2xl border border-border overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      {/* Decorative gradient header overlay — sits behind the header row,
          gives the top of the card a warm blush that fades into the card
          body. Pointer-events-none so it never eats clicks. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent"
      />

      <div className="relative p-6 md:p-8">
        {/* Header row — judul, tanggal, "Selesai" badge */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display text-2xl font-bold text-foreground">
            {item.judul}
          </h2>
          <span className="inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
            <Calendar className="size-3.5" aria-hidden />
            {formatTanggal(item.tanggal)}
          </span>
          <span
            className="inline-flex h-6 items-center justify-center gap-1.5 rounded-full bg-[var(--success)]/15 px-3 text-xs font-semibold text-[var(--success)] ring-1 ring-inset ring-[var(--success)]/30 animate-ring-pulse"
            title="Event telah selesai"
          >
            <span className="shrink-0 size-1.5 rounded-full bg-[var(--success)]" aria-hidden />
            <span>Selesai</span>
          </span>
        </header>

        {/* Lokasi */}
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 text-primary" aria-hidden />
          {item.lokasi}
        </p>

        {/* Recap box — decorative pink left border, "Cerita" label, italic */}
        {item.recap && (
          <div className="mt-5 max-w-3xl rounded-lg border-l-4 border-l-primary bg-gradient-to-r from-primary/[0.07] via-primary/[0.04] to-transparent p-4 md:p-5">
            <span className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary">
              <Quote className="size-3.5" aria-hidden />
              Cerita
            </span>
            <p className="text-base italic leading-relaxed text-ink whitespace-pre-line">
              {item.recap}
            </p>
          </div>
        )}

        {/* Photo gallery — masonry-like grid (first cover tile spans 2×2) */}
        {photos.length > 0 && (
          <>
            <div
              className={cn(
                "mt-6 grid gap-3",
                "[grid-auto-flow:dense] auto-rows-[100px] sm:auto-rows-[120px] md:auto-rows-[140px]",
                "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
              )}
            >
              {photos.map((foto, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  type="button"
                  onClick={() => openLightbox(idx)}
                  className={cn(
                    "group relative block overflow-hidden rounded-lg bg-secondary/40",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    "transition-all duration-300 motion-reduce:transition-none",
                    // Masonry span for the cover tile.
                    idx === 0 && coverSpans && "col-span-2 row-span-2",
                    // Border-glow on hover — a soft pink halo that reads as
                    // "this is clickable / interactive".
                    "hover:ring-2 hover:ring-primary/60 hover:shadow-[0_0_24px_-4px_rgba(255,45,120,0.45)]",
                  )}
                  aria-label={`Foto ${idx + 1} dari ${item.judul} — buka galeri`}
                >
                  {/* Using a plain <img> because fotoDok paths are dynamic
                      relative "/uploads/..." strings resolved at runtime.
                      The button's bg-secondary/40 acts as the loading
                      placeholder; the <img> cross-fades in once it fires
                      onLoad (opacity 0 → 100, 500ms). */}
                  <img
                    src={foto}
                    alt={`Dokumentasi ${item.judul} — foto ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                    onLoad={(e) => {
                      e.currentTarget.dataset.loaded = "1";
                    }}
                    className={cn(
                      "h-full w-full object-cover transition-all duration-500",
                      "group-hover:scale-105 motion-reduce:transition-none",
                      "[&[data-loaded='1']]:opacity-100 opacity-0",
                    )}
                  />

                  {/* Hover overlay — zoom icon + photo index "1/8".
                      Fades in on group-hover; hidden on touch-only devices
                      via the group-hover so tap still opens the lightbox. */}
                  <div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5",
                      "bg-gradient-to-t from-black/55 via-black/15 to-transparent",
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                      "motion-reduce:transition-none motion-reduce:opacity-60",
                    )}
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-white/25 backdrop-blur-sm ring-1 ring-white/40">
                      <ZoomIn className="size-5 text-white" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-white drop-shadow">
                      {idx + 1}/{photos.length}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Lightbox overlay */}
            {lightboxOpen && (
              <PhotoLightbox
                photos={photos}
                activeIndex={lightboxIndex}
                onClose={() => setLightboxOpen(false)}
                onIndexChange={setLightboxIndex}
                altPrefix={`Dokumentasi ${item.judul}`}
              />
            )}
          </>
        )}
      </div>
    </article>
  );
}

function EmptyState() {
  // Visually inviting empty state: a large floating Images icon inside a
  // gradient mesh background, friendly copy, and a CTA that routes the user
  // back to beranda where upcoming events are listed (so an empty gallery
  // never feels like a dead-end).
  //
  // Animation: float-vertical on the icon (a gentle up/down drift), disabled
  // under prefers-reduced-motion. The gradient mesh stays static.
  const [noMotion, setNoMotion] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setNoMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setNoMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-dashed border-pink-soft bg-gradient-to-b from-secondary/40 via-secondary/10 to-transparent p-10 text-center">
      {/* Gradient mesh — pink + amber radial washes behind the icon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.18,
          background: `
            radial-gradient(at 30% 30%, var(--pink-primary) 0px, transparent 45%),
            radial-gradient(at 75% 60%, var(--amber) 0px, transparent 50%)
          `,
        }}
      />

      {/* Large animated Images illustration */}
      <div className="relative mx-auto mb-5 inline-flex size-24 items-center justify-center rounded-3xl bg-card shadow-md ring-1 ring-inset ring-primary/15">
        <div
          aria-hidden
          className={
            "absolute inset-0 rounded-3xl bg-primary/5" +
            (noMotion ? "" : " animate-pulse-ring-soft")
          }
        />
        <Images
          className={
            "size-12 text-primary" +
            (noMotion ? "" : " animate-float-vertical")
          }
          aria-hidden
        />
      </div>

      <div className="relative z-10">
        <h3 className="font-display text-xl font-bold text-foreground">
          Galeri masih kosong
        </h3>
        <p className="mt-2 text-base text-muted-foreground">
          Cerita pertama akan muncul di sini setelah event pertama selesai.
          Sementara itu, lihat event mendatang dan ikut serta!
        </p>
        <button
          type="button"
          onClick={() => gotoView("beranda")}
          className={cn(
            "btn-press mt-6 inline-flex items-center gap-2 rounded-full",
            "bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground",
            "shadow-md hover:shadow-lg transition-shadow motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          )}
        >
          Lihat Event Mendatang
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
      <p className="text-base text-foreground">{message}</p>
    </div>
  );
}

export function GalleryView({ items = [], loading = false }: { items?: GalleryItem[], loading?: boolean }) {
  const error = null; // Removed internal error state since we fall back to empty array

  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      {/* Page header — decorative camera pattern above the heading */}
      <RevealOnScroll>
        <header className="mx-auto max-w-3xl text-center">
          <div className="mb-3 flex justify-center" aria-hidden>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary/40" />
              <span className="size-1.5 rounded-full bg-primary/60" />
              <Camera className="size-5 text-primary" />
              <span className="size-1.5 rounded-full bg-primary/60" />
              <span className="size-1.5 rounded-full bg-primary/40" />
            </div>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
            Galeri Kegiatan
          </h1>
          <p className="mt-3 text-base md:text-lg text-muted-foreground">
            Setiap cerita, setiap senyum, setiap langkah kecil. Inilah
            jejak Saratrasaa.
          </p>
        </header>
      </RevealOnScroll>

      {/* Body */}
      <div className="mt-10 flex flex-col gap-8">
        {loading ? (
          <>
            <GallerySkeletonCard />
            <GallerySkeletonCard />
            <GallerySkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((item, idx) => (
            <React.Fragment key={item.id}>
              <RevealOnScroll>
                <StoryCard item={item} />
              </RevealOnScroll>
              {idx < items.length - 1 && <SectionDivider variant="dots" />}
            </React.Fragment>
          ))
        )}
      </div>
    </section>
  );
}

export default GalleryView;
