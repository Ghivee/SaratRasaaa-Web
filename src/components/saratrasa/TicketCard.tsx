'use client';

/**
 * TicketCard — the SIGNATURE visual element of Saratrasaa (brief §2.5).
 *
 * Renders a perforated 2-panel ticket stub:
 *   - LEFT panel: QR code (encodes `SARATRASAA|<kode>|<nama>|<event.judul>`)
 *     + the kodeReferensi in big mono font with a Salin mini button.
 *     A subtle pink dotted watermark sits behind the QR for texture.
 *   - RIGHT panel: event meta (judul, tanggal, lokasi), pendaftar info,
 *     verifiedAt (with a relative-time badge), and a small heart footer.
 *
 * The outer container uses `.ticket-stub` (radial-gradient circle cutouts
 * on the left/right edges — defined in globals.css). The right panel uses
 * `.ticket-perf` for the desktop vertical perforation (dashed border +
 * circle cutouts); on mobile it's overridden to a horizontal perforation
 * via Tailwind utilities + `!important` (unlayered `.ticket-perf` wins
 * over normal Tailwind utilities, so `!` is required).
 *
 * Actions (below the ticket):
 *   - "Salin Kode" copies the kodeReferensi to the clipboard.
 *   - "Unduh QR" serializes the QRCodeSVG → canvas → PNG download.
 *   - "Bagikan Tiket" uses navigator.share (mobile) with a clipboard
 *     fallback; shares a deep link `/?kode=<kode>` that pre-fills cek-status.
 *
 * Polish (Task 8b):
 *   - Shimmer sweep: a diagonal white gradient sweeps across the card on
 *     hover (1.5s ease). Keyframe declared in a local <style> tag — no
 *     globals.css edits. Skipped when prefers-reduced-motion is set.
 *   - Confetti burst: 12 pink/amber/green dots fan out from the top of
 *     the ticket on mount. pointer-events-none, framer-motion animated,
 *     skipped under prefers-reduced-motion.
 *   - Relative-time badge: "baru saja" / "X menit lalu" / "X jam lalu" /
 *     "X hari lalu" shown below the verifiedAt date.
 *   - Dotted watermark on the left panel (pink radial-gradient dots at
 *     8% opacity) — a quiet texture that doesn't fight the QR.
 *
 * NOTE: full-ticket image download (e.g. via html-to-image) is intentionally
 * NOT implemented — that library is out of scope. The hint below the buttons
 * tells the user to use a screenshot for the full ticket.
 */

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  Copy,
  Download,
  Heart,
  MapPin,
  Share2,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { PendaftarResult } from "./types";

interface TicketCardProps {
  pendaftar: PendaftarResult;
}

