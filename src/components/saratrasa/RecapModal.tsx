'use client';

/**
 * RecapModal — Saratrasaa (Task 8-D)
 *
 * Print-friendly recap view for a closed event. Opened by the "Cetak Recap"
 * button in AdminPanel's Dokumentasi History tab.
 *
 * Layout (top → bottom):
 *   - Saratrasaa wordmark + "Recap Event" subtitle
 *   - Event judul / tanggal / lokasi header
 *   - Stats grid (4 cards: total pendaftar / verified / total orang / pendapatan)
 *   - Recap text (if any) in a bordered box
 *   - Cover photo (if any)
 *   - Documentation photos grid (if any)
 *   - Pendaftar table (kode / nama / jumlah / status / total)
 *   - Footer: "Dicetak pada {date}" + Saratrasaa branding
 *
 * Print: the entire modal panel is tagged `.recap-print-area`. The print CSS
 * in globals.css hides everything else on the page and repositions this
 * element to the top-left of the print page. The "Cetak / Simpan PDF" and
 * "Tutup" buttons (and the close X) carry the `.no-print` class so they
 * don't appear in the printed output.
 *
 * The modal is rendered as a fixed overlay (not the shadcn Dialog) so we
 * have full control over the print positioning — the recap-print-area is a
 * direct child of the fixed overlay, and the print CSS pulls it out of the
 * flex-centered layout to sit at top:0 / left:0 of the page.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  X,
  Printer,
  RefreshCw,
  Users,
  CheckCircle2,
  UserCheck,
  Wallet,
  Calendar,
  MapPin,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR } from "@/lib/saratrasa";
import { ShimmerSkeleton } from "./Skeleton";

/* -------------------------------------------------------------------------- */
/* Types — matches the /api/admin/event/recap response shape                  */
/* -------------------------------------------------------------------------- */

interface RecapEvent {
  id: string;
  judul: string;
  tanggal: string; // YYYY-MM-DD
  lokasi: string;
  recap: string;
  fotoCover: string; // "" or "/uploads/..."
  fotoDok: string[];
}

interface RecapStats {
  totalPendaftar: number;
  totalVerified: number;
  totalRejected: number;
  totalOrang: number;
  totalPendapatan: number;
}

interface RecapPendaftar {
  kodeReferensi: string;
  nama: string;
  jumlahOrang: number;
  status: "pending_payment" | "verified" | "rejected";
  totalBayar: number;
  createdAt: string;
  verifiedAt: string | null;
}

interface RecapData {
  event: RecapEvent;
  stats: RecapStats;
  pendaftar: RecapPendaftar[];
}

