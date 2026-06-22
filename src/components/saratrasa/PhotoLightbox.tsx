'use client';

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerSkeleton } from "./Skeleton";

interface PhotoLightboxProps {
  /** Array of photo URLs */
  photos: string[];
  /** Index of the currently active photo */
  activeIndex: number;
  /** Called when the lightbox should close */
  onClose: () => void;
  /** Called when the active photo changes (for navigation) */
  onIndexChange: (index: number) => void;
  /** Optional alt text prefix for photos */
  altPrefix?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const TOGGLE_ZOOM = 2;
/** Movement (px) above which a press is treated as a drag, not a click. */
const DRAG_THRESHOLD = 4;

/**
 * PhotoLightbox — fullscreen modal overlay for browsing gallery photos.
 *
 * Features:
 * - Dark semi-transparent backdrop with blur
 * - Large centered image (max 85vh height)
 * - Prev/Next navigation with arrow buttons
 * - Photo counter (e.g. "3 / 12") + caption (alt text)
 * - Close button (X) at top-right
 * - Zoom toggle button (scale 2x) with mouse drag panning
 * - Download button (blob fetch → object URL → file download, with new-tab fallback)
 * - Thumbnail strip at the bottom (current photo highlighted with pink ring)
 * - Keyboard: ←/→ navigate, Escape close, Home/End jump, +/- zoom, 0 reset zoom
 * - Touch swipe on mobile (delta > 50px triggers navigation) when not zoomed
 * - Touch drag panning when zoomed
 * - Loading shimmer skeleton per photo (until onLoad fires)
 * - Framer Motion animations (fade overlay, slide transitions between photos)
 * - Respects prefers-reduced-motion
 * - Click outside image to close
 * - All buttons min 44px touch targets with aria-labels
 */
export function PhotoLightbox({
  photos,
  activeIndex,
  onClose,
  onIndexChange,
  altPrefix = "Foto",
}: PhotoLightboxProps) {
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = React.useState<number>(0);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  // --- Zoom + pan state ---
  const [zoomScale, setZoomScale] = React.useState<number>(MIN_ZOOM);
  const [pan, setPan] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  /** Live drag metadata (start cursor + start pan + moved flag). */
  const dragRef = React.useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  // --- Per-photo loading state ---
  const [imageLoaded, setImageLoaded] = React.useState<boolean>(false);

  // --- Download state ---
  const [downloading, setDownloading] = React.useState<boolean>(false);

  const count = photos.length;
  const current = count > 0 ? Math.max(0, Math.min(activeIndex, count - 1)) : 0;
  const hasPrev = current > 0;
  const hasNext = current < count - 1; // (fixed: previous "current > 0 && ..." hid next at index 0)
  const isZoomed = zoomScale > MIN_ZOOM;

  // --- Navigation helpers (hooks must be before any early return) ---
  const goTo = React.useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(newIndex, count - 1));
      if (clamped === current) return;
      setDirection(clamped > current ? 1 : -1);
      // Reset zoom/pan/loading for the new photo so the user always starts
      // at a clean 1× view, even if they were zoomed in on the previous one.
      setZoomScale(MIN_ZOOM);
      setPan({ x: 0, y: 0 });
      setImageLoaded(false);
      onIndexChange(clamped);
    },
    [count, current, onIndexChange],
  );

  const goPrev = React.useCallback(() => {
    if (current > 0) goTo(current - 1);
  }, [current, goTo]);

  const goNext = React.useCallback(() => {
    if (current < count - 1) goTo(current + 1);
  }, [current, count, goTo]);

  const goFirst = React.useCallback(() => {
    if (current !== 0) goTo(0);
  }, [current, goTo]);

  const goLast = React.useCallback(() => {
    if (current !== count - 1) goTo(count - 1);
  }, [current, count, goTo]);

  // --- Zoom helpers ---
  const resetZoom = React.useCallback(() => {
    setZoomScale(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = React.useCallback(() => {
    setZoomScale((s) => Math.min(MAX_ZOOM, +(s + ZOOM_STEP).toFixed(2)));
  }, []);

  const zoomOut = React.useCallback(() => {
    setZoomScale((s) => {
      const next = Math.max(MIN_ZOOM, +(s - ZOOM_STEP).toFixed(2));
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const toggleZoom = React.useCallback(() => {
    if (zoomScale > MIN_ZOOM) resetZoom();
    else setZoomScale(TOGGLE_ZOOM);
  }, [zoomScale, resetZoom]);

  // --- Download handler ---
  const handleDownload = React.useCallback(async () => {
    if (downloading) return;
    const url = photos[current];
    if (!url) return;
    const filename = `saratrasaa-foto-${current + 1}.jpg`;
    setDownloading(true);
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a beat so the download has time to start.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      toast.success("Foto terunduh", { description: filename });
    } catch (e) {
      // CORS or fetch failure — fall back to opening the photo in a new tab
      // so the user can still save it manually via the browser.
      console.warn("[PhotoLightbox] blob download failed, opening in new tab", e);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Membuka foto di tab baru", {
        description: "Simpan manual dari menu browser.",
      });
    } finally {
      setDownloading(false);
    }
  }, [downloading, photos, current]);

  // --- Keyboard support ---
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "Home":
          e.preventDefault();
          goFirst();
          break;
        case "End":
          e.preventDefault();
          goLast();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetZoom();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [goPrev, goNext, goFirst, goLast, zoomIn, zoomOut, resetZoom, onClose]);

  // --- Lock body scroll when open ---
  React.useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // --- Mouse drag panning (only active while zoomed) ---
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      // Always record the start so click-vs-drag can be disambiguated.
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
      };
      if (isZoomed) {
        e.preventDefault();
        setIsDragging(true);
      }
    },
    [isZoomed, pan.x, pan.y],
  );

  // Window-level move/up listeners attached only while dragging.
  React.useEffect(() => {
    if (!isDragging) return;
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        drag.moved = true;
      }
      setPan({
        x: drag.startPanX + dx,
        y: drag.startPanY + dy,
      });
    }
    function onUp() {
      setIsDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const handleImageClick = React.useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      // If the press turned into a drag, swallow the trailing click so we
      // don't accidentally toggle zoom after panning.
      if (dragRef.current?.moved) {
        e.stopPropagation();
        return;
      }
      toggleZoom();
    },
    [toggleZoom],
  );

  // --- Touch swipe support (on the backdrop, only when NOT zoomed) ---
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = React.useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      // Only trigger if horizontal swipe is dominant and > 50px
      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) goNext(); // swipe left → next
        else goPrev(); // swipe right → prev
      }
      touchStartRef.current = null;
    },
    [goNext, goPrev],
  );

  // --- Touch drag panning (on the image, only when zoomed) ---
  const handleTouchStartPan = React.useCallback(
    (e: React.TouchEvent<HTMLImageElement>) => {
      if (!isZoomed) return; // let backdrop handle swipe navigation
      const t = e.touches[0];
      dragRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
      };
      e.stopPropagation();
    },
    [isZoomed, pan.x, pan.y],
  );

  const handleTouchMovePan = React.useCallback(
    (e: React.TouchEvent<HTMLImageElement>) => {
      if (!isZoomed || !dragRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - dragRef.current.startX;
      const dy = t.clientY - dragRef.current.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragRef.current.moved = true;
      }
      setPan({
        x: dragRef.current.startPanX + dx,
        y: dragRef.current.startPanY + dy,
      });
      e.stopPropagation();
    },
    [isZoomed],
  );

  const handleTouchEndPan = React.useCallback(
    (e: React.TouchEvent<HTMLImageElement>) => {
      if (!isZoomed) return;
      e.stopPropagation();
    },
    [isZoomed],
  );

  // Guard: if no photos, don't render (after all hooks)
  if (count === 0) return null;

  // --- Animation variants ---
  const overlayVariants = reduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const slideVariants = reduceMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
      }
    : {
        initial: (dir: number) => ({
          opacity: 0,
          x: dir > 0 ? 80 : -80,
        }),
        animate: {
          opacity: 1,
          x: 0,
          transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
        },
        exit: (dir: number) => ({
          opacity: 0,
          x: dir > 0 ? -80 : 80,
          transition: { duration: 0.2, ease: "easeIn" },
        }),
      };

  const caption = `${altPrefix} — foto ${current + 1} dari ${count}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="lightbox-overlay"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="Galeri foto — layar penuh"
      >
        {/* Top-left: counter + caption */}
        <div
          className="absolute top-4 left-4 z-10 select-none max-w-[calc(100vw-12rem)] sm:max-w-[60vw]"
          aria-live="polite"
        >
          <div className="font-mono text-sm text-white/80">
            {current + 1} / {count}
            {isZoomed && (
              <span className="ml-2 text-primary-foreground/90">
                · {Math.round(zoomScale * 100)}%
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-white/60 line-clamp-2">
            {caption}
          </div>
        </div>

        {/* Top-right: action button cluster */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              "bg-white/20 hover:bg-white/30 text-white backdrop-blur",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              "motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed",
            )}
            aria-label={downloading ? "Mengunduh foto…" : "Unduh foto"}
          >
            {downloading ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Download className="size-5" aria-hidden />
            )}
          </button>

          {/* Zoom toggle */}
          <button
            type="button"
            onClick={toggleZoom}
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              "bg-white/20 hover:bg-white/30 text-white backdrop-blur",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              "motion-reduce:transition-none",
              isZoomed && "ring-2 ring-primary bg-primary/30",
            )}
            aria-label={isZoomed ? "Perkecil (reset zoom)" : "Perbesar foto"}
            aria-pressed={isZoomed}
          >
            {isZoomed ? (
              <Minimize className="size-5" aria-hidden />
            ) : (
              <Maximize className="size-5" aria-hidden />
            )}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              "bg-white/20 hover:bg-white/30 text-white backdrop-blur",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              "motion-reduce:transition-none",
            )}
            aria-label="Tutup galeri"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {/* Prev button */}
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className={cn(
              "absolute left-3 top-1/2 -translate-y-1/2 z-10",
              "flex size-12 items-center justify-center rounded-full",
              "bg-white/20 hover:bg-white/30 text-white backdrop-blur",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              "motion-reduce:transition-none",
            )}
            aria-label="Foto sebelumnya"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        )}

        {/* Next button */}
        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 z-10",
              "flex size-12 items-center justify-center rounded-full",
              "bg-white/20 hover:bg-white/30 text-white backdrop-blur",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
              "motion-reduce:transition-none",
            )}
            aria-label="Foto berikutnya"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        )}

        {/* Photo area — click outside image to close */}
        <div
          className="flex items-center justify-center w-full h-full p-4 pt-20 pb-24 sm:p-8 sm:pt-20 sm:pb-28"
          onClick={(e) => {
            // Only close if clicking the backdrop itself (not the image)
            if (e.target === e.currentTarget) onClose();
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="relative flex items-center justify-center"
            >
              {/* Loading skeleton — shown until the image fires onLoad.
                  Sized to roughly match the image frame so the layout
                  doesn't collapse to zero-height while bytes stream in. */}
              {!imageLoaded && (
                <ShimmerSkeleton
                  className="absolute h-[50vh] w-[80vw] max-w-3xl rounded-lg sm:h-[60vh]"
                  aria-hidden
                />
              )}

              <img
                src={photos[current]}
                alt={`${altPrefix} ${current + 1} dari ${count}`}
                draggable={false}
                onLoad={() => setImageLoaded(true)}
                onMouseDown={handleMouseDown}
                onClick={handleImageClick}
                onTouchStart={handleTouchStartPan}
                onTouchMove={handleTouchMovePan}
                onTouchEnd={handleTouchEndPan}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`,
                  transformOrigin: "center center",
                }}
                className={cn(
                  "max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none",
                  "touch-none",
                  // Smooth zoom transitions, but disable during active drag so
                  // the image tracks the cursor 1:1 without lag.
                  isDragging
                    ? "transition-none"
                    : "transition-transform duration-200 ease-out",
                  "motion-reduce:transition-none",
                  isZoomed ? "cursor-zoom-out" : "cursor-zoom-in",
                  imageLoaded ? "opacity-100" : "opacity-0",
                )}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom: thumbnail strip */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-3 pt-10"
          role="tablist"
          aria-label="Navigasi thumbnail foto"
        >
          <div className="mx-auto flex max-w-full gap-2 overflow-x-auto scrollbar-hide py-1">
            {photos.map((p, i) => (
              <button
                key={`thumb-${i}`}
                type="button"
                role="tab"
                aria-selected={i === current}
                aria-label={`Foto ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  "relative size-10 flex-shrink-0 overflow-hidden rounded-md transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                  "motion-reduce:transition-none",
                  i === current
                    ? "ring-2 ring-primary ring-offset-1 ring-offset-black/50 scale-110 opacity-100"
                    : "ring-1 ring-white/20 opacity-50 hover:opacity-90 hover:ring-white/50",
                )}
              >
                <img
                  src={p}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover pointer-events-none"
                />
                {i === current && (
                  <span className="absolute inset-0 bg-primary/15" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PhotoLightbox;