/** Format YYYY-MM-DD → "Sabtu, 12 Oktober 2024" (Indonesian). */
function formatTanggalID(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Format ISO datetime → "12 Okt 2024, 14.30" (Indonesian). */
function formatDateTimeID(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Indonesian relative time from an ISO datetime.
 * Returns null when the input is missing or unparseable.
 *
 * Thresholds (per Task 8b §4):
 *   < 60s   → "baru saja"
 *   < 60m   → "X menit lalu"
 *   < 24h   → "X jam lalu"
 *   >= 24h  → "X hari lalu"
 */
function relativeTimeID(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Math.max(0, Date.now() - then);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "baru saja";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  return `${day} hari lalu`;
}

/** Saratrasaa palette confetti colors (pink / amber / green). */
const CONFETTI_COLORS = ["#FF2D78", "#FFB100", "#1F8A5F"] as const;

/**
 * Pre-computed confetti pieces (12 dots, deterministic — generated once at
 * module load so they don't reshuffle on rerender). Each piece fans upward
 * from the top-center of the ticket with a random distance + jitter.
 */
const CONFETTI_PIECES = Array.from({ length: 12 }, (_, i) => {
  // Fan across the upper hemisphere: -150° → -30° (measured from +x axis).
  const baseAngle = (-150 + (i / 11) * 120) * (Math.PI / 180);
  const jitter = (Math.random() - 0.5) * 0.25;
  const angle = baseAngle + jitter;
  const distance = 55 + Math.random() * 40;
  return {
    id: i,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 4,
    delay: Math.random() * 0.15,
    duration: 0.8 + Math.random() * 0.4,
  };
});

export function TicketCard({ pendaftar }: TicketCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  // shimmerKey is bumped on each hover-enter so the shimmer <div> remounts
  // and its CSS animation replays from the start every time.
  const [shimmerKey, setShimmerKey] = React.useState(0);
  const qrRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [relTime, setRelTime] = React.useState<string | null>(null);

  // Encode enough to be a proof, not for system scanning.
  const qrValue = `SARATRASAA|${pendaftar.kodeReferensi}|${pendaftar.nama}|${pendaftar.event.judul}`;

  // Compute relative time once on mount (cheap, doesn't need to tick).
  React.useEffect(() => {
    setRelTime(relativeTimeID(pendaftar.verifiedAt));
  }, [pendaftar.verifiedAt]);

  async function copyKode() {
    try {
      await navigator.clipboard.writeText(pendaftar.kodeReferensi);
      setCopied(true);
      toast.success("Kode referensi disalin.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Gagal menyalin. Salin manual ya.");
    }
  }

  function unduhQR() {
    // Serialize the rendered <svg> from QRCodeSVG, draw onto a canvas at
    // 480px (for crispness), export as PNG, trigger download.
    try {
      const container = qrRef.current;
      if (!container) return;
      const svg = container.querySelector("svg");
      if (!svg) {
        toast.error("QR belum siap. Coba lagi ya.");
        return;
      }
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const size = 480;
      clone.setAttribute("width", String(size));
      clone.setAttribute("height", String(size));
      clone.setAttribute("style", "background:#ffffff");
      const xml = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) return;
          const dl = URL.createObjectURL(pngBlob);
          const a = document.createElement("a");
          a.href = dl;
          a.download = `qr-${pendaftar.kodeReferensi}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(dl);
          toast.success("QR tiket terunduh.");
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        toast.error("Gagal membuat gambar QR.");
      };
      img.src = url;
    } catch (err) {
      console.error("[TicketCard.unduhQR]", err);
      toast.error("Gagal mengunduh QR.");
    }
  }

  /**
   * Share the ticket via Web Share API (mobile + some desktop browsers).
   * Fallback: copy the deep link to clipboard + toast.
   *
   * The deep link `/?kode=<kode>` is the same shape the home-client reads
   * to pre-fill cek-status — so recipients land one tap away from their
   * ticket detail.
   */
  async function bagikanTiket() {
    const shareUrl = `${window.location.origin}/?kode=${encodeURIComponent(
      pendaftar.kodeReferensi,
    )}`;
    const shareText = `Tiket volunteer Saratrasaa — ${pendaftar.kodeReferensi} untuk ${pendaftar.event.judul}. Lihat detail:`;

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: "Tiket Volunteer Saratrasaa",
          text: shareText,
          url: shareUrl,
        });
        toast.success("Tiket dibagikan!");
      } catch (err) {
        // AbortError = user dismissed the share sheet — not an error.
        if ((err as DOMException)?.name !== "AbortError") {
          toast.error("Gagal membagikan tiket.");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Tautan tiket disalin! Bagikan ke teman.");
      } catch {
        toast.error("Gagal menyalin tautan.");
      }
    }
  }

  return (
    <div className="space-y-4">
      {/*
        Local keyframes for the shimmer sweep (scoped, no globals.css edit).
        The shimmer bar starts off-card to the left, sweeps across to the
        right over 1.5s, then the parent <div> unmounts on hover-end (and
        remounts on next hover via `shimmerKey`, replaying the animation).
        Under prefers-reduced-motion the animation is disabled entirely.
      */}
      <style>{`
        @keyframes ticket-shimmer-sweep {
          0%   { transform: translateX(-130%) skewX(-18deg); }
          100% { transform: translateX(430%)  skewX(-18deg); }
        }
        .ticket-shimmer-bar {
          animation: ticket-shimmer-sweep 1.5s ease forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .ticket-shimmer-bar { animation: none; }
        }
      `}</style>

      <div className="relative mx-auto max-w-2xl">
        {/*
          Confetti burst — fires once on mount, pointer-events-none.
          Originates at top-center of the ticket and fans upward + outward.
          Skipped under prefers-reduced-motion.
        */}
        {!reduceMotion && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2"
          >
            {CONFETTI_PIECES.map((p) => (
              <motion.span
                key={p.id}
                className="absolute block rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                }}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{ opacity: 0, x: p.x, y: p.y, scale: 0.4 }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          onMouseEnter={() => {
            setHovered(true);
            setShimmerKey((k) => k + 1);
          }}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            "ticket-stub group relative overflow-hidden rounded-2xl bg-card shadow-2xl",
          )}
        >
          {/*
            Shimmer overlay — only rendered while hovered (so each hover
            replays the CSS animation via the remount). pointer-events-none
            so it never blocks the Salin/QR buttons.
          */}
          {hovered && !reduceMotion && (
            <div
              key={shimmerKey}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
            >
              <div
                className="ticket-shimmer-bar absolute inset-y-0 -left-1/3 w-1/3"
                style={{
                  background:
                    "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
                }}
              />
            </div>
          )}

          <div className="relative z-0 grid grid-cols-1 sm:grid-cols-2">
            {/* ───────── LEFT panel — the "main ticket" ───────── */}
            <div className="relative flex flex-col items-center gap-3 p-5 text-center sm:p-6">
              {/*
                Decorative dotted watermark behind the QR — pink dots on
                white at 8% opacity (subtle texture, doesn't fight the QR).
                Inline radial-gradient so no globals.css edit is needed.
              */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.08]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, #FF2D78 1.2px, transparent 1.2px)",
                  backgroundSize: "12px 12px",
                }}
              />

              <div className="relative w-full rounded-md bg-pink-soft/60 px-3 py-1.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-pink-primary">
                  Saratrasaa • Volunteer Ticket
                </p>
              </div>

              <div
                ref={qrRef}
                className="relative rounded-lg bg-white p-2 shadow-sm ring-1 ring-pink-soft/50"
              >
                <QRCodeSVG
                  value={qrValue}
                  size={180}
                  level="M"
                  marginSize={4}
                  fgColor="#1F1115"
                  bgColor="#FFFFFF"
                  title={`Tiket ${pendaftar.kodeReferensi}`}
                />
              </div>

              <p className="relative text-[11px] text-muted-foreground">
                Pindai untuk verifikasi keaslian tiket
              </p>

              <div className="relative mt-1 flex w-full items-center justify-center gap-2">
                <span className="font-mono text-2xl font-bold tracking-wide text-ink">
                  {pendaftar.kodeReferensi}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-pink-primary"
                  onClick={copyKode}
                  aria-label="Salin kode referensi"
                >
                  {copied ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* ───────── RIGHT panel — the "stub info" ───────── */}
            {/*
              .ticket-perf (unlayered in globals.css) provides
              `border-left: 2px dashed var(--pink-soft)` + ::before/::after
              circle cutouts. Because it is unlayered, Tailwind utilities
              cannot override it without `!important`.
              Mobile: we want a HORIZONTAL perforation instead. So:
                - !border-l-0 sm:!border-l-2 → kill left border on mobile,
                  restore on sm+ (style+color still come from .ticket-perf).
                - border-t-2 border-dashed border-pink-soft sm:border-t-0 →
                  add horizontal dashed top border on mobile only.
                - hide ::before/::after circles on mobile (they're positioned
                  for vertical layout and would look wrong horizontally).
            */}
            <div
              className={cn(
                "ticket-perf p-5 sm:p-6",
                "[&::before]:hidden [&::after]:hidden sm:[&::before]:block sm:[&::after]:block",
                "border-t-2 border-dashed border-pink-soft sm:border-t-0",
                "!border-l-0 sm:!border-l-2",
              )}
            >
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Event
                  </p>
                  <p className="font-display text-lg font-bold leading-tight text-ink">
                    {pendaftar.event.judul}
                  </p>
                </div>

                <div className="flex items-start gap-2 text-sm">
                  <Calendar className="mt-0.5 size-4 shrink-0 text-pink-primary" />
                  <span className="text-ink">
                    {formatTanggalID(pendaftar.event.tanggal)}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-pink-primary" />
                  <span className="text-ink">{pendaftar.event.lokasi}</span>
                </div>

                <Separator className="bg-pink-soft/60" />

                <div className="space-y-1.5 text-sm">
                  <Row label="Nama" value={pendaftar.nama} />
                  <Row
                    label="Jumlah Orang"
                    value={
                      <span className="font-mono">{pendaftar.jumlahOrang}</span>
                    }
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className="border-success/20 bg-success/15 text-success">
                      <ShieldCheck className="size-3" />
                      Terverifikasi
                    </Badge>
                  </div>
                </div>

                <Separator className="bg-pink-soft/60" />

                {/*
                  "Terverifikasi pada" date + a relative-time badge stacked
                  below it (right-aligned). The badge reuses the success
                  palette to echo the verified status above.
                */}
                <div className="flex flex-col items-end gap-1">
                  <div className="flex w-full items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Terverifikasi pada
                    </span>
                    <span className="font-mono text-ink">
                      {pendaftar.verifiedAt
                        ? formatDateTimeID(pendaftar.verifiedAt)
                        : "—"}
                    </span>
                  </div>
                  {relTime && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 font-mono text-xs text-success">
                      {relTime}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-center gap-1.5 pt-2 text-[10px] text-muted-foreground">
                  <span>Saratrasaa • Komunitas Volunteer Muda</span>
                  <Heart className="size-3 fill-pink-primary text-pink-primary" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action buttons */}
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyKode}
          className="gap-1.5"
        >
          {copied ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
          Salin Kode
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={unduhQR}
          className="gap-1.5"
        >
          <Download className="size-3.5" />
          Unduh QR
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={bagikanTiket}
          className="gap-1.5"
        >
          <Share2 className="size-3.5" />
          Bagikan Tiket
        </Button>
      </div>
      <p className="mx-auto max-w-2xl text-center text-[11px] text-muted-foreground">
        Untuk menyimpan tiket lengkap, gunakan screenshot (Cmd/Ctrl+Shift+S).
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export default TicketCard;