interface RecapModalProps {
  /** Event id to fetch. When null, the modal is closed. */
  eventId: string | null;
  /** Admin token — passed as X-Admin-Token header on the fetch. */
  token: string;
  /** Called when the user wants to close the modal (X / Tutup / backdrop). */
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Format an ISO date (YYYY-MM-DD) as Indonesian "15 Maret 2025". */
function formatTanggal(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Format "now" as a printable Indonesian date+time. */
function formatDicetak(): string {
  try {
    return new Date().toLocaleString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date().toISOString();
  }
}

/** Resolve a relative upload path to a full URL for <img src>. */
function resolvePath(p: string): string {
  if (!p) return "";
  if (p.startsWith("http") || p.startsWith("data:")) return p;
  return p.startsWith("/") ? p : `/${p}`;
}

/** Status badge for a pendaftar row in the recap table. */
function PendaftarStatusBadge({
  status,
}: {
  status: RecapPendaftar["status"];
}) {
  if (status === "verified") {
    return (
      <Badge className="border-transparent bg-success text-white hover:bg-success">
        Verified
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="border-transparent bg-destructive text-white hover:bg-destructive">
        Rejected
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-amber text-ink hover:bg-amber">
      Pending
    </Badge>
  );
}

/** Small stat card for the recap stats grid. */
function RecapStatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "pink" | "amber" | "green" | "ink";
}) {
  const toneClasses =
    tone === "pink"
      ? "bg-pink-soft text-pink-primary"
      : tone === "amber"
        ? "bg-amber/20 text-amber"
        : tone === "green"
          ? "bg-success/15 text-success"
          : "bg-muted text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "size-8 rounded-full flex items-center justify-center shrink-0",
            toneClasses,
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="mt-2 font-data text-xl sm:text-2xl font-bold text-ink truncate">
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton — shown while the fetch is in flight                              */
/* -------------------------------------------------------------------------- */

function RecapSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="text-center space-y-2">
        <ShimmerSkeleton className="h-4 w-32 mx-auto rounded-full" />
        <ShimmerSkeleton className="h-7 w-3/4 mx-auto" />
        <ShimmerSkeleton className="h-4 w-1/2 mx-auto" />
      </div>
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerSkeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      {/* Recap text skeleton */}
      <ShimmerSkeleton className="h-32 rounded-lg" />
      {/* Table skeleton */}
      <div className="space-y-2">
        <ShimmerSkeleton className="h-9 rounded-md" />
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerSkeleton key={i} className="h-9 rounded-md" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Wordmark — same style as Navbar.Wordmark but standalone            */
/* ------------------------------------------------------------------ */
function Wordmark() {
  return (
    <span className="font-display text-xl font-bold tracking-tight text-ink">
      <span
        aria-hidden
        className="mr-0.5 inline-block size-2 translate-y-[1px] rounded-full bg-pink-primary align-middle"
      />
      Saratrasaa
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

export function RecapModal({ eventId, token, onClose }: RecapModalProps) {
  const open = eventId !== null;

  const [data, setData] = React.useState<RecapData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const loadData = React.useCallback(async () => {
    if (!eventId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/event/recap?id=${encodeURIComponent(eventId)}`,
        { headers: { "X-Admin-Token": token } },
      );
      if (cancelled) return;
      if (res.status === 401) {
        toast.error("Token admin tidak valid.");
        onClose();
        return;
      }
      if (res.status === 404) {
        setError("Event tidak ditemukan.");
        return;
      }
      if (!res.ok) throw new Error("Gagal memuat recap.");
      const json = (await res.json()) as RecapData;
      if (!cancelled) setData(json);
    } catch (err) {
      if (!cancelled) setError((err as Error).message || "Gagal memuat recap.");
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [eventId, token, onClose]);

  React.useEffect(() => {
    if (open) {
      const cleanup = loadData();
      return () => {
        cleanup.then(fn => fn && fn());
      };
    } else {
      setData(null);
    }
  }, [open, loadData]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const dicetakPada = formatDicetak();

  const handlePrint = () => {
    const originalTitle = document.title;
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = data?.event.judul.replace(/[^a-zA-Z0-9-]/g, '-') || "Event";
    document.title = `Recap-${safeTitle}-${dateStr}`;
    
    window.print();
    
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const modalContent = (
    <div className="print-portal-wrapper">
      <div
        className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Recap Event"
      >
        {/* Backdrop — click to close. */}
        <button
          type="button"
          aria-label="Tutup recap"
          onClick={onClose}
          className="no-print absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Recap panel — also the print area. */}
        <div
          className={cn(
            "recap-print-area relative w-full max-w-4xl bg-background rounded-xl shadow-2xl",
            "max-h-[95vh] overflow-y-auto scroll-soft",
            "border border-border",
          )}
        >
          {/* Top action bar — visible on screen, hidden in print. */}
          <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Printer className="size-4 text-pink-primary shrink-0" />
              <span className="font-display font-semibold text-sm truncate">
                Recap Event
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handlePrint}
                disabled={loading || !!error}
                className="bg-pink-primary hover:bg-pink-primary/90"
              >
                <Printer className="size-4" />
                Cetak / Simpan PDF
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onClose}
              >
                <X className="size-4" />
                Tutup
              </Button>
            </div>
          </div>

          {/* Recap body. */}
          <div className="px-5 sm:px-8 py-6 sm:py-8">
            {loading ? (
              <ShimmerSkeleton className="h-64 w-full" />
            ) : error ? (
              <div className="text-center py-12 space-y-4">
                <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="size-6 text-destructive" />
                </div>
                <div className="space-y-1">
                  <p className="font-display text-lg font-semibold text-ink">
                    Gagal memuat recap
                  </p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Re-trigger the fetch effect by toggling state.
                    setError(null);
                    setLoading(true);
                    // Force the effect to re-run by re-setting the same eventId.
                    // Easiest: re-fetch inline.
                    if (!eventId || !token) return;
                    fetch(
                      `/api/admin/event/recap?id=${encodeURIComponent(eventId)}`,
                      { headers: { "X-Admin-Token": token } },
                    )
                      .then(async (res) => {
                        if (!res.ok) throw new Error("Gagal memuat recap.");
                        return (await res.json()) as RecapData;
                      })
                      .then((json) => {
                        setData(json);
                        setLoading(false);
                      })
                      .catch((err) => {
                        setError(err.message || "Gagal memuat recap.");
                        setLoading(false);
                      });
                  }}
                >
                  <RefreshCw className="size-4 mr-2" />
                  Coba lagi
                </Button>
              </div>
            ) : data ? (
              <RecapContent data={data} dicetakPada={dicetakPada} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

/* -------------------------------------------------------------------------- */
/* Recap content — extracted so the print area is self-contained              */
/* -------------------------------------------------------------------------- */

function RecapContent({
  data,
  dicetakPada,
}: {
  data: RecapData;
  dicetakPada: string;
}) {
  const { event, stats, pendaftar } = data;
  const fotoDok = event.fotoDok ?? [];
  const cover = event.fotoCover ?? "";

  return (
    <div className="space-y-6">
      {/* ---------- Header: wordmark + "Recap Event" + judul ---------- */}
      <header className="border-b-2 border-pink-primary/30 pb-5">
        <div className="flex flex-col items-center text-center gap-1">
          <Wordmark />
          <p className="text-xs uppercase tracking-[0.2em] text-pink-primary font-semibold mt-1">
            Recap Event
          </p>
          <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold text-ink leading-tight">
            {event.judul}
          </h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatTanggal(event.tanggal)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {event.lokasi}
            </span>
          </div>
        </div>
      </header>

      {/* ---------- Stats grid ---------- */}
      <section>
        <h2 className="font-display text-base font-semibold text-ink mb-3">
          Ringkasan Statistik
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RecapStatCard
            icon={Users}
            label="Total Pendaftar"
            value={String(stats.totalPendaftar)}
            tone="pink"
          />
          <RecapStatCard
            icon={UserCheck}
            label="Terverifikasi"
            value={String(stats.totalVerified)}
            tone="green"
          />
          <RecapStatCard
            icon={CheckCircle2}
            label="Total Orang"
            value={String(stats.totalOrang)}
            tone="amber"
          />
          <RecapStatCard
            icon={Wallet}
            label="Pendapatan"
            value={formatIDR(stats.totalPendapatan)}
            tone="ink"
          />
        </div>
        {stats.totalRejected > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.totalRejected} pendaftar ditolak (tidak dihitung dalam total
            orang / pendapatan).
          </p>
        )}
      </section>

      {/* ---------- Recap text ---------- */}
      {event.recap ? (
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-2">
            Catatan Recap
          </h2>
          <div className="rounded-lg border border-border bg-pink-soft/20 p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {event.recap}
            </p>
          </div>
        </section>
      ) : null}

      {/* ---------- Cover photo ---------- */}
      {cover ? (
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-2">
            Foto Cover
          </h2>
          <div className="rounded-lg border border-border overflow-hidden bg-muted">
            {/* Using a plain <img> instead of next/image because the cover
                lives in /public/uploads (or /public root) and is fetched
                dynamically per event — next/image would need a width/height
                or fill layout we don't have here. */}
            <img
              src={resolvePath(cover)}
              alt={`Cover ${event.judul}`}
              className="w-full max-h-80 object-cover"
              loading="lazy"
            />
          </div>
        </section>
      ) : null}

      {/* ---------- Documentation photos grid ---------- */}
      {fotoDok.length > 0 ? (
        <section>
          <h2 className="font-display text-base font-semibold text-ink mb-2">
            Foto Dokumentasi
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {fotoDok.map((p, i) => {
              const url = resolvePath(p);
              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(p);
              return (
                <a
                  key={`${p}-${i}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square rounded-md border border-border overflow-hidden bg-muted no-print"
                >
                  {isImage ? (
                    <img
                      src={url}
                      alt={`Dokumentasi ${i + 1}`}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="size-full flex flex-col items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-6" />
                      <span className="text-[10px] mt-1">File</span>
                    </div>
                  )}
                </a>
              );
            })}
            {/* In print: render the documentation photos as static <img>
                (not <a>) so they appear in the PDF without hover/click
                affordances. We hide the <a> version above with .no-print
                and show these instead. */}
            <div className="hidden print:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 col-span-full">
              {fotoDok.map((p, i) => {
                const url = resolvePath(p);
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(p);
                if (!isImage) return null;
                return (
                  <img
                    key={`print-${p}-${i}`}
                    src={url}
                    alt={`Dokumentasi ${i + 1}`}
                    className="aspect-square w-full object-cover rounded-md border border-border"
                  />
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------- Pendaftar table ---------- */}
      <section>
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <h2 className="font-display text-base font-semibold text-ink">
            Daftar Pendaftar
          </h2>
          <span className="text-xs text-muted-foreground">
            {pendaftar.length} pendaftar
          </span>
        </div>
        {pendaftar.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Belum ada pendaftar untuk event ini.
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-pink-soft/30 hover:bg-pink-soft/30">
                  <TableHead className="w-[120px]">Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="w-[70px] text-right">Jumlah</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[130px] text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendaftar.map((p) => (
                  <TableRow key={p.kodeReferensi}>
                    <TableCell className="font-data text-xs">
                      {p.kodeReferensi}
                    </TableCell>
                    <TableCell className="font-medium">{p.nama}</TableCell>
                    <TableCell className="text-right font-data">
                      {p.jumlahOrang}
                    </TableCell>
                    <TableCell>
                      <PendaftarStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right font-data">
                      {formatIDR(p.totalBayar)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border pt-4 mt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            Dicetak pada <span className="font-data">{dicetakPada}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full bg-pink-primary"
            />
            <span className="font-display font-semibold text-ink">
              Saratrasaa
            </span>
            <span className="text-muted-foreground">
              — Komunitas Volunteer Muda
            </span>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default RecapModal;
