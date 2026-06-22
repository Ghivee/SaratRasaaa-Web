'use client';

import * as React from "react";
import {
  motion,
  useReducedMotion,
  useMotionValue,
  animate,
} from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * CountUp — animates a number from 0 to `value` using framer-motion's
 * imperative `animate` on a MotionValue. Respects prefers-reduced-motion:
 * when the user has reduced motion enabled, the number is displayed
 * immediately with no animation.
 *
 * Used by StatsDashboard and LeaderboardSection to keep the count-up
 * behaviour consistent across both impact grids.
 *
 * Props:
 *   - value        : target number
 *   - duration     : animation duration in seconds (default 1.1s)
 *   - className    : applied to the <motion.span> wrapper
 *   - gradient     : optional CSS gradient for the number text
 *                    (e.g. "linear-gradient(135deg, #1F1115, #FF2D78)")
 *   - prefix       : optional prefix (e.g. "Rp ")
 *   - suffix       : optional suffix (e.g. " jam")
 *   - locale       : locale for thousand separators (default "id-ID")
 */
export interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
  gradient?: string;
  prefix?: string;
  suffix?: string;
  locale?: string;
}

export function CountUp({
  value,
  duration = 1.1,
  className,
  gradient,
  prefix = "",
  suffix = "",
  locale = "id-ID",
}: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = React.useState<string>(
    reduceMotion
      ? `${prefix}${value.toLocaleString(locale)}${suffix}`
      : `${prefix}0${suffix}`,
  );

  React.useEffect(() => {
    if (reduceMotion) {
      setDisplay(`${prefix}${value.toLocaleString(locale)}${suffix}`);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => {
        setDisplay(
          `${prefix}${Math.round(latest).toLocaleString(locale)}${suffix}`,
        );
      },
    });
    return () => controls.stop();
    // Re-run when value, motion, reduced-motion, or formatting inputs change.
    // mv is stable (created once per mount via useMotionValue) so it is safe
    // to omit from the dependency array.
  }, [value, reduceMotion, duration, prefix, suffix, locale, mv]);

  const style: React.CSSProperties = gradient
    ? {
        background: gradient,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }
    : {};

  return (
    <motion.span
      className={cn("font-mono tabular-nums", className)}
      style={style}
    >
      {display}
    </motion.span>
  );
}

export default CountUp;
