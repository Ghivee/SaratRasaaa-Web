'use client';

/**
 * CheckInDialog — Saratrasaa (Task 10-A)
 *
 * A large modal that hosts the QRScanner + a live "recent check-ins" list
 * + a compact stats summary. Opened from the "Check-in" tab in AdminPanel
 * via the "Mulai Check-in" button.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Header: "Check-in Event" · [Tutup]                          │
 *   ├──────────────────────────┬──────────────────────────────────┤
 *   │ LEFT (lg:col-span-3)     │ RIGHT (lg:col-span-2)            │
 *   │  QRScanner component     │  Stats: Total Today, Total All   │
 *   │  (camera + result card)  │  Recent check-ins list (last 20) │
 *   │                          │  · nama, kode, event, waktu      │
 *   └──────────────────────────┴──────────────────────────────────┘
 *
 * On smaller screens (< lg), the right panel stacks below the scanner.
 *
 * The recent list refreshes automatically after each successful scan via
 * the `onCheckIn` callback that the QRScanner invokes. Stats also refresh.
 *
 * Security:
 *   - The admin token is forwarded as `X-Admin-Token` on every fetch.
 *   - Server rejects with 401 if missing/wrong — we close the dialog and
 *     toast an error in that case (the parent admin panel will then log
 *     the admin out).
 */

import * as React from "react";
import { toast } from "sonner";
import {
  X,
  QrCode,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Users,
  CalendarDays,
  Clock,
  MapPin,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QRScanner } from "./QRScanner";

type PendaftarStatus = "pending_payment" | "verified" | "rejected";

interface RecentCheckIn {
  id: string;
  kodeReferensi: string;
  nama: string;
  jumlahOrang: number;
  status: PendaftarStatus;
  judul: string;
  idEvent: string;
  tanggalEvent: string;
  lokasiEvent: string;
  checkedInAt: string;
}

interface CheckInStats {
  totalCheckedIn: number;
  totalToday: number;
  byEvent: Array<{
    idEvent: string;
    judul: string;
    tanggal: string;
    checkedIn: number;
  }>;
}

interface CheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: PendaftarStatus): string {
  if (status === "verified")
    return "bg-success/15 text-success border-success/30";
  if (status === "pending_payment")
    return "bg-amber/15 text-amber border-amber/30";
  return "bg-rejected/15 text-rejected border-rejected/30";
}

