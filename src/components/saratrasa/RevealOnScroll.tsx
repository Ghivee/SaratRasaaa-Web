'use client';

import { motion, useReducedMotion } from "framer-motion";
import { ReactNode } from "react";

interface RevealOnScrollProps {
  children: ReactNode;
  delay?: number; // seconds
  className?: string;
}

/**
 * RevealOnScroll — wraps children with a subtle fade-up reveal when they
 * scroll into view (once). Respects prefers-reduced-motion: when the user
 * has reduced motion enabled, the wrapper renders a plain <div> with no
 * animation so content is immediately visible.
 *
 * Use this for section headings throughout the beranda to create a gentle
 * sense of rhythm as the user scrolls. Avoid wrapping above-the-fold Hero
 * content (it animates on load already) or components with their own
 * dedicated reveal logic (e.g. CountdownTimer).
 */
export function RevealOnScroll({ children, delay = 0, className }: RevealOnScrollProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default RevealOnScroll;
