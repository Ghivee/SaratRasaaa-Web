'use client';

/**
 * AdminEventDetailModal — Saratrasaa (Task 9-C)
 *
 * A large Dialog showing per-event analytics for the admin "Kelola Event"
 * tab. Opened by the "Detail Analytics" (BarChart3) button next to each
 * event row.
 *
 * NOTE on naming: there is already a public-facing `EventDetailModal`
 * used by UpcomingEvents on the beranda (it shows judul/deskripsi/map/
 * harga for a single event when a volunteer clicks an event card). This
 * admin analytics modal is a separate concern — it shows stat cards,
 * a registration timeline chart, and the full pendaftar table for
 * admins only — so it lives under a distinct filename to avoid an
 * import-name collision. The two modals share NO props (the public one
 * takes `{ id, onClose }`, this one takes `{ eventId, token, onClose }`).
 *
 * Layout (top → bottom):
 *   a. Header — event judul, tanggal, lokasi, status badge, fotoCover thumbnail
 *   b. Stats grid — 6 cards:
 *        Total Pendaftar · Verified · Pending · Rejected · Revenue · Fill Rate
 *   c. Registration timeline chart — Recharts AreaChart of cumulative
 *      registrations per day. Falls back to an empty-state card when the
 *      event has no pendaftar yet.
 *   d. Pendaftar table — kode, nama, kontak, jumlah, total, status, tanggal
 *
 * Loading state uses ShimmerSkeleton (matches the rest of the app).
 * "Tutup" button in the footer. Responsive: the shadcn Dialog grows to
 * fill the viewport on small screens.
 *
 * Accessibility / motion:
 *   - The Dialog from shadcn/ui handles focus trap, ESC, and backdrop click.
 *   - Chart is gated behind a `mounted` flag (set in useEffect) so
 *     ResponsiveContainer never renders during SSR.
 *   - All entrance animations are skipped under prefers-reduced-motion
 *     via the global rule in globals.css.
 *
 * Security:
 *   - The admin token is forwarded as `X-Admin-Token` on every fetch. The
 *     server rejects with 401 if it's missing/wrong — we close the modal
 *     and toast an error in that case.
 */

import * as React from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  X,
  RefreshCw,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Wallet,
  Percent,
  Calendar,
  MapPin,
  BarChart3,
  TrendingUp,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
/* Types — matches the /api/admin/event/detail response shape                  */
/* -------------------------------------------------------------------------- */

type PendaftarStatus = "pending_payment" | "verified" | "rejected";

interface DetailEvent {
  id: string;
  judul: string;
  deskripsi: string;
  tanggal: string; // YYYY-MM-DD
  lokasi: string;
  fotoCover: string; // "" or "/uploads/..."
  harga: number;
  kuotaMax: number;
  status: "upcoming" | "active" | "closed";
  recap: string;
  fotoDok: string[];
  createdAt: string;
}

interface DetailStats {
  totalPendaftar: number;
  verified: number;
  pending: number;
  rejected: number;
  totalOrang: number;
  revenue: number;
  fillRate: number;
  avgBayar: number;
}

interface DetailTimelinePoint {
  date: string; // YYYY-MM-DD
  count: number;
  cumulative: number;
}

interface DetailPendaftar {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  hargaDasar: number;
  kodeUnik: number;
  totalBayar: number;
  status: PendaftarStatus;
  createdAt: string;
  verifiedAt: string | null;
}

interface EventDetailData {
  event: DetailEvent;
  stats: DetailStats;
  timeline: DetailTimelinePoint[];
  pendaftar: DetailPendaftar[];
}

interface AdminEventDetailModalProps {
  /** Event id to fetch. When null, the modal is closed. */
  eventId: string | null;
  /** Admin token — passed as X-Admin-Token header on the fetch. */
  token: string;
  /** Called when the user wants to close the modal. */
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

/** Format an ISO datetime as Indonesian "15 Maret 2025, 14.30". */
function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

/** Resolve a relative upload path to a full URL for <img src>. */
function resolvePath(p: string): string {
  if (!p) return "";
  if (p.startsWith("http") || p.startsWith("data:")) return p;
  return p.startsWith("/") ? p : `/${p}`;
}

/** Convert "2025-06-21" → "21 Jun" for the chart axis. */
function shortDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  const m = parseInt(parts[1], 10) - 1;
  return `${parts[2]} ${months[m] ?? parts[1]}`;
}

