'use client';

/**
 * VolunteerHistory — "Riwayat Relawan" lookup dialog (Task 9-A).
 *
 * Volunteers who joined multiple Saratrasaa events often want to see their
 * full registration history (not just the most recent one, which is what
 * /api/cek-status returns). This dialog lets them enter their phone number
 * + nama depan and fetches ALL past registrations via
 * /api/volunteer-history.
 *
 * Flow:
 *   1. Dialog opens (from CekStatus.tsx "Lihat Riwayat Saya" button).
 *   2. User enters kontak + nama depan. Submit fires GET /api/volunteer-history.
 *   3. Response renders as:
 *      a) Volunteer profile card (avatar + greeting + stats + member since).
 *      b) Timeline of all registrations as cards with status badges.
 *   4. Clicking a VERIFIED registration fetches its full PendaftarResult via
 *      /api/cek-status?kode=... and renders <TicketCard /> in place of the
 *      timeline (with a back button to return to the history list).
 *
 * IDOR safety:
 *   Same primitive as /api/cek-status — `validateStatusLookup` enforces that
 *   BOTH kontak AND nama are provided (HP-only search is rejected server-side).
 *   Rate-limited to 10/min/IP (stricter than cek-status's 20/min).
 *
 * Accessibility:
 *   - Full keyboard navigation (native Dialog primitives + button elements).
 *   - aria-busy on loading regions, aria-live for status changes.
 *   - prefers-reduced-motion respected (no entry animations under reduced
 *     motion; framer-motion useReducedMotion gates the section transitions).
 *
 * Styling: Saratrasaa pink palette only (no indigo/blue). Uses ShimmerSkeleton
 * from Skeleton.tsx for loading states.
 */

import * as React from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/saratrasa";

import type { PendaftarResult } from "./types";
import { TicketCard } from "./TicketCard";
import { ShimmerSkeleton, TicketSkeleton } from "./Skeleton";

/* -------------------------------------------------------------------------- */
/* Types — matches /api/volunteer-history response                            */
/* -------------------------------------------------------------------------- */

interface VolunteerProfile {
  nama: string;
  kontak: string;
  totalRegistrations: number;
  totalVerified: number;
  totalPending: number;
  totalRejected: number;
  totalPeople: number;
  firstEventDate: string | null; // YYYY-MM-DD
  memberSince: string | null; // YYYY-MM-DD (same value, formatted differently)
}

interface HistoryItem {
  kodeReferensi: string;
  nama: string;
  jumlahOrang: number;
  totalBayar: number;
  status: "pending_payment" | "verified" | "rejected";
  createdAt: string;
  verifiedAt: string | null;
  event: {
    judul: string;
    tanggal: string; // YYYY-MM-DD
    lokasi: string;
    status: string;
  };
}

interface HistoryResponse {
  volunteer: VolunteerProfile;
  history: HistoryItem[];
}

