'use client';

/**
 * RemindersTab — Saratrasaa (Task 10-C)
 *
 * Event reminder dashboard for admins. Surfaces verified pendaftar whose
 * events are happening within the next 7 days, classified into H-1 / H-3 /
 * H-7 windows. Each row has a "Kirim Pengingat" button that opens a dialog
 * which generates a WhatsApp-style reminder message using a template.
 *
 * Layout:
 *   1. Stats cards (4): Total, H-1, H-3, H-7 — each with its own icon.
 *   2. Filter chips: All / H-1 / H-3 / H-7 — click to filter the table.
 *   3. Reminders table: kode, nama, event, tanggal, days until, action button.
 *   4. Reminder dialog: loading → WhatsApp-style chat bubble → action buttons.
 *
 * Notes:
 *   - Uses the same admin token flow as the rest of AdminPanel (X-Admin-Token
 *     header on every fetch, 401 → call onUnauthorized).
 *   - The dialog reuses the NotificationDialog visual pattern (chat bubble,
 *     Salin / Buka WhatsApp / Tutup) but is self-contained because the API
 *     response shape differs (event reminder vs verification notification).
 *   - Respects prefers-reduced-motion: skeletons still shimmer (informational),
 *     but the LLM loading spinner is replaced by a static icon.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Bell,
  CalendarClock,
  AlarmClock,
  Hourglass,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  MessageCircle,
  X,
  AlertTriangle,
  ExternalLink,
  Calendar,
  MapPin,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ShimmerSkeleton } from "./Skeleton";
import { NotificationDialog } from "./NotificationDialog";

/* -------------------------------------------------------------------------- */
/* Types — matches the /api/admin/reminders response shape                     */
/* -------------------------------------------------------------------------- */

type ReminderType = "h-1" | "h-3" | "h-7";

interface Reminder {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  eventJudul: string;
  eventTanggal: string;
  eventLokasi: string;
  daysUntil: number;
  reminderType: ReminderType;
}

interface ReminderStats {
  total: number;
  h1: number;
  h3: number;
  h7: number;
}

interface RemindersResponse {
  reminders: Reminder[];
  stats: ReminderStats;
}

interface SendResponse {
  ok: true;
  message: string;
  shareUrl: string;
  pendaftar: {
    kodeReferensi: string;
    nama: string;
    kontak: string;
    jumlahOrang: number;
    status: string;
  };
  event: {
    judul: string;
    tanggal: string;
    lokasi: string;
  };
  daysUntil: number;
}

