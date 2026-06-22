'use client';

/**
 * DecorativePatterns — a set of reusable, composable background decorations
 * for the Saratrasaa beranda. Every element is:
 *   - aria-hidden  (purely cosmetic — invisible to screen readers)
 *   - pointer-events-none  (never eats clicks)
 *   - respects prefers-reduced-motion  (animations freeze in place)
 *   - CSS/SVG only  (no raster images — cheap to render + scale crisply)
 *
 * Composable: drop one (or several) inside a `relative` parent and they'll
 * sit behind the content via `-z-10` / absolute positioning.
 *
 * Palette: pink #FF2D78, amber #FFB100, green #1F8A5F, blush #FFF6F2.
 * Use the `color` prop on each shape to pick from {pink, amber, green, blush}.
 */

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shared color helpers                                                        */
/* -------------------------------------------------------------------------- */

type DecoColor = "pink" | "amber" | "green" | "blush";

/** Map a DecoColor token → the raw CSS var that holds its hex value. */
const COLOR_VAR: Record<DecoColor, string> = {
  pink: "var(--pink-primary)",
  amber: "var(--amber)",
  green: "var(--success)",
  blush: "var(--pink-soft)",
};

interface DecoProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  /** Tint of the pattern. Defaults to pink. */
  color?: DecoColor;
}

/* -------------------------------------------------------------------------- */
/* 1. DotPattern — a grid of small dots for section backgrounds                */
/* -------------------------------------------------------------------------- */

export function DotPattern({
  className,
  color = "pink",
  /** Gap between dots, in px. Defaults to 24 (subtle, never busy). */
  size = 24,
  /** Opacity multiplier on top of the color. Defaults to 0.08. */
  opacity = 0.08,
  ...rest
}: DecoProps & { size?: number; opacity?: number }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        backgroundImage: `radial-gradient(${COLOR_VAR[color]} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        opacity,
      }}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* 2. WavePattern — an SVG wave for section dividers / decoration              */
/* -------------------------------------------------------------------------- */

export function WavePattern({
  className,
  color = "pink",
  /** Flip the wave vertically (so it can pair with a SectionDivider). */
  flip = false,
  ...rest
}: DecoProps & { flip?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0", className)}
      style={{ transform: flip ? "scaleY(-1)" : undefined }}
      {...rest}
    >
      <svg
        viewBox="0 0 1200 80"
        className="h-16 w-full sm:h-20"
        preserveAspectRatio="none"
      >
        <path
          d="M0,40 C150,10 300,70 450,40 C600,10 750,70 900,40 C1050,10 1150,60 1200,40 L1200,80 L0,80 Z"
          fill={COLOR_VAR[color]}
          opacity="0.06"
        />
        <path
          d="M0,40 C150,10 300,70 450,40 C600,10 750,70 900,40 C1050,10 1150,60 1200,40"
          fill="none"
          stroke={COLOR_VAR[color]}
          strokeWidth="2"
          opacity="0.18"
        />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. BlobShape — an organic blob for background decoration                    */
/* -------------------------------------------------------------------------- */

export function BlobShape({
  className,
  color = "pink",
  /** Animate the blob (gentle scale + rotate). Off under reduced-motion. */
  animate = true,
  opacity = 0.12,
  ...rest
}: DecoProps & { animate?: boolean; opacity?: number }) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  return (
    <motion.div
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      initial={shouldAnimate ? { scale: 1, rotate: 0 } : false}
      animate={
        shouldAnimate
          ? { scale: [1, 1.08, 1], rotate: [0, 6, 0] }
          : undefined
      }
      transition={
        shouldAnimate
          ? { duration: 14, repeat: Infinity, ease: "easeInOut" }
          : undefined
      }
      {...(rest as React.ComponentProps<typeof motion.div>)}
    >
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full"
        style={{ opacity }}
      >
        <path
          fill={COLOR_VAR[color]}
          d="M44.7,-67.4C57.9,-58.6,68.7,-45.7,74.2,-31.1C79.7,-16.5,79.9,-0.2,75.8,14.4C71.7,29,63.3,41.9,52.4,52.8C41.5,63.7,28.1,72.6,13.1,76.6C-1.9,80.6,-18.5,79.7,-32.5,73.6C-46.5,67.5,-57.9,56.2,-66.3,42.5C-74.7,28.8,-80.1,12.7,-78.8,-2.9C-77.5,-18.5,-69.5,-33.6,-58.1,-43.5C-46.7,-53.4,-31.9,-58.1,-17.9,-62.4C-3.9,-66.7,9.3,-70.6,22.5,-71.8C35.7,-73,31.5,-76.2,44.7,-67.4Z"
          transform="translate(100 100)"
        />
      </svg>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. GradientMesh — a subtle multi-stop mesh overlay                          */
/* -------------------------------------------------------------------------- */

export function GradientMesh({
  className,
  /** Override the mesh colors. Defaults to the Saratrasaa triad. */
  colors = ["var(--pink-primary)", "var(--amber)", "var(--success)"],
  opacity = 0.06,
  ...rest
}: DecoProps & {
  colors?: [string, string, string];
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        opacity,
        background: `
          radial-gradient(at 20% 25%, ${colors[0]} 0px, transparent 45%),
          radial-gradient(at 80% 30%, ${colors[1]} 0px, transparent 45%),
          radial-gradient(at 50% 85%, ${colors[2]} 0px, transparent 50%)
        `,
      }}
      {...rest}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* 5. SparkleDecoration — small animated sparkles for special sections         */
/* -------------------------------------------------------------------------- */

/** Hand-tuned sparkle positions — fixed (not random) so SSR matches client. */
const DEFAULT_SPARKLES = [
  { top: "12%", left: "8%",  size: 14, delay: 0,   duration: 2.8 },
  { top: "28%", left: "92%", size: 11, delay: 0.6, duration: 3.2 },
  { top: "62%", left: "5%",  size: 12, delay: 1.2, duration: 3.0 },
  { top: "78%", left: "88%", size: 15, delay: 0.3, duration: 2.6 },
  { top: "45%", left: "50%", size: 9,  delay: 1.8, duration: 3.4 },
] as const;

export function SparkleDecoration({
  className,
  color = "pink",
  /** Override the hand-tuned default sparkle positions. */
  sparkles = DEFAULT_SPARKLES,
  ...rest
}: DecoProps & {
  sparkles?: ReadonlyArray<{
    top: string;
    left: string;
    size: number;
    delay: number;
    duration: number;
  }>;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    // Render the sparkles statically (no pulsing) so the section still has
    // a touch of sparkle without motion.
    return (
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", className)}
        {...rest}
      >
        {sparkles.map((s, i) => (
          <Sparkle
            key={i}
            className="absolute"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              color: COLOR_VAR[color],
              opacity: 0.35,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      {...rest}
    >
      {sparkles.map((s, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ top: s.top, left: s.left }}
          initial={{ scale: 0.6, opacity: 0, rotate: 0 }}
          animate={{
            scale: [0.6, 1.1, 0.6],
            opacity: [0, 0.7, 0],
            rotate: [0, 90, 180],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Sparkle
            style={{
              width: s.size,
              height: s.size,
              color: COLOR_VAR[color],
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exports — named only (DotPattern, WavePattern, BlobShape, GradientMesh,    */
/* SparkleDecoration). Import the named component directly:                   */
/*   import { DotPattern, BlobShape } from "./DecorativePatterns";            */
/* -------------------------------------------------------------------------- */
