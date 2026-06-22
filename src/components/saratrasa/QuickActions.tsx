'use client';

/**
 * QuickActions — Saratrasaa (Task 10-C)
 *
 * A floating action button (bottom-right) that expands into a small stack of
 * quick navigation actions for admins. Built with Framer Motion for the
 * expand/collapse animation. Only mounted inside the AdminPanel (Layer 2),
 * so it's automatically hidden on the public site + the token gate.
 *
 * Actions:
 *   - Check-in    → opens the CheckInDialog (calls onCheckIn)
 *   - Pengingat   → switches to the Reminders tab (calls onGoReminders)
 *   - Dashboard   → switches to the Dashboard tab (calls onGoDashboard)
 *
 * Accessibility:
 *   - The main button is a real <button> with aria-label and aria-expanded.
 *   - The expanded items are focusable buttons; the container is a
 *     role="menu" with role="menuitem" children for screen readers.
 *   - ESC closes the menu (handled by the global keydown effect).
 *
 * Respects prefers-reduced-motion: the expand/collapse transition is
 * instant (no spring) under reduced motion.
 */

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Plus,
  QrCode,
  Bell,
  LayoutDashboard,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface QuickActionDef {
  key: "checkin" | "reminders" | "dashboard";
  label: string;
  icon: typeof QrCode;
  tone: "pink" | "amber" | "green";
  onSelect: () => void;
}

interface QuickActionsProps {
  onCheckIn: () => void;
  onGoReminders: () => void;
  onGoDashboard: () => void;
}

/* -------------------------------------------------------------------------- */
/* Tone styles                                                                 */
/* -------------------------------------------------------------------------- */

const TONE_STYLES: Record<
  QuickActionDef["tone"],
  { btn: string; icon: string }
> = {
  pink: {
    btn: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_24px_-6px_rgba(255,45,120,0.45)]",
    icon: "bg-primary-foreground/15 text-primary-foreground",
  },
  amber: {
    btn: "bg-[var(--amber)] text-white hover:bg-[var(--amber)]/90 shadow-[0_8px_24px_-6px_rgba(255,177,0,0.45)]",
    icon: "bg-white/15 text-white",
  },
  green: {
    btn: "bg-[var(--success)] text-white hover:bg-[var(--success)]/90 shadow-[0_8px_24px_-6px_rgba(31,138,95,0.45)]",
    icon: "bg-white/15 text-white",
  },
};

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function QuickActions({
  onCheckIn,
  onGoReminders,
  onGoDashboard,
}: QuickActionsProps) {
  const [open, setOpen] = React.useState(false);
  const reduce = useReducedMotion();

  // Close the menu on ESC + when the user clicks/taps outside the menu.
  // We use a ref on the outer container and a global click listener — this
  // catches both pointer + touch events without needing two handlers.
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handlePointer(e: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (
        containerRef.current.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer, { passive: true });
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [open]);

  // Build the action list. Order = display order (bottom-to-top when stacked).
  const actions: QuickActionDef[] = [
    {
      key: "checkin",
      label: "Check-in",
      icon: QrCode,
      tone: "pink",
      onSelect: () => {
        setOpen(false);
        onCheckIn();
      },
    },
    {
      key: "reminders",
      label: "Pengingat",
      icon: Bell,
      tone: "amber",
      onSelect: () => {
        setOpen(false);
        onGoReminders();
      },
    },
    {
      key: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      tone: "green",
      onSelect: () => {
        setOpen(false);
        onGoDashboard();
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5"
      // Hide on tiny screens (sm and up only) — on small phones the tab bar
      // is already reachable at the top.
      aria-label="Aksi cepat admin"
    >
      {/* Expanded action stack — renders above the FAB */}
      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            aria-label="Aksi cepat"
            className="flex flex-col items-end gap-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.92 }}
            animate={
              reduce
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, y: 8, scale: 0.95 }
            }
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            }
          >
            {actions.map((a, i) => {
              const Icon = a.icon;
              const tone = TONE_STYLES[a.tone];
              return (
                <motion.li
                  key={a.key}
                  role="none"
                  initial={reduce ? false : { opacity: 0, x: 20 }}
                  animate={
                    reduce
                      ? { opacity: 1, x: 0 }
                      : { opacity: 1, x: 0 }
                  }
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: 0.2, delay: 0.04 * i, ease: "easeOut" }
                  }
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={a.onSelect}
                    className={cn(
                      "group inline-flex items-center gap-2.5 rounded-full pl-2 pr-4 py-2 text-sm font-semibold transition-all",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      tone.btn,
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full",
                        tone.icon,
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    {a.label}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Floating action button */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Tutup aksi cepat" : "Buka aksi cepat"}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "relative inline-flex size-14 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-[0_10px_30px_-6px_rgba(255,45,120,0.55)]",
          "transition-colors hover:bg-primary/90",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "ring-1 ring-primary-foreground/10",
        )}
        whileHover={reduce ? undefined : { scale: 1.06 }}
        whileTap={reduce ? undefined : { scale: 0.94 }}
      >
        {/* Subtle pulsing ring when closed — invites the click without being noisy */}
        {!open && !reduce && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-primary/40"
            style={{ animation: "ping-soft 2.4s ease-out infinite" }}
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={reduce ? false : { rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
              }
            >
              <X className="size-6" />
            </motion.span>
          ) : (
            <motion.span
              key="plus"
              initial={reduce ? false : { rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { rotate: -90, opacity: 0 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
              }
            >
              <Plus className="size-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

export default QuickActions;
