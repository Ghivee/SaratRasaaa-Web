'use client';

import * as React from "react";
import { Menu, X, Instagram } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ActiveEventSummary, View } from "./types";

interface NavbarProps {
  view: View;
  onViewChange: (v: View) => void;
  activeEvent: ActiveEventSummary | null;
}

const NAV_ITEMS: { label: string; value: View }[] = [
  { label: "Beranda", value: "beranda" },
  { label: "Daftar", value: "daftar" },
  { label: "Cek Status", value: "cek-status" },
  { label: "Galeri", value: "galeri" },
];

function Wordmark() {
  return (
    <span className="font-display text-xl font-bold tracking-tight text-foreground">
      <span
        aria-hidden
        className="mr-0.5 inline-block size-2 translate-y-[1px] rounded-full bg-primary align-middle"
      />
      Saratrasaa
    </span>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: { label: string; value: View };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
        "hover:bg-secondary hover:text-foreground",
        active ? "text-primary" : "text-foreground/70 hover:text-foreground"
      )}
    >
      {item.label}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary transition-transform duration-200",
          active ? "scale-x-100" : "scale-x-0"
        )}
      />
    </button>
  );
}

/**
 * Animated hamburger ↔ X icon. Crossfades between Menu and X with a 180ms
 * rotation for a tactile "morph" feel. Respects prefers-reduced-motion
 * (the motion component short-circuits when `reduceMotion` is true).
 */
function HamburgerIcon({ open }: { open: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="relative inline-flex size-5 items-center justify-center">
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.span
            key="x"
            initial={reduceMotion ? false : { opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 90 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <X className="size-5" />
          </motion.span>
        ) : (
          <motion.span
            key="menu"
            initial={reduceMotion ? false : { opacity: 0, rotate: 90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -90 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Menu className="size-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Navbar({ view, onViewChange, activeEvent }: NavbarProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const reduceMotion = useReducedMotion();
  const ctaVisible = !!activeEvent && activeEvent.sisaKuota > 0;

  const handleNav = (v: View) => {
    onViewChange(v);
    setSheetOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => handleNav("beranda")}
          className="shrink-0 focus-visible:outline-none"
          aria-label="Saratrasaa — Beranda"
        >
          <Wordmark />
        </button>

        {/* Desktop nav */}
        {!isMobile && (
          <nav className="flex items-center gap-1" aria-label="Navigasi utama">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.value}
                item={item}
                active={view === item.value}
                onClick={() => handleNav(item.value)}
              />
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {ctaVisible && !isMobile && (
            <Button
              type="button"
              onClick={() => handleNav("daftar")}
              className="rounded-full bg-primary px-5 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Daftar Sekarang
            </Button>
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={sheetOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
                  aria-expanded={sheetOpen}
                  className="rounded-full"
                >
                  <HamburgerIcon open={sheetOpen} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader className="px-6 pt-6">
                  <SheetTitle className="text-left">
                    <Wordmark />
                  </SheetTitle>
                </SheetHeader>

                {/* Staggered nav items — each slides in 50ms after the
                    previous, giving a subtle cascading entrance. Disabled
                    (instant) under prefers-reduced-motion. */}
                <nav
                  className="flex flex-col gap-1 px-4 pt-2"
                  aria-label="Navigasi mobile"
                >
                  {NAV_ITEMS.map((item, i) => (
                    <motion.button
                      key={item.value}
                      type="button"
                      onClick={() => handleNav(item.value)}
                      initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                        delay: reduceMotion ? 0 : 0.05 + i * 0.05,
                      }}
                      className={cn(
                        "rounded-xl px-4 py-3 text-left text-base font-medium transition-colors",
                        view === item.value
                          ? "bg-secondary text-primary"
                          : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </motion.button>
                  ))}
                </nav>

                {ctaVisible && (
                  <div className="mt-auto px-4 pb-4">
                    <SheetClose asChild>
                      <Button
                        type="button"
                        onClick={() => handleNav("daftar")}
                        className="w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                      >
                        Daftar Sekarang
                      </Button>
                    </SheetClose>
                  </div>
                )}

                {/* Footer — Instagram link, mirrors the public Footer. */}
                <div className="border-t border-border px-6 py-4">
                  <a
                    href="https://instagram.com/saratrasaaa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Instagram className="size-4" aria-hidden />
                    @saratrasaaa
                  </a>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
