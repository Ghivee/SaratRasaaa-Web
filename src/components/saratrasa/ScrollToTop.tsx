'use client';

import * as React from "react";
import { ArrowUp } from "lucide-react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useSpring,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * ScrollToTop — floating action button that appears once the user scrolls
 * past 400px and smoothly scrolls back to the top on click.
 *
 * - Fixed bottom-right, z-40 (sits above content but below Sheet/modal overlays).
 * - Uses a passive scroll listener with rAF throttling for perf.
 * - Entrance via Framer Motion (opacity + scale) — disabled under
 *   prefers-reduced-motion (renders plainly when visible).
 * - The button is hidden from screen readers when not visible (aria-hidden
 *   + tabIndex=-1) so keyboard/SR users don't encounter a non-actionable control.
 *
 * Task 9-B enhancement: a circular progress ring around the arrow icon
 * shows scroll progress (0% at top of page → 100% at bottom). Driven by
 * Framer Motion's `useScroll` (scrollYProgress) smoothed by `useSpring`,
 * then mapped to a SVG <circle>'s strokeDashoffset. The ring fills pink
 * as the user descends, giving a tangible sense of "how much page is left".
 */
export function ScrollToTop() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = React.useState(false);

  // Track the page scroll progress (0 → 1) and smooth it via a spring so
  // the ring doesn't jitter on every scroll event. Spring config: stiff
  // (no overshoot) + quick settle.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  // Ring geometry — the button is 48px (size-12). We draw an SVG circle of
  // radius 22 centered at 24,24 with stroke 3px. The circumference is
  // 2πr ≈ 138.23. strokeDasharray = circumference, strokeDashoffset goes
  // from circumference (0% progress, no fill) → 0 (100% progress, full ring).
  const RADIUS = 22;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // Map scroll progress (0 → 1) to strokeDashoffset (circumference → 0).
  // At the top of the page the offset equals the full circumference → the
  // ring is invisible. At the bottom the offset is 0 → the ring is a full
  // white circle. Reactive via Framer Motion's `useTransform`.
  const ringOffset = useTransform(
    progress,
    (v) => CIRCUMFERENCE * (1 - v),
  );

  React.useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 400);
        ticking = false;
      });
    };
    // Initial check (in case the page loads already scrolled, e.g. after refresh).
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleClick}
          aria-label="Kembali ke atas"
          aria-hidden={!visible}
          tabIndex={visible ? 0 : -1}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {/* Progress ring — an SVG overlay sitting on top of the button.
              The outer <svg> is absolutely positioned to fill the button
              (size-12 = 48px). The track circle is drawn faintly first,
              then the progress circle is drawn on top with strokeDashoffset
              bound to the smoothed scroll progress. We rotate -90deg so the
              ring fills clockwise from the top (12 o'clock). */}
          <ProgressRing
            radius={RADIUS}
            circumference={CIRCUMFERENCE}
            offset={reduceMotion ? undefined : ringOffset}
          />

          <ArrowUp className="relative size-5" aria-hidden />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/**
 * ProgressRing — the SVG overlay that draws the scroll progress.
 *
 * - Track circle: a faint white ring at 25% opacity, drawn first.
 * - Progress circle: a solid white ring on top, whose visible length is
 *   controlled by `strokeDashoffset` bound to the parent's smoothed scroll
 *   progress MotionValue. Under reduced-motion we skip the binding and
 *   render a static full ring (no live progress feedback).
 */
function ProgressRing({
  radius,
  circumference,
  offset,
}: {
  radius: number;
  circumference: number;
  offset?: MotionValue<number>;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      className="pointer-events-none absolute inset-0 size-full -rotate-90"
    >
      {/* Track */}
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth="3"
      />
      {/* Progress — animated via Framer Motion's strokeDashoffset binding.
          `strokeDasharray` is fixed at the circumference so the dash
          pattern is "one full ring"; `strokeDashoffset` (bound to the
          parent's smoothed scroll-progress MotionValue) then reveals/hides
          that ring based on scroll position.

          Under reduced-motion (no MotionValue passed), we render a static
          full ring at 50% opacity — decorative but not "live". */}
      <motion.circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        style={
          offset
            ? { strokeDashoffset: offset, opacity: 1 }
            : { strokeDashoffset: 0, opacity: 0.5 }
        }
      />
    </svg>
  );
}

export default ScrollToTop;