interface ErrorBody {
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse a YYYY-MM-DD string as a LOCAL date (no TZ shift).
 * `new Date("2025-01-15")` would parse as UTC, which renders as the previous
 * day in negative-TZ browsers. Splitting and using the y/m-1/d constructor
 * keeps the date stable regardless of the user's timezone.
 */
function parseLocalDate(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format YYYY-MM-DD → "15 Maret 2025" (no weekday, for compact contexts). */
function formatTanggalShort(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso || "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Format YYYY-MM-DD → "Januari 2025" (for "member sejak" copy). */
function formatMonthYearID(iso: string | null): string {
  if (!iso) return "—";
  const d = parseLocalDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

/** Format ISO datetime → "21 Jun 2025, 14.30" (compact Indonesian). */
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
 * Compute up to 2 initials from a nama.
 *   - "Dewi Saraswati"   → "DS"
 *   - "Dewi"             → "DE"  (single word → first 2 chars)
 *   - "Budi"             → "BU"
 *   - "" / null          → "?"
 */
function getInitials(nama: string): string {
  const trimmed = (nama || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    // Single word — take first 2 chars (uppercase).
    return parts[0].slice(0, 2).toUpperCase();
  }
  // Multiple words — take first char of the first two words.
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Map a registration status to its Indonesian label + Saratrasaa palette. */
function statusBadge(status: HistoryItem["status"]): {
  label: string;
  className: string;
  dotClassName: string;
} {
  switch (status) {
    case "verified":
      return {
        label: "Terverifikasi",
        className: "border-success/20 bg-success/15 text-success",
        dotClassName: "bg-success",
      };
    case "pending_payment":
      return {
        label: "Menunggu",
        className: "border-amber/40 bg-amber/15 text-pending",
        dotClassName: "bg-pending",
      };
    case "rejected":
      return {
        label: "Ditolak",
        className: "border-rejected/30 bg-rejected/15 text-rejected",
        dotClassName: "bg-rejected",
      };
    default:
      return {
        label: status,
        className: "border-border bg-muted text-muted-foreground",
        dotClassName: "bg-muted-foreground",
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Props                                                                        */
/* -------------------------------------------------------------------------- */

interface VolunteerHistoryProps {
  /** Controls dialog visibility. */
  open: boolean;
  /** Called when the user wants to close the dialog. */
  onOpenChange: (open: boolean) => void;
  /** Optional prefilled kontak (passed from CekStatus form state). */
  initialKontak?: string;
  /** Optional prefilled nama depan (passed from CekStatus form state). */
  initialNama?: string;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                    */
/* -------------------------------------------------------------------------- */

type ViewState = "form" | "history" | "ticket";

export function VolunteerHistory({
  open,
  onOpenChange,
  initialKontak,
  initialNama,
}: VolunteerHistoryProps) {
  const reduceMotion = useReducedMotion();

  // --- Form state ---------------------------------------------------------
  const [kontak, setKontak] = React.useState("");
  const [nama, setNama] = React.useState("");

  // --- Result state -------------------------------------------------------
  const [data, setData] = React.useState<HistoryResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // --- Ticket view state (for verified click-through) ---------------------
  const [view, setView] = React.useState<ViewState>("form");
  const [selectedKode, setSelectedKode] = React.useState<string | null>(null);
  const [ticketData, setTicketData] = React.useState<PendaftarResult | null>(
    null,
  );
  const [ticketLoading, setTicketLoading] = React.useState(false);
  const [ticketError, setTicketError] = React.useState<string | null>(null);

  // Prefill from props on open. Also reset everything when the dialog closes
  // so the next open starts fresh (no stale history from a previous lookup).
  React.useEffect(() => {
    if (open) {
      setKontak(initialKontak ?? "");
      setNama(initialNama ?? "");
      // Don't wipe data on open if it's already there — but DO reset view
      // to "form" so the user sees the form first each time they reopen.
      setView("form");
      setSelectedKode(null);
      setTicketData(null);
      setTicketError(null);
    } else {
      // On close: small delay so the exit animation can run before state
      // vanishes, then full reset.
      const t = window.setTimeout(() => {
        setData(null);
        setError(null);
        setKontak("");
        setNama("");
        setView("form");
        setSelectedKode(null);
        setTicketData(null);
        setTicketError(null);
      }, 250);
      return () => window.clearTimeout(t);
    }
  }, [open, initialKontak, initialNama]);

  // --- Submit handler: fetch /api/volunteer-history -----------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ko = kontak.trim();
    const na = nama.trim();
    if (!ko || !na) {
      toast.error("Nomor HP dan nama depan wajib diisi.");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams({ kontak: ko, nama: na });
      const res = await fetch(`/api/volunteer-history?${params.toString()}`);

      if (res.status === 200) {
        const body = (await res.json()) as HistoryResponse;
        setData(body);
        setView("history");
        return;
      }

      if (res.status === 404) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        setError(
          body.error ||
            "Belum ada riwayat pendaftaran untuk kombinasi ini. Periksa kembali input kamu.",
        );
        return;
      }

      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        setError(body.error || "Input tidak valid.");
        return;
      }

      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        setError(
          body.error ||
            "Terlalu banyak pencarian dari perangkat ini. Tunggu sebentar ya.",
        );
        return;
      }

      setError("Terjadi kesalahan. Coba lagi ya.");
    } catch (err) {
      console.error("[VolunteerHistory.handleSubmit]", err);
      setError("Terjadi kesalahan jaringan. Coba lagi ya.");
    } finally {
      setLoading(false);
    }
  }

  // --- Click-through handler: fetch /api/cek-status?kode=... -------------
  async function handleOpenTicket(kode: string) {
    setSelectedKode(kode);
    setView("ticket");
    setTicketData(null);
    setTicketError(null);
    setTicketLoading(true);

    try {
      const params = new URLSearchParams({ kode });
      const res = await fetch(`/api/cek-status?${params.toString()}`);

      if (res.status === 200) {
        const body = (await res.json()) as { pendaftar: PendaftarResult };
        setTicketData(body.pendaftar);
        return;
      }

      if (res.status === 404) {
        setTicketError("Tiket tidak ditemukan. Mungkin datanya sudah berubah.");
        return;
      }

      setTicketError("Gagal memuat tiket. Coba lagi ya.");
    } catch (err) {
      console.error("[VolunteerHistory.handleOpenTicket]", err);
      setTicketError("Terjadi kesalahan jaringan. Coba lagi ya.");
    } finally {
      setTicketLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl",
          // Wider on desktop so the timeline reads more naturally; the
          // TicketCard also needs ~max-w-2xl to lay out its 2-col stub.
        )}
      >
        {/* Header — fixed at top, doesn't scroll */}
        <DialogHeader className="space-y-0 border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <History className="size-4" />
            </span>
            <DialogTitle className="font-display text-lg font-bold text-ink">
              Riwayat Relawan
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
            Lihat semua pendaftaran event Saratrasaa kamu dengan nomor HP + nama depan.
          </DialogDescription>
        </DialogHeader>

        {/* Body — scrolls independently. AnimatePresence handles the view
            transitions (form → history → ticket). Under prefers-reduced-motion
            we skip the motion wrappers entirely (the view swaps instantly). */}
        <div className="max-h-[calc(90vh-7rem)] overflow-y-auto scroll-soft px-5 py-5 sm:px-6">
          {reduceMotion ? (
            <ViewContent
              view={view}
              kontak={kontak}
              nama={nama}
              setKontak={setKontak}
              setNama={setNama}
              loading={loading}
              error={error}
              data={data}
              onSubmit={handleSubmit}
              onRetry={() => handleSubmit(new Event("submit") as unknown as React.FormEvent)}
              onOpenTicket={handleOpenTicket}
              onBackToHistory={() => setView("history")}
              onBackToForm={() => setView("form")}
              selectedKode={selectedKode}
              ticketData={ticketData}
              ticketLoading={ticketLoading}
              ticketError={ticketError}
              onRetryTicket={() =>
                selectedKode && handleOpenTicket(selectedKode)
              }
            />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <ViewContent
                  view={view}
                  kontak={kontak}
                  nama={nama}
                  setKontak={setKontak}
                  setNama={setNama}
                  loading={loading}
                  error={error}
                  data={data}
                  onSubmit={handleSubmit}
                  onRetry={() =>
                    handleSubmit(new Event("submit") as unknown as React.FormEvent)
                  }
                  onOpenTicket={handleOpenTicket}
                  onBackToHistory={() => setView("history")}
                  onBackToForm={() => setView("form")}
                  selectedKode={selectedKode}
                  ticketData={ticketData}
                  ticketLoading={ticketLoading}
                  ticketError={ticketError}
                  onRetryTicket={() =>
                    selectedKode && handleOpenTicket(selectedKode)
                  }
                />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* ViewContent — switches on the current view                                  */
/* -------------------------------------------------------------------------- */

interface ViewContentProps {
  view: ViewState;
  kontak: string;
  nama: string;
  setKontak: (v: string) => void;
  setNama: (v: string) => void;
  loading: boolean;
  error: string | null;
  data: HistoryResponse | null;
  onSubmit: (e: React.FormEvent) => void;
  onRetry: () => void;
  onOpenTicket: (kode: string) => void;
  onBackToHistory: () => void;
  onBackToForm: () => void;
  selectedKode: string | null;
  ticketData: PendaftarResult | null;
  ticketLoading: boolean;
  ticketError: string | null;
  onRetryTicket: () => void;
}

function ViewContent(props: ViewContentProps) {
  if (props.view === "ticket") {
    return (
      <TicketView
        selectedKode={props.selectedKode}
        ticketData={props.ticketData}
        ticketLoading={props.ticketLoading}
        ticketError={props.ticketError}
        onBack={props.onBackToHistory}
        onRetry={props.onRetryTicket}
      />
    );
  }

  if (props.view === "history" && props.data) {
    return (
      <HistoryView
        data={props.data}
        onOpenTicket={props.onOpenTicket}
        onBack={props.onBackToForm}
      />
    );
  }

  // Default: form view (with optional inline error/result block).
  return (
    <FormView
      kontak={props.kontak}
      nama={props.nama}
      setKontak={props.setKontak}
      setNama={props.setNama}
      loading={props.loading}
      error={props.error}
      onSubmit={props.onSubmit}
      onRetry={props.onRetry}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* FormView — the initial lookup form                                          */
/* -------------------------------------------------------------------------- */

interface FormViewProps {
  kontak: string;
  nama: string;
  setKontak: (v: string) => void;
  setNama: (v: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onRetry: () => void;
}

function FormView({
  kontak,
  nama,
  setKontak,
  setNama,
  loading,
  error,
  onSubmit,
  onRetry,
}: FormViewProps) {
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="vh-kontak" className="text-sm font-medium">
            Nomor HP
          </Label>
          <Input
            id="vh-kontak"
            value={kontak}
            onChange={(e) => setKontak(e.target.value)}
            placeholder="0812xxxx"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            className="h-11 rounded-xl border-secondary bg-card shadow-sm transition-all focus-visible:ring-primary/30 focus-visible:shadow-md"
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vh-nama" className="text-sm font-medium">
            Nama Depan
          </Label>
          <Input
            id="vh-nama"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Nama depan kamu"
            autoComplete="given-name"
            maxLength={60}
            className="h-11 rounded-xl border-secondary bg-card shadow-sm transition-all focus-visible:ring-primary/30 focus-visible:shadow-md"
            disabled={loading}
          />
        </div>
        <p className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          Demi keamanan data, pencarian wajib menggunakan nomor HP + nama depan.
          Pencarian hanya dengan nomor HP tidak diizinkan.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="btn-press w-full rounded-full bg-primary shadow-md hover:bg-primary/90 hover:shadow-lg transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Mengambil riwayat...
            </>
          ) : (
            <>
              <Search className="size-4" />
              Lihat Riwayat Saya
            </>
          )}
        </Button>
      </form>

      {/* Error block (form-level — shown when fetch returns 400/404/429/500) */}
      {error && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-rejected/20 bg-rejected/5 p-4">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-rejected/10 text-rejected">
            <AlertTriangle className="size-4" />
          </span>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-ink">Gagal memuat riwayat</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-1.5 rounded-full border-rejected/30 text-rejected hover:bg-rejected/5"
            >
              <RefreshCw className="size-3.5" />
              Coba lagi
            </Button>
          </div>
        </div>
      )}

      {/* Loading skeleton — shown while the fetch is in flight */}
      {loading && <HistorySkeleton />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HistoryView — profile card + timeline                                       */
/* -------------------------------------------------------------------------- */

interface HistoryViewProps {
  data: HistoryResponse;
  onOpenTicket: (kode: string) => void;
  onBack: () => void;
}

function HistoryView({ data, onOpenTicket, onBack }: HistoryViewProps) {
  const { volunteer, history } = data;
  const initials = getInitials(volunteer.nama);

  return (
    <div className="space-y-5">
      {/* Back to form */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-pink-primary"
      >
        <ArrowLeft className="size-3.5" />
        Cari relawan lain
      </button>

      {/* ---------- Profile card ---------- */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-pink-soft/40 via-card to-card p-5 shadow-sm">
        {/* Decorative dots */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/5 blur-2xl"
        />

        <div className="relative flex items-start gap-4">
          {/* Avatar circle with initials */}
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-md ring-4 ring-pink-soft/50"
            aria-hidden
          >
            {initials}
          </div>

          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Halo,
            </p>
            <h2 className="font-display text-2xl font-bold leading-tight text-ink">
              {volunteer.nama}!
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                Member sejak {formatMonthYearID(volunteer.memberSince)}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-mono">{volunteer.kontak}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip
            icon={<History className="size-3.5" />}
            label="Total Daftar"
            value={volunteer.totalRegistrations}
            tone="pink"
          />
          <StatChip
            icon={<ShieldCheck className="size-3.5" />}
            label="Terverifikasi"
            value={volunteer.totalVerified}
            tone="success"
          />
          <StatChip
            icon={<Clock className="size-3.5" />}
            label="Menunggu"
            value={volunteer.totalPending}
            tone="pending"
          />
          <StatChip
            icon={<Users className="size-3.5" />}
            label="Total Orang"
            value={volunteer.totalPeople}
            tone="amber"
          />
        </div>
      </div>

      {/* ---------- Timeline ---------- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-ink">
            Riwayat Pendaftaran
          </h3>
          <span className="rounded-full bg-secondary/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {history.length} event
          </span>
        </div>

        <div className="space-y-2.5">
          {history.map((item, idx) => (
            <HistoryCard
              key={item.kodeReferensi}
              item={item}
              index={idx}
              onOpenTicket={onOpenTicket}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StatChip — single stat tile in the profile card                             */
/* -------------------------------------------------------------------------- */

interface StatChipProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "pink" | "success" | "pending" | "amber";
}

function StatChip({ icon, label, value, tone }: StatChipProps) {
  const toneClasses: Record<StatChipProps["tone"], string> = {
    pink: "bg-primary/10 text-pink-primary",
    success: "bg-success/10 text-success",
    pending: "bg-amber/10 text-pending",
    amber: "bg-[var(--amber)]/10 text-pending",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-md",
            toneClasses[tone],
          )}
        >
          {icon}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 font-mono text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HistoryCard — single registration in the timeline                           */
/* -------------------------------------------------------------------------- */

interface HistoryCardProps {
  item: HistoryItem;
  index: number;
  onOpenTicket: (kode: string) => void;
}

function HistoryCard({ item, index, onOpenTicket }: HistoryCardProps) {
  const badge = statusBadge(item.status);
  const isVerified = item.status === "verified";
  const canOpenTicket = isVerified; // only verified have a TicketCard to show

  return (
    <motion.div
      initial={index === 0 ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <button
        type="button"
        disabled={!canOpenTicket}
        onClick={() => canOpenTicket && onOpenTicket(item.kodeReferensi)}
        aria-label={
          canOpenTicket
            ? `Lihat tiket untuk ${item.event.judul}`
            : `Pendaftaran ${item.event.judul} — ${badge.label}`
        }
        className={cn(
          "group block w-full rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all",
          canOpenTicket
            ? "cursor-pointer border-primary/15 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            : "cursor-default border-border/60",
        )}
      >
        {/* Top row: status badge + kode */}
        <div className="flex items-center justify-between gap-2">
          <Badge className={cn("rounded-full px-2 py-0.5", badge.className)}>
            <span
              className={cn("size-1.5 rounded-full", badge.dotClassName)}
              aria-hidden
            />
            {badge.label}
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground">
            {item.kodeReferensi}
          </span>
        </div>

        <Separator className="my-2.5 bg-border/60" />

        {/* Event title */}
        <h4 className="font-display text-sm font-bold leading-snug text-ink">
          {item.event.judul}
        </h4>

        {/* Meta row: tanggal + lokasi */}
        <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3 shrink-0 text-pink-primary" />
            <span>{formatTanggalShort(item.event.tanggal)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0 text-pink-primary" />
            <span>{item.event.lokasi}</span>
          </div>
        </div>

        {/* Bottom row: jumlah orang + total bayar + (optional) CTA */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="size-3" />
              <span className="font-mono font-medium text-ink">
                {item.jumlahOrang}
              </span>
              orang
            </span>
            <span className="font-mono text-xs font-medium text-ink">
              {formatIDR(item.totalBayar)}
            </span>
          </div>
          {canOpenTicket ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-pink-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Ticket className="size-3" />
              Lihat Tiket
            </span>
          ) : isVerified ? null : (
            <span className="text-[11px] text-muted-foreground">
              Daftar {formatDateTimeID(item.createdAt).split(",")[0]}
            </span>
          )}
        </div>
      </button>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* TicketView — verified click-through renders the TicketCard in-place         */
/* -------------------------------------------------------------------------- */

interface TicketViewProps {
  selectedKode: string | null;
  ticketData: PendaftarResult | null;
  ticketLoading: boolean;
  ticketError: string | null;
  onBack: () => void;
  onRetry: () => void;
}

function TicketView({
  selectedKode,
  ticketData,
  ticketLoading,
  ticketError,
  onBack,
  onRetry,
}: TicketViewProps) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-pink-primary"
      >
        <ArrowLeft className="size-3.5" />
        Kembali ke riwayat
      </button>

      {ticketLoading && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <p className="text-center text-sm text-muted-foreground">
            Memuat tiket
            {selectedKode ? (
              <>
                {" "}
                <span className="font-mono">{selectedKode}</span>...
              </>
            ) : (
              "..."
            )}
          </p>
          <TicketSkeleton />
        </div>
      )}

      {ticketError && !ticketLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-rejected/20 bg-rejected/5 p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-rejected/10 text-rejected">
            <AlertTriangle className="size-5" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {ticketError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-1.5 rounded-full border-rejected/30 text-rejected hover:bg-rejected/5"
          >
            <RefreshCw className="size-3.5" />
            Coba lagi
          </Button>
        </div>
      )}

      {ticketData && !ticketLoading && !ticketError && (
        <div className="pt-2">
          <TicketCard pendaftar={ticketData} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HistorySkeleton — shimmer placeholder while the form is submitting          */
/* -------------------------------------------------------------------------- */

function HistorySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {/* Profile card skeleton */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-start gap-4">
          <ShimmerSkeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <ShimmerSkeleton className="h-3 w-12" />
            <ShimmerSkeleton className="h-7 w-3/4" />
            <ShimmerSkeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerSkeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
      {/* Timeline skeleton */}
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <ShimmerSkeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default VolunteerHistory;
