'use client';

/**
 * SectionDivider — decorative pink-soft divider between beranda sections
 * to create visual rhythm. Purely cosmetic (aria-hidden).
 *
 * Two variants:
 *   - "wave"  : subtle SVG sine wave in pink-soft, low height
 *   - "dots"  : three small pink dots centered (tighter, more minimal)
 *
 * Use alternating variants between sections for variety. Both respect
 * prefers-reduced-motion automatically (no animation involved).
 */
export function SectionDivider({ variant = "wave" }: { variant?: "wave" | "dots" }) {
  if (variant === "dots") {
    return (
      <div className="flex justify-center py-6" aria-hidden>
        <div className="flex gap-2">
          <span className="size-2 rounded-full bg-primary/30" />
          <span className="size-2 rounded-full bg-primary/50" />
          <span className="size-2 rounded-full bg-primary/30" />
        </div>
      </div>
    );
  }
  // wave variant
  return (
    <div className="py-2" aria-hidden>
      <svg viewBox="0 0 1200 40" className="w-full h-8" preserveAspectRatio="none">
        <path
          d="M0,20 Q150,0 300,20 T600,20 T900,20 T1200,20"
          fill="none"
          stroke="var(--pink-soft)"
          strokeWidth="2"
          opacity="0.6"
        />
      </svg>
    </div>
  );
}

export default SectionDivider;