function statusLabel(status: PendaftarStatus): string {
  if (status === "verified") return "Verified";
  if (status === "pending_payment") return "Pending";
  return "Rejected";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function CheckInDialog({
  open,
  onOpenChange,
  token,
}: CheckInDialogProps) {
  const [recent, setRecent] = React.useState<RecentCheckIn[]>([]);
  const [recentLoading, setRecentLoading] = React.useState(false);
  const [stats, setStats] = React.useState<CheckInStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  /* Fetch recent check-ins. */
  const fetchRecent = React.useCallback(async () => {
    if (!token) return;
    setRecentLoading(true);
    try {
      const res = await fetch("/api/admin/check-in/recent", {
        method: "GET",
        headers: { "X-Admin-Token": token },
      });
      if (res.status === 401) {
        toast.error("Token admin tidak valid.");
        onOpenChange(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Gagal memuat check-in terkini.");
        return;
      }
      const data = (await res.json()) as { checkIns: RecentCheckIn[] };
      setRecent(data.checkIns);
    } catch (err) {
      toast.error("Gagal memuat check-in: " + (err as Error).message);
    } finally {
      setRecentLoading(false);
    }
  }, [token, onOpenChange]);

  /* Fetch stats. */
  const fetchStats = React.useCallback(async () => {
    if (!token) return;
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/check-in/stats", {
        method: "GET",
        headers: { "X-Admin-Token": token },
      });
      if (res.status === 401) {
        toast.error("Token admin tidak valid.");
        onOpenChange(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Gagal memuat statistik check-in.");
        return;
      }
      const data = (await res.json()) as CheckInStats;
      setStats(data);
    } catch (err) {
      toast.error("Gagal memuat statistik: " + (err as Error).message);
    } finally {
      setStatsLoading(false);
    }
  }, [token, onOpenChange]);

  /* Initial load when the dialog opens. */
  React.useEffect(() => {
    if (open && token) {
      void fetchRecent();
      void fetchStats();
    }
  }, [open, token, fetchRecent, fetchStats, refreshNonce]);

  /* Refresh after each successful scan. */
  const handleCheckIn = React.useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] overflow-hidden p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-pink-soft/40 to-amber/5">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pink-primary/15">
                <QrCode className="size-5 text-pink-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-display text-lg truncate">
                  Check-in Event
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Scan QR tiket relawan untuk verifikasi kehadiran.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="shrink-0"
            >
              <X className="size-4" />
              Tutup
            </Button>
          </div>
        </DialogHeader>

        {/* Body — 2-column on lg, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 overflow-y-auto max-h-[calc(95vh-72px)]">
          {/* LEFT — Scanner */}
          <div className="lg:col-span-3 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r bg-card/30">
            <QRScanner token={token} onCheckIn={handleCheckIn} />
          </div>

          {/* RIGHT — Stats + Recent */}
          <div className="lg:col-span-2 p-4 sm:p-6 space-y-4 bg-background">
            {/* Stats summary */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-pink-primary" />
                  Statistik Check-in
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    void fetchRecent();
                    void fetchStats();
                  }}
                  disabled={recentLoading || statsLoading}
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      (recentLoading || statsLoading) && "animate-spin",
                    )}
                  />
                  Refresh
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  icon={CalendarDays}
                  label="Hari Ini"
                  value={stats?.totalToday}
                  loading={statsLoading}
                  color="pink"
                />
                <StatTile
                  icon={Users}
                  label="Total"
                  value={stats?.totalCheckedIn}
                  loading={statsLoading}
                  color="amber"
                />
              </div>

              {/* Per-event breakdown */}
              <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
                <div className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b bg-muted/30">
                  Per Event
                </div>
                {statsLoading ? (
                  <div className="p-2 space-y-1.5">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : stats && stats.byEvent.length > 0 ? (
                  <ScrollArea className="max-h-40">
                    <ul className="divide-y divide-border">
                      {stats.byEvent.map((ev) => (
                        <li
                          key={ev.idEvent}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">
                              {ev.judul}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {ev.tanggal}
                            </p>
                          </div>
                          <Badge className="bg-pink-primary/15 text-pink-primary border-pink-primary/30 shrink-0">
                            {ev.checkedIn}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                ) : (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Belum ada check-in.
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Recent check-ins */}
            <section className="space-y-2">
              <h3 className="font-display text-sm flex items-center gap-1.5">
                <History className="size-4 text-pink-primary" />
                Check-in Terkini
                {recent.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[10px] h-4 px-1.5"
                  >
                    {recent.length}
                  </Badge>
                )}
              </h3>

              {recentLoading && recent.length === 0 ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <History className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Belum ada check-in tercatat.
                  </p>
                  <p className="text-xs text-muted-foreground/80 mt-1">
                    Scan tiket pertama untuk mulai mengisi daftar ini.
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[40vh] lg:max-h-[calc(95vh-440px)] min-h-[200px] -mx-1 px-1">
                  <ul className="space-y-1.5">
                    {recent.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-lg border border-border bg-card p-2.5 hover:bg-pink-soft/20 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink truncate">
                              {c.nama}
                            </p>
                            <p className="text-xs font-mono text-pink-primary">
                              {c.kodeReferensi}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {c.judul}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] h-4 px-1.5",
                                statusBadgeClass(c.status),
                              )}
                            >
                              {statusLabel(c.status)}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground font-mono inline-flex items-center gap-0.5">
                              <Clock className="size-2.5" />
                              {formatTime(c.checkedInAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-0.5">
                            <Users className="size-2.5" />
                            {c.jumlahOrang} orang
                          </span>
                          <span className="inline-flex items-center gap-0.5 truncate">
                            <MapPin className="size-2.5 shrink-0" />
                            <span className="truncate">{c.lokasiEvent}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Small subcomponents                                                 */
/* ------------------------------------------------------------------ */

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  loading: boolean;
  color: "pink" | "amber" | "green";
}) {
  const colorClasses =
    color === "pink"
      ? "bg-pink-primary/10 text-pink-primary"
      : color === "amber"
        ? "bg-amber/10 text-amber"
        : "bg-success/10 text-success";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded",
            colorClasses,
          )}
        >
          <Icon className="size-3" />
        </span>
        {label}
      </div>
      {loading && value === undefined ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <p className="font-data text-2xl font-semibold text-ink">
          {value ?? 0}
        </p>
      )}
    </div>
  );
}

function Separator() {
  return <div className="h-px bg-border" />;
}

CheckInDialog.displayName = "CheckInDialog";
export default CheckInDialog;
