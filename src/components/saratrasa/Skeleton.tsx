'use client';

/**
 * Skeleton — reusable shimmer-skeleton primitives (Task 8-B).
 *
 * Why shimmer? A flat `animate-pulse` block reads as "broken" — it just
 * blinks. A shimmer sweep reads as "loading" because the gradient motion
 * implies active work happening behind the scenes. The perceived wait time
 * drops noticeably even when the actual fetch time is identical.
 *
 * All shimmer skeletons here share one CSS keyframe (`shimmer-sweep`,
 * declared in globals.css) so the visual rhythm stays consistent across
 * the app and one `prefers-reduced-motion` rule disables all of them at
 * once.
 *
 * Public surface:
 *   - <ShimmerSkeleton />   — base block, pass className for sizing/shape
 *   - <HeroSkeleton />      — placeholder for the Hero section
 *   - <EventCardSkeleton /> — placeholder for an event card (cover + body)
 *   - <TicketSkeleton />    — placeholder for the TicketCard (2-col stub)
 */

import { cn } from "@/lib/utils";

/**
 * ShimmerSkeleton — the base building block.
 *
 * Renders a rounded rect with a translucent background and an absolutely
 * positioned gradient bar that sweeps left→right on a 1.6s loop. The bar
 * is a `::before` pseudo-element via the `before:` Tailwind utilities, so
 * there's no extra DOM weight per skeleton.
 *
 * Pass any Tailwind className to size and shape it (e.g. "h-4 w-24" or
 * "aspect-video w-full"). The shimmer is clipped by `overflow-hidden` so
 * the gradient never leaks outside the rounded box.
 */
export function ShimmerSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-secondary/60",
        // Sweep bar: starts off-screen left (-translate-x-full), animates to
        // +100% (off-screen right) over 1.6s, infinite. The via-white/40
        // mid-keyframe gives the gradient a soft pink-tinted sheen against
        // the blush-pink secondary background.
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer-sweep_1.6s_infinite] before:bg-gradient-to-r",
        "before:from-transparent before:via-white/50 before:to-transparent",
        // Respect reduced motion at the utility layer too — the keyframe
        // itself is disabled in globals.css, but the bar would still sit
        // off-screen visually without this guard (it would never move,
        // making the block look like a flat bg). Hiding the pseudo entirely
        // under reduced motion keeps the skeleton as a calm flat block.
        "motion-reduce:before:hidden motion-reduce:before:content-none",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Composed skeletons — match the layout shape of real components             */
/* -------------------------------------------------------------------------- */

/**
 * HeroSkeleton — placeholder for the Hero section while the active event
 * fetch is in flight. Mirrors Hero's two-column layout: a text column on
 * the left (badge + heading + paragraph + 2 buttons) and an image frame
 * on the right.
 *
 * Used by: Hero.tsx when `activeLoading` is true and there's no cached
 * event to show.
 */
export function HeroSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Left column — text */}
      <div className="flex flex-col gap-4">
        <ShimmerSkeleton className="h-7 w-44 rounded-full" />
        <ShimmerSkeleton className="h-12 w-full" />
        <ShimmerSkeleton className="h-12 w-3/4" />
        <ShimmerSkeleton className="h-4 w-full" />
        <ShimmerSkeleton className="h-4 w-5/6" />
        <div className="mt-4 flex gap-3">
          <ShimmerSkeleton className="h-11 w-40 rounded-full" />
          <ShimmerSkeleton className="h-11 w-32 rounded-full" />
        </div>
      </div>
      {/* Right column — image frame */}
      <div className="relative">
        <ShimmerSkeleton className="aspect-[4/3] w-full rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * EventCardSkeleton — placeholder for a single event card.
 *
 * Mirrors the layout of UpcomingEvents / HistorySection cards: a 16:9
 * cover image on top, then a body with a title line, two meta lines
 * (date + location), two body lines, and a footer row.
 */
export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <ShimmerSkeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-5">
        <ShimmerSkeleton className="h-5 w-3/4" />
        <div className="flex gap-4">
          <ShimmerSkeleton className="h-4 w-24" />
          <ShimmerSkeleton className="h-4 w-24" />
        </div>
        <ShimmerSkeleton className="h-4 w-full" />
        <ShimmerSkeleton className="h-4 w-2/3" />
        <div className="flex items-center justify-between border-t border-border pt-2">
          <ShimmerSkeleton className="h-5 w-20" />
          <ShimmerSkeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * TicketSkeleton — placeholder for the TicketCard.
 *
 * Mirrors the 2-column perforated ticket layout: left panel has a QR
 * square + a wide kode line, right panel has stacked info rows. Keeps
 * the same max-width and rounded-2xl shape so the user sees the ticket
 * "appearing" in place rather than the layout collapsing and jumping.
 *
 * Used by: CekStatus.tsx while the cek-status API is in flight (after
 * the user clicks "Cek Status" but before the response comes back).
 */
export function TicketSkeleton() {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* Left panel — QR + kode */}
        <div className="flex flex-col items-center gap-3 p-5 sm:p-6">
          <ShimmerSkeleton className="h-5 w-44 rounded-md" />
          <ShimmerSkeleton className="size-44 rounded-lg" />
          <ShimmerSkeleton className="h-3 w-40" />
          <ShimmerSkeleton className="h-7 w-40" />
        </div>
        {/* Right panel — info rows */}
        <div className="space-y-3 border-t-2 border-dashed border-pink-soft p-5 sm:border-t-0 sm:border-l-2">
          <ShimmerSkeleton className="h-3 w-12" />
          <ShimmerSkeleton className="h-5 w-3/4" />
          <div className="space-y-2 pt-1">
            <ShimmerSkeleton className="h-4 w-full" />
            <ShimmerSkeleton className="h-4 w-2/3" />
            <ShimmerSkeleton className="h-4 w-5/6" />
          </div>
          <div className="space-y-2 pt-1">
            <ShimmerSkeleton className="h-4 w-full" />
            <ShimmerSkeleton className="h-4 w-1/2" />
            <ShimmerSkeleton className="h-4 w-3/4" />
          </div>
          <ShimmerSkeleton className="mt-2 h-5 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default ShimmerSkeleton;
