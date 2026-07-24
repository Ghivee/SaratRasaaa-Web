'use client';

import * as React from "react";
import { Instagram, Mail, Heart, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { View } from "./types";

interface FooterProps {
  onNavigate?: (v: View) => void;
}

const JELAJAH: { label: string; view: View }[] = [
  { label: "Beranda", view: "beranda" },
  { label: "Daftar", view: "daftar" },
  { label: "Cek Status", view: "cek-status" },
  { label: "Galeri", view: "galeri" },
];

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="mt-auto bg-gradient-to-b from-foreground to-foreground/95 text-background">
      {/* Decorative gradient top border */}
      <div
        className="h-0.5 w-full"
        style={{
          background: "linear-gradient(to right, var(--pink-primary), var(--amber), var(--success))",
        }}
        aria-hidden
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* Column 1 — Brand */}
          <div className="flex flex-col gap-3 md:col-span-1">
            <span className="font-display text-xl font-bold tracking-tight">
              Saratrasaa
            </span>
            <p className="max-w-xs text-sm leading-relaxed text-background/70">
              <span className="inline-flex items-center gap-1 text-background/90">
                Kebaikan, satu aksi pada satu waktu
                <Heart
                  className="size-3 fill-primary text-primary animate-pulse"
                  aria-hidden
                />
              </span>
            </p>
            {/* Gabung relawan CTA */}
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("daftar")}
                className={cn(
                  "mt-2 inline-flex w-fit items-center gap-1.5 rounded-full",
                  "bg-primary px-4 py-2 text-xs font-semibold text-white",
                  "transition-all duration-200 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 hover:scale-105",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                )}
              >
                Gabung relawan
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          {/* Column 2 — Jelajah */}
          <div className="flex flex-col gap-3">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-background/80">
              Jelajah
            </h3>
            <ul className="flex flex-col gap-2">
              {JELAJAH.map((item) => (
                <li key={item.view}>
                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(item.view)}
                      className={cn(
                        "text-sm text-background/70 transition-all duration-200",
                        "hover:text-background hover:underline underline-offset-4",
                        "hover:translate-x-1"
                      )}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span className="text-sm text-background/70">
                      {item.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Sosial Media */}
          <div className="flex flex-col gap-3">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-background/80">
              Sosial Media
            </h3>
            <ul className="flex flex-col gap-3">
              <li>
                <a
                  href="https://instagram.com/saratrasaaa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-3 text-sm text-background/70 transition-all duration-200",
                    "hover:text-background group"
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-background/10 transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                    <Instagram className="size-4" aria-hidden />
                  </span>
                  @saratrasaaa
                </a>
              </li>
              <li>
                <a
                  href="mailto:saratrasaa@gmail.com"
                  className={cn(
                    "inline-flex items-center gap-3 text-sm text-background/70 transition-all duration-200",
                    "hover:text-background group"
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-background/10 transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:scale-110">
                    <Mail className="size-4" aria-hidden />
                  </span>
                  saratrasaa@gmail.com
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4 — Tetap Update */}
          <div className="flex flex-col gap-3">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-background/80">
              Tetap Update
            </h3>
            <p className="text-sm leading-relaxed text-background/70">
              Follow kami di Instagram untuk info event terbaru!
            </p>
            <a
              href="https://instagram.com/saratrasaaa"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "mt-1 inline-flex w-fit items-center gap-2 rounded-full",
                "border border-primary/40 bg-primary/10 px-4 py-2",
                "text-xs font-semibold text-primary",
                "transition-all duration-200 hover:bg-primary/20 hover:border-primary/60 hover:scale-105",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              )}
            >
              <Instagram className="size-3.5" aria-hidden />
              Follow @saratrasaaa
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center gap-4 pt-6 sm:flex-row sm:justify-between">
          {/* Footer content */}
          <p className="inline-flex items-center gap-1.5 text-xs text-background/70">
            © 2025 Saratrasaa.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