interface ErrorResponse {
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Normalize an Indonesian phone number for wa.me. Same logic as
 *  NotificationDialog — kept locally so this tab is self-contained. */
function normalizeWaNumber(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return "";
  if (hasPlus) return s;
  if (s.startsWith("00")) return s.slice(2);
  if (s.startsWith("0")) return "62" + s.slice(1);
  if (s.startsWith("62")) return s;
  return "62" + s;
}

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

/* -------------------------------------------------------------------------- */
/* Stat card                                                                   */
/* -------------------------------------------------------------------------- */

interface StatCardDef {
  key: "total" | "h-1" | "h-3" | "h-7";
  label: string;
  icon: LucideIcon;
  tone: "pink" | "amber" | "green" | "slate";
  description: string;
}

const STAT_DEFS: StatCardDef[] = [
  {
    key: "total",
    label: "Total Pengingat",
    icon: Bell,
    tone: "pink",
    description: "Semua pendaftar terverifikasi dengan event ≤ 7 hari",
  },
  {
    key: "h-1",
    label: "H-1",
    icon: AlarmClock,
    tone: "amber",
    description: "Event besok — pengingat mendesak",
  },
  {
    key: "h-3",
    label: "H-3",
    icon: Hourglass,
    tone: "pink",
    description: "Event 2–3 hari lagi",
  },
  {
    key: "h-7",
    label: "H-7",
    icon: CalendarClock,
    tone: "green",
    description: "Event 4–7 hari lagi",
  },
];

const STAT_TONE_STYLES: Record<
  StatCardDef["tone"],
  { circle: string; icon: string; value: string; border: string }
> = {
  pink: {
    circle: "bg-primary/10",
    icon: "text-primary",
    value: "text-foreground",
    border: "border-t-primary/30",
  },
  amber: {
    circle: "bg-[var(--amber)]/10",
    icon: "text-[var(--amber)]",
    value: "text-foreground",
    border: "border-t-[var(--amber)]/30",
  },
  green: {
    circle: "bg-[var(--success)]/10",
    icon: "text-[var(--success)]",
    value: "text-foreground",
    border: "border-t-[var(--success)]/30",
  },
  slate: {
    circle: "bg-slate-500/10",
    icon: "text-slate-500",
    value: "text-foreground",
    border: "border-t-slate-500/30",
  },
};

function StatCard({
  def,
  value,
  loading,
  active,
  onClick,
}: {
  def: StatCardDef;
  value: number;
  loading: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = def.icon;
  const tone = STAT_TONE_STYLES[def.tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group text-left rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "border-t-2",
        tone.border,
        active && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110",
            tone.circle,
          )}
          aria-hidden
        >
          <Icon className={cn("size-5", tone.icon)} />
        </span>
        <div className="min-w-0 flex-1">
          {loading ? (
            <ShimmerSkeleton className="h-7 w-16" />
          ) : (
            <p className={cn("font-mono text-2xl font-bold leading-none", tone.value)}>
              {value}
            </p>
          )}
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {def.label}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground line-clamp-2">
        {def.description}
      </p>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter chip                                                                 */
/* -------------------------------------------------------------------------- */

interface FilterChipDef {
  key: "all" | ReminderType;
  label: string;
}

const FILTER_CHIPS: FilterChipDef[] = [
  { key: "all", label: "Semua" },
  { key: "h-1", label: "H-1" },
  { key: "h-3", label: "H-3" },
  { key: "h-7", label: "H-7" },
];

/* -------------------------------------------------------------------------- */
/* Reminder type badge                                                         */
/* -------------------------------------------------------------------------- */

function ReminderTypeBadge({ type }: { type: ReminderType }) {
  if (type === "h-1") {
    return (
      <Badge className="border-transparent bg-[var(--amber)] text-white hover:bg-[var(--amber)]">
        H-1
      </Badge>
    );
  }
  if (type === "h-3") {
    return (
      <Badge className="border-transparent bg-primary text-primary-foreground hover:bg-primary">
        H-3
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-[var(--success)] text-white hover:bg-[var(--success)]">
      H-7
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

function EmptyReminders() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="mx-auto mb-3 inline-flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Bell className="size-7 text-primary" aria-hidden />
      </div>
      <p className="font-display text-lg font-semibold text-foreground">
        Tidak ada pengingat aktif
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Tidak ada pendaftar terverifikasi dengan event dalam 7 hari ke depan.
        Pengingat akan muncul otomatis saat event mendekat.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

interface RemindersTabProps {
  /** Admin token — sent as X-Admin-Token on every fetch. */
  token: string;
  /** Called when a fetch returns 401 (token expired) — parent logs out. */
  onUnauthorized: () => void;
}

export function RemindersTab({ token, onUnauthorized }: RemindersTabProps) {
  const [data, setData] = React.useState<RemindersResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | ReminderType>("all");
  const [notifyKodes, setNotifyKodes] = React.useState<string[] | null>(null);
  const [selectedKodes, setSelectedKodes] = React.useState<Set<string>>(new Set());

  const fetchReminders = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reminders", {
        headers: {
          Accept: "application/json",
          "X-Admin-Token": token,
        },
        cache: "no-store",
      });
      if (res.status === 401) {
        toast.error("Token admin tidak valid.");
        onUnauthorized();
        return;
      }
      if (res.status === 429) {
        const body = (await res
          .json()
          .catch(() => ({}))) as ErrorResponse;
        setError(
          body.error || "Terlalu banyak permintaan. Coba lagi sebentar.",
        );
        return;
      }
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({}))) as ErrorResponse;
        setError(body.error || "Gagal memuat pengingat.");
        return;
      }
      const json = (await res.json()) as RemindersResponse;
      setData(json);
    } catch (err) {
      setError("Gagal memuat pengingat: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized]);

  React.useEffect(() => {
    void fetchReminders();
  }, [fetchReminders]);

  const stats = data?.stats ?? { total: 0, h1: 0, h3: 0, h7: 0 };
  const allReminders = data?.reminders ?? [];

  const statsLoading = loading && !data;

  const filteredReminders = React.useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.reminders;
    return data.reminders.filter((r) => r.reminderType === filter);
  }, [data, filter]);

  const allFilteredSelected =
    filteredReminders.length > 0 &&
    filteredReminders.every((r) => selectedKodes.has(r.kodeReferensi));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedKodes((prev) => {
        const next = new Set(prev);
        filteredReminders.forEach((r) => next.delete(r.kodeReferensi));
        return next;
      });
    } else {
      setSelectedKodes((prev) => {
        const next = new Set(prev);
        filteredReminders.forEach((r) => next.add(r.kodeReferensi));
        return next;
      });
    }
  }

  function toggleRow(kode: string) {
    setSelectedKodes((prev) => {
      const next = new Set(prev);
      if (next.has(kode)) next.delete(kode);
      else next.add(kode);
      return next;
    });
  }

  function clearSelection() {
    setSelectedKodes(new Set());
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/5 via-background to-[var(--amber)]/5 p-4 sm:p-5 ring-1 ring-primary/10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl text-ink flex items-center gap-2">
            <Bell className="size-5 text-primary" />
            Pengingat Event
          </h2>
          <p className="text-sm text-muted-foreground">
            Pendaftar terverifikasi dengan event dalam 7 hari ke depan.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchReminders()}
          disabled={loading}
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats cards (also double as filter buttons) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <StatCard
          def={STAT_DEFS[0]}
          value={stats.total}
          loading={statsLoading}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatCard
          def={STAT_DEFS[1]}
          value={stats.h1}
          loading={statsLoading}
          active={filter === "h-1"}
          onClick={() => setFilter("h-1")}
        />
        <StatCard
          def={STAT_DEFS[2]}
          value={stats.h3}
          loading={statsLoading}
          active={filter === "h-3"}
          onClick={() => setFilter("h-3")}
        />
        <StatCard
          def={STAT_DEFS[3]}
          value={stats.h7}
          loading={statsLoading}
          active={filter === "h-7"}
          onClick={() => setFilter("h-7")}
        />
      </div>

      {/* Filter chips (alternative to clicking the cards) */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_CHIPS.map((chip) => {
          const count =
            chip.key === "all"
              ? stats.total
              : chip.key === "h-1"
                ? stats.h1
                : chip.key === "h-3"
                  ? stats.h3
                  : stats.h7;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              aria-pressed={filter === chip.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === chip.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                  filter === chip.key
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body — table / loading / empty / error */}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-destructive text-sm">
                Gagal memuat pengingat
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {error}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void fetchReminders()}
            disabled={loading}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Coba lagi
          </Button>
        </div>
      ) : loading && !data ? (
        <RemindersTableSkeleton />
      ) : filteredReminders.length === 0 ? (
        <EmptyReminders />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {selectedKodes.size > 0 && (
              <div className="bg-primary/5 border-b border-primary/10 p-3 flex items-center justify-between">
                <span className="text-sm font-medium text-primary flex items-center gap-2">
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {selectedKodes.size}
                  </span>
                  pendaftar dipilih
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNotifyKodes(Array.from(selectedKodes))}
                    className="text-pink-primary border-pink-primary/40 hover:bg-pink-primary/10"
                  >
                    <MessageCircle className="size-3.5" />
                    Buat Pesan ({selectedKodes.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearSelection}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            )}
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="w-[44px] pr-0">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Pilih semua pengingat"
                      />
                    </TableHead>
                    <TableHead className="w-[7rem]">Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="hidden md:table-cell">Event</TableHead>
                    <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                    <TableHead className="text-center">Hari</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReminders.map((r) => (
                    <TableRow
                      key={r.kodeReferensi}
                      className="hover:bg-secondary/30"
                    >
                      <TableCell className="pr-0">
                        <Checkbox
                          checked={selectedKodes.has(r.kodeReferensi)}
                          onCheckedChange={() => toggleRow(r.kodeReferensi)}
                          aria-label={`Pilih pendaftar ${r.kodeReferensi}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-primary">
                        {r.kodeReferensi}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {r.nama}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {r.kontak}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-foreground line-clamp-1">
                            {r.eventJudul}
                          </span>
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <MapPin className="size-3" />
                            {r.eventLokasi}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-xs text-foreground">
                            <Calendar className="size-3 text-muted-foreground" />
                            {formatTanggal(r.eventTanggal)}
                          </span>
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <Users className="size-3" />
                            {r.jumlahOrang} orang
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="font-mono text-sm font-bold text-foreground">
                            H-{r.daysUntil}
                          </span>
                          <ReminderTypeBadge type={r.reminderType} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setNotifyKodes([r.kodeReferensi])}
                          className="border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <MessageCircle className="size-3.5" />
                          Buat Pesan
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <NotificationDialog
        kodes={notifyKodes}
        token={token}
        onClose={() => setNotifyKodes(null)}
        title="Pengingat Event"
        defaultTemplate={`Halo {nama}! 👋

Sekadar mengingatkan, event *{eventJudul}* tinggal sebentar lagi lho! 🎪

📍 Lokasi: {eventLokasi}
📅 Tanggal: {eventTanggal}

Pastikan kamu sudah menyiapkan tiket QR-mu ya (Kode: *{kodeReferensi}*).
Cek tiketmu di sini: {shareUrl}

Sampai jumpa! 🌿💚`}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Table skeleton                                                             */
/* -------------------------------------------------------------------------- */

function RemindersTableSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="max-h-[28rem] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-[44px] pr-0"></TableHead>
                <TableHead className="w-[7rem]">Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden md:table-cell">Event</TableHead>
                <TableHead className="hidden sm:table-cell">Tanggal</TableHead>
                <TableHead className="text-center">Hari</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="pr-0">
                    <ShimmerSkeleton className="size-4 rounded" />
                  </TableCell>
                  <TableCell>
                    <ShimmerSkeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <ShimmerSkeleton className="h-4 w-32" />
                      <ShimmerSkeleton className="h-3 w-24" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="space-y-1.5">
                      <ShimmerSkeleton className="h-4 w-40" />
                      <ShimmerSkeleton className="h-3 w-28" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="space-y-1.5">
                      <ShimmerSkeleton className="h-4 w-28" />
                      <ShimmerSkeleton className="h-3 w-20" />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <ShimmerSkeleton className="h-6 w-12 mx-auto" />
                  </TableCell>
                  <TableCell className="text-right">
                    <ShimmerSkeleton className="h-8 w-28 ml-auto" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default RemindersTab;
