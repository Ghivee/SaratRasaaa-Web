/**
 * Confetti helper — fires a brief celebration burst when a pendaftar is
 * verified in the admin panel.
 *
 * Implementation notes:
 *   - canvas-confetti is the lightest, most reliable confetti library (~6 kB
 *     gzip). It renders to a singleton canvas that auto-cleans after each
 *     burst, so there's no DOM pollution.
 *   - We use Saratrasaa brand colors: pink (#FF2D78), amber (#FFB100), and
 *     success green (#1F8A5F). No blue/purple.
 *   - Desktop-only — on touch devices we skip the burst (the brief notes
 *     mobile admins are usually in the field and the confetti could be
 *     distracting on a small screen). Detection is via `matchMedia("(pointer:
 *     coarse)")` + viewport width.
 *   - Honors prefers-reduced-motion: if the user has reduced motion enabled,
 *     the confetti is skipped entirely.
 *   - Dynamic import keeps canvas-confetti out of the initial bundle for
 *     users who never see it (e.g. public-site visitors).
 */

type ConfettiFn = (
  options?: Record<string, unknown>,
) => Promise<unknown> | null;

let confettiPromise: Promise<ConfettiFn | null> | null = null;

async function loadConfetti(): Promise<ConfettiFn | null> {
  if (typeof window === "undefined") return null;
  if (typeof document === "undefined") return null;
  if (!confettiPromise) {
    confettiPromise = (async () => {
      try {
        const mod = await import("canvas-confetti");
        return typeof mod.default === "function"
          ? (mod.default as ConfettiFn)
          : null;
      } catch (err) {
        console.warn("[confetti] failed to load canvas-confetti:", err);
        return null;
      }
    })();
  }
  return confettiPromise;
}

/** Returns true if confetti should be skipped (mobile or reduced-motion). */
function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  // Respect the user's motion preference — never confetti under reduced motion.
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return true;
  }
  // Desktop only — skip on coarse pointers (touch) or narrow viewports.
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  if (window.innerWidth < 768) return true;
  return false;
}

/**
 * Fire a brief, subtle confetti burst from the top-center of the viewport
 * using Saratrasaa brand colors. No-op on mobile or under reduced-motion.
 */
export async function fireVerifyConfetti(): Promise<void> {
  if (shouldSkip()) return;
  const confetti = await loadConfetti();
  if (!confetti) return;

  // Brand palette — pink primary, amber accent, success green.
  const colors = ["#FF2D78", "#FFB100", "#1F8A5F", "#FFD6E5"];

  // Burst 1: a small centered spray from the top — the "primary" celebration.
  confetti({
    particleCount: 70,
    spread: 70,
    startVelocity: 35,
    origin: { x: 0.5, y: 0.2 },
    colors,
    scalar: 0.9,
    gravity: 0.9,
    ticks: 180,
    disableForReducedMotion: true,
  });

  // Burst 2: a wider, slower sprinkle from the left for asymmetric flair.
  setTimeout(() => {
    if (shouldSkip()) return;
    confetti({
      particleCount: 35,
      angle: 60,
      spread: 55,
      startVelocity: 30,
      origin: { x: 0, y: 0.6 },
      colors,
      scalar: 0.8,
      gravity: 0.9,
      ticks: 160,
      disableForReducedMotion: true,
    });
  }, 120);

  // Burst 3: mirror from the right for symmetry.
  setTimeout(() => {
    if (shouldSkip()) return;
    confetti({
      particleCount: 35,
      angle: 120,
      spread: 55,
      startVelocity: 30,
      origin: { x: 1, y: 0.6 },
      colors,
      scalar: 0.8,
      gravity: 0.9,
      ticks: 160,
      disableForReducedMotion: true,
    });
  }, 240);
}