/** Convert "2025-06-21" → "21/06/2025" for tooltip + table. */
function longDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                               */
/* -------------------------------------------------------------------------- */

function EventStatusBadge({ status }: { status: DetailEvent["status"] }) {
  const label =
    status === "active"
      ? "Active"
      : status === "upcoming"
        ? "Upcoming"
        : "Closed";
  return (
    <Badge
      variant={status === "active" ? "default" : "secondary"}
      className={cn(
        status === "active" &&
          "border-transparent bg-pink-primary text-white hover:bg-pink-primary",
        status === "upcoming" &&
          "border-transparent bg-amber text-ink hover:bg-amber",
        status === "closed" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function PendaftarStatusBadge({ status }: { status: PendaftarStatus }) {
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

/** Stat card — same visual language as the dashboard RecapStatCard. */
function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
  tone: "pink" | "amber" | "green" | "red" | "ink";
}) {
  const toneClasses =
    tone === "pink"
      ? "bg-pink-soft text-pink-primary"
      : tone === "amber"
        ? "bg-amber/20 text-amber"
        : tone === "green"
          ? "bg-success/15 text-success"
          : tone === "red"
            ? "bg-destructive/10 text-destructive"
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
        <span className="text-[11px] sm:text-xs text-muted-foreground uppercase tracking-wider leading-tight">
          {label}
        </span>
      </div>
      <div className="mt-2 font-data text-xl sm:text-2xl font-bold text-ink truncate">
        {value}
      </div>
      {sublabel ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="flex items-start gap-3">
        <ShimmerSkeleton className="size-16 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <ShimmerSkeleton className="h-6 w-3/4" />
          <ShimmerSkeleton className="h-4 w-1/2" />
          <ShimmerSkeleton className="h-4 w-1/3" />
        </div>
      </div>
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerSkeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      {/* Chart skeleton */}
      <ShimmerSkeleton className="h-48 rounded-xl" />
      {/* Table skeleton */}
      <div className="space-y-2">
        <ShimmerSkeleton className="h-9 rounded-md" />
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerSkeleton key={i} className="h-9 rounded-md" />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

export function AdminEventDetailModal({
  eventId,
  token,
  onClose,
}: AdminEventDetailModalProps) {
  const open = eventId !== null;

  const [data, setData] = React.useState<EventDetailData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Recharts ResponsiveContainer needs a client-side width — only render
  // the chart after mount to avoid SSR/hydration width mismatch.
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Re-fetch whenever the opened eventId changes (and reset state on close).
  React.useEffect(() => {
    if (!open || !eventId || !token) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/admin/event/detail?id=${encodeURIComponent(eventId)}`,
          {
            method: "GET",
            headers: { "X-Admin-Token": token },
          },
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
        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({ error: "Gagal memuat detail event." }));
          setError(body.error || "Gagal memuat detail event.");
          return;
        }
        const json = (await res.json()) as EventDetailData;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError("Gagal memuat detail event: " + (err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, eventId, token, onClose]);

  // Manual retry — re-runs the fetch by flipping a dummy state.
  const [retryNonce, setRetryNonce] = React.useState(0);
  const retry = React.useCallback(() => {
    setError(null);
    setRetryNonce((n) => n + 1);
  }, []);
  // Watch retryNonce and re-fetch.
  React.useEffect(() => {
    if (!retryNonce || !open || !eventId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/event/detail?id=${encodeURIComponent(eventId)}`,
          { headers: { "X-Admin-Token": token } },
        );
        if (cancelled) return;
        if (res.status === 401) {
          toast.error("Token admin tidak valid.");
          onClose();
          return;
        }
        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({ error: "Gagal memuat detail event." }));
          setError(body.error || "Gagal memuat detail event.");
          return;
        }
        const json = (await res.json()) as EventDetailData;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError("Gagal memuat detail event: " + (err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryNonce, open, eventId, token, onClose]);

  const hasPendaftar = (data?.pendaftar.length ?? 0) > 0;
  const hasTimeline = (data?.timeline.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto",
          "p-0 gap-0",
        )}
      >
        {/* ---------- Header ---------- */}
        <DialogHeader className="p-5 sm:p-6 pb-3 border-b border-border">
          <DialogTitle className="sr-only">Detail Analytics Event</DialogTitle>
          <DialogDescription className="sr-only">
            Statistik pendaftaran, grafik timeline, dan daftar pendaftar untuk
            event ini.
          </DialogDescription>
          {data ? (
            <div className="flex items-start gap-4">
              {/* Cover thumbnail */}
              <div className="size-16 sm:size-20 rounded-xl overflow-hidden border border-border bg-muted shrink-0">
                {data.event.fotoCover ? (
                  // Using a plain <img> because the cover lives in /public
                  // and is fetched dynamically — next/image would need a
                  // width/height or fill layout we don't have here.
                  <img
                    src={resolvePath(data.event.fotoCover)}
                    alt={`Cover ${data.event.judul}`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <EventStatusBadge status={data.event.status} />
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <BarChart3 className="size-3.5" />
                    Detail Analytics
                  </span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-ink leading-tight">
                  {data.event.judul}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {formatTanggal(data.event.tanggal)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    {data.event.lokasi}
                  </span>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-start gap-4">
              <ShimmerSkeleton className="size-16 sm:size-20 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <ShimmerSkeleton className="h-5 w-1/3" />
                <ShimmerSkeleton className="h-6 w-3/4" />
                <ShimmerSkeleton className="h-4 w-1/2" />
              </div>
            </div>
          ) : null}
        </DialogHeader>

        {/* ---------- Body ---------- */}
        <div className="p-5 sm:p-6 pt-4 space-y-6">
          {loading && !data ? (
            <DetailSkeleton />
          ) : error ? (
            <div className="text-center py-12 space-y-4">
              <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <div className="space-y-1">
                <p className="font-display text-lg font-semibold text-ink">
                  Gagal memuat detail event
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                <RefreshCw className="size-4" />
                Coba lagi
              </Button>
            </div>
          ) : data ? (
            <>
              {/* ---------- Stats grid (6 cards) ---------- */}
              <motion.section
                aria-label="Statistik event"
                initial={false}
                className="grid grid-cols-2 lg:grid-cols-3 gap-3"
              >
                <StatCard
                  icon={Users}
                  label="Total Pendaftar"
                  value={String(data.stats.totalPendaftar)}
                  sublabel={`${data.stats.totalOrang} orang total`}
                  tone="pink"
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Verified"
                  value={String(data.stats.verified)}
                  sublabel="sudah bayar"
                  tone="green"
                />
                <StatCard
                  icon={Clock}
                  label="Pending"
                  value={String(data.stats.pending)}
                  sublabel="menunggu bayar"
                  tone="amber"
                />
                <StatCard
                  icon={XCircle}
                  label="Rejected"
                  value={String(data.stats.rejected)}
                  sublabel="ditolak admin"
                  tone="red"
                />
                <StatCard
                  icon={Wallet}
                  label="Revenue"
                  value={formatIDR(data.stats.revenue)}
                  sublabel={`avg ${formatIDR(data.stats.avgBayar)}`}
                  tone="ink"
                />
                <StatCard
                  icon={Percent}
                  label="Fill Rate"
                  value={`${data.stats.fillRate.toFixed(1)}%`}
                  sublabel={`${data.stats.totalOrang}/${data.event.kuotaMax} kuota`}
                  tone="pink"
                />
              </motion.section>

              {/* ---------- Registration timeline chart ---------- */}
              <section aria-label="Grafik pendaftaran">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="font-display text-sm sm:text-base font-semibold text-ink inline-flex items-center gap-2">
                    <TrendingUp className="size-4 text-pink-primary" />
                    Timeline Pendaftaran
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {hasTimeline
                      ? `${data.timeline.length} hari aktif`
                      : "Belum ada data"}
                  </span>
                </div>
                {!hasTimeline ? (
                  <div className="h-44 rounded-xl border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                    Belum ada pendaftar untuk event ini.
                  </div>
                ) : mounted ? (
                  <div className="h-56 sm:h-64 w-full rounded-xl border border-border bg-pink-soft/10 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.timeline}
                        margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
                      >
                        <defs>
                          <linearGradient
                            id="evDetailGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#FF2D78" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#FF2D78" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#FFD6E5"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#1F1115" }}
                          stroke="#FFD6E5"
                          tickLine={false}
                          tickFormatter={(d: string) => shortDate(d)}
                          minTickGap={16}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: "#1F1115" }}
                          stroke="#FFD6E5"
                          tickLine={false}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "white",
                            border: "1px solid #F3D9DE",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(label: unknown) =>
                            longDate(String(label))
                          }
                          formatter={(value: number, name: string) => {
                            if (name === "cumulative") {
                              return [value, "Kumulatif"];
                            }
                            return [value, "Harian"];
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cumulative"
                          name="cumulative"
                          stroke="#FF2D78"
                          strokeWidth={2.5}
                          fill="url(#evDetailGrad)"
                          dot={{ r: 3, fill: "#FF2D78", strokeWidth: 0 }}
                          activeDot={{
                            r: 5,
                            fill: "#FF2D78",
                            strokeWidth: 2,
                            stroke: "white",
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <ShimmerSkeleton className="h-56 sm:h-64 w-full rounded-xl" />
                )}
              </section>

              {/* ---------- Pendaftar table ---------- */}
              <section aria-label="Daftar pendaftar">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="font-display text-sm sm:text-base font-semibold text-ink inline-flex items-center gap-2">
                    <Users className="size-4 text-pink-primary" />
                    Daftar Pendaftar
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {data.pendaftar.length} pendaftar
                  </span>
                </div>
                {hasPendaftar ? (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="max-h-[28rem] overflow-y-auto scroll-soft">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-pink-soft/30 backdrop-blur">
                          <TableRow className="hover:bg-pink-soft/30">
                            <TableHead className="w-[110px]">Kode</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead className="hidden sm:table-cell">
                              Kontak
                            </TableHead>
                            <TableHead className="w-[60px] text-right">
                              Orang
                            </TableHead>
                            <TableHead className="w-[120px] text-right">
                              Total
                            </TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[120px] hidden md:table-cell">
                              Tanggal
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.pendaftar.map((p) => (
                            <TableRow key={p.kodeReferensi}>
                              <TableCell className="font-data text-xs">
                                {p.kodeReferensi}
                              </TableCell>
                              <TableCell className="font-medium max-w-[180px] truncate">
                                {p.nama}
                              </TableCell>
                              <TableCell className="font-data text-xs hidden sm:table-cell">
                                {p.kontak}
                              </TableCell>
                              <TableCell className="text-right font-data">
                                {p.jumlahOrang}
                              </TableCell>
                              <TableCell className="text-right font-data text-xs">
                                {formatIDR(p.totalBayar)}
                              </TableCell>
                              <TableCell>
                                <PendaftarStatusBadge status={p.status} />
                              </TableCell>
                              <TableCell className="font-data text-xs hidden md:table-cell">
                                {formatDateTime(p.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Belum ada pendaftar untuk event ini.
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>

        {/* ---------- Footer ---------- */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border bg-background/95 backdrop-blur px-5 sm:px-6 py-3">
          <div className="text-xs text-muted-foreground">
            {data
              ? `Kuota ${data.stats.totalOrang}/${data.event.kuotaMax} · ${formatIDR(data.event.harga)}/orang`
              : ""}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <X className="size-4" />
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AdminEventDetailModal;
