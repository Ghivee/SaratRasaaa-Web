'use client';

/**
 * AdminPanel — Saratrasaa (brief §4.4)
 *
 * Two-layer component implementing security fix #2:
 *   - The admin token NEVER lives in the JS bundle. The admin TYPES it into a
 *     password input every session. It is held in React state AND a short-lived
 *     cookie (1 hour, SameSite=Strict) so the session survives page refreshes.
 *   - Every fetch to /api/admin/** sends the typed token in the `X-Admin-Token`
 *     header (see `adminFetch` below). Clicking "Keluar" wipes the token from
 *     both state and cookie.
 *
 *   Layer 1 — Token gate (centered card, password input).
 *   Layer 2 — Admin dashboard (Tabs: Dashboard + Kelola Event +
 *            Pendaftar + Dokumentasi History + Webhook Logs).
 *
 * Enhancements:
 *   - Pendaftar tab: CSV export (filtered) via blob download.
 *   - Pendaftar tab: Reject dialog now collects an optional catatan
 *     (stored as catatanAdmin, surfaced on the Cek Status page).
 *   - New Webhook Logs tab: read-only table of recent webhook deliveries
 *     from the third-party mutation service (signature/IP/kode/reason).
 *
 * Function over form per brief §4.4 ("Tidak perlu seindah halaman publik —
 * prioritas kegunaan"), but still on-brand (Saratrasaa pink, no indigo/blue).
 */

import * as React from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Lock,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Upload,
  X,
  Image as ImageIcon,
  Calendar,
  MapPin,
  Users,
  Clock,
  CheckCircle,
  Wallet,
  Check,
  RefreshCw,
  Loader2,
  ExternalLink,
  Download,
  Info,
  Search,
  BarChart3,
  FileText,
  Printer,
  Percent,
  TrendingUp,
  PieChart as PieChartIcon,
  MessageCircle,
  Sparkles,
  QrCode,
  CalendarDays,
  History,
  Bell,
  Menu,
  Copy,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

// Recharts is installed at v2.15.4 — fully client-side via ResponsiveContainer.
// We gate the chart render behind a `mounted` state (set in useEffect) to
// avoid any SSR/hydration width mismatch from ResponsiveContainer.
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { cn } from "@/lib/utils";
import { AdminEventItem } from "./types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatIDR } from "@/lib/saratrasa";
import { ImageDropZone } from "./ImageDropZone";
import { RecapModal } from "./RecapModal";
import { NotificationDialog } from "./NotificationDialog";
import { AdminEventDetailModal } from "./AdminEventDetailModal";
import { CheckInReport } from "./CheckInReport";
import { CheckInDialog } from "./CheckInDialog";
import { RemindersTab } from "./RemindersTab";
import { fireVerifyConfetti } from "@/lib/confetti";
import { AdminKeuangan } from "./AdminKeuangan";
import { AdminTestimoni } from "./AdminTestimoni";
import { PhotoLightbox } from "./PhotoLightbox";

interface AdminPanelProps {
  /**
   * The URL secret that granted access to this page (already validated
   * server-side via ?admin=<secret>). Kept for context only — the actual
   * auth is the typed token. NOT sent to any API.
   */
  urlSecret: string;
}

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB — matches server-side validateUpload
const MAX_RECAP_LEN = 2000;
const MAX_REJECT_CATATAN = 500; // matches server-side catatanAdmin slice in /api/admin/pendaftar

/* ------------------------------------------------------------------ */
/* Cookie helpers — persist admin token across page refreshes          */
/* ------------------------------------------------------------------ */
const ADMIN_COOKIE_NAME = "saratrasaa-admin-token";
const ADMIN_COOKIE_MAX_AGE = 3600; // 1 hour

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
}

/**
 * Inline fetch helper — every admin API call carries the X-Admin-Token header
 * sourced from React state (typed by the admin each session). The token NEVER
 * lives in the JS bundle, localStorage, or a cookie. (Security fix #2.)
 */
async function adminFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": token,
      ...(init?.headers || {}),
    },
  });
  return res;
}

/** Read a single File into a base64 data URL (for upload to the API). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Status-aware badge — pink for active, amber for upcoming, muted for closed. */
function StatusBadge({ status }: { status: AdminEventItem["status"] }) {
  const label =
    status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : "Closed";
  return (
    <Badge
      variant={status === "active" ? "default" : "secondary"}
      className={cn(
        status === "upcoming" && "border-transparent bg-amber text-ink",
        status === "closed" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

type PendaftarStatus = "pending_payment" | "verified" | "rejected";

interface DashboardStats {
  events: { active: number; upcoming: number; closed: number; total: number };
  pendaftar: {
    pending: number;
    verified: number;
    rejected: number;
    total: number;
  };
  revenue: number;
  /** Distinct kontak count across all pendaftar — proxy for unique relawan. */
  totalUniqueRelawan: number;
  /** Average pendaftar per event (total pendaftar / total events), 1 decimal. */
  avgPendaftarPerEvent: number;
  /** Conversion rate = verified / total * 100, 1 decimal. */
  conversionRate: number;
  recent: Array<{
    kodeReferensi: string;
    nama: string;
    kontak: string;
    jumlahOrang: number;
    totalBayar: number;
    status: PendaftarStatus;
    createdAt: string;
    event: { judul: string };
  }>;
}

/** One slice of the status distribution donut chart. */
interface StatusDistributionSlice {
  name: "Pending" | "Verified" | "Rejected";
  value: number;
  color: string;
}

/** One row in the Event Performance leaderboard. */
interface EventPerformanceRow {
  id: string;
  judul: string;
  tanggal: string;
  totalPendaftar: number;
  verifiedCount: number;
  revenue: number;
  kuotaMax: number;
  terpakai: number;
  fillRate: number;
}

interface AdminPendaftarItem {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  totalBayar: number;
  kodeUnik: number;
  status: PendaftarStatus;
  createdAt: string;
  verifiedAt: string | null;
  buktiTransfer: string | null;
  event: { judul: string; tanggal: string; lokasi: string };
}

/**
 * Full pendaftar detail — matches /api/admin/pendaftar/detail response.
 * Adds hargaDasar, catatanAdmin, and a fuller event object vs AdminPendaftarItem.
 */
interface PendaftarDetailData {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  hargaDasar: number;
  kodeUnik: number;
  totalBayar: number;
  status: PendaftarStatus;
  catatanAdmin: string | null;
  buktiTransfer: string | null;
  createdAt: string;
  verifiedAt: string | null;
  event: {
    id: string;
    judul: string;
    tanggal: string;
    lokasi: string;
    harga: number;
    kuotaMax: number;
  };
  peserta: {
    urutan: number;
    namaLengkap: string;
    namaPanggilan: string;
    umur: number | null;
    alamat: string | null;
    fotoDiri: string | null;
    instagram: string | null;
    nomorWa: string;
  }[];
}

/** One row in the check-in recent list — matches /api/admin/check-in/recent. */
interface CheckInRecentItem {
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

/** Aggregated check-in stats — matches /api/admin/check-in/stats. */
interface CheckInStatsData {
  totalCheckedIn: number;
  totalToday: number;
  byEvent: Array<{
    idEvent: string;
    judul: string;
    tanggal: string;
    checkedIn: number;
  }>;
}

/** Format an ISO datetime as an Indonesian date (e.g. "15 Maret 2025"). */
function formatTanggal(iso: string): string {
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
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Status badge for a pendaftar row — amber/green/red per spec. */
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

/** Chart data point — matches /api/admin/chart-data series entry shape. */
interface ChartDataPoint {
  date: string; // YYYY-MM-DD
  pending: number;
  verified: number;
  rejected: number;
  total: number;
  volunteers: number;
}

/** Webhook log entry — matches /api/admin/webhook-logs response shape. */
interface WebhookLogItem {
  id: number;
  receivedAt: string;
  ip: string | null;
  amount: number | null;
  signatureOk: boolean;
  ipOk: boolean;
  matchedKode: string | null;
  reason: string | null;
  rawPayload: string | null;
}

/** Indonesian labels for webhook outcome reasons. */
const WEBHOOK_REASON_LABELS: Record<string, string> = {
  verified: "Terverifikasi",
  no_match: "Tidak ada cocok",
  bad_signature: "Signature salah",
  ip_denied: "IP diblokir",
  bad_json: "JSON invalid",
  bad_amount: "Nominal invalid",
};

/** Color-coded badge for a webhook outcome reason. */
function WebhookReasonBadge({ reason }: { reason: string | null }) {
  if (!reason) {
    return <span className="text-muted-foreground">—</span>;
  }
  const label = WEBHOOK_REASON_LABELS[reason] || reason;
  const cls =
    reason === "verified"
      ? "border-transparent bg-success text-white hover:bg-success"
      : reason === "no_match"
        ? "bg-muted text-muted-foreground"
        : reason === "bad_signature" || reason === "ip_denied"
          ? "border-transparent bg-destructive text-white hover:bg-destructive"
          : reason === "bad_json" || reason === "bad_amount"
            ? "border-transparent bg-amber text-ink hover:bg-amber"
            : "bg-muted text-muted-foreground";
  return <Badge className={cls}>{label}</Badge>;
}

/** Format an ISO datetime as Indonesian "15 Mar 2025, 14.30". */
function formatWaktuWebhook(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
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

function extractTrxId(rawPayload: string | null): string {
  if (!rawPayload) return "—";
  try {
    const data = JSON.parse(rawPayload);
    const trxId = data.trx_id || data.trxId || data.transaction_id || data.transactionId || data.id;
    return trxId ? String(trxId) : "—";
  } catch {
    return "—";
  }
}

/** Compact stat card for the dashboard grid. */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  pulse,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: "pink" | "amber" | "green";
  pulse?: boolean;
  description?: string;
}) {
  const colorClasses =
    color === "pink"
      ? "bg-pink-soft text-pink-primary"
      : color === "amber"
        ? "bg-amber/20 text-amber"
        : "bg-success/15 text-success";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      whileHover={{ scale: 1.03, y: -2 }}
      className="bg-card rounded-xl p-4 border border-border shadow-sm hover:shadow-md transition-shadow cursor-default"
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            "size-9 rounded-full flex items-center justify-center",
            colorClasses,
          )}
        >
          <Icon className="size-4" />
        </div>
        {pulse ? (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-amber" />
          </span>
        ) : null}
      </div>
      <div className="mt-3 font-mono text-2xl font-bold truncate">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 font-medium">{label}</div>
      {description && (
        <div className="text-[10.5px] text-muted-foreground/75 leading-tight mt-1.5">
          {description}
        </div>
      )}
    </motion.div>
  );
}

const EMPTY_FORM = {
  judul: "",
  deskripsi: "",
  tanggal: "",
  waktuMulai: "",
  lokasi: "",
  linkGmaps: "",
  harga: "",
  kuotaMax: "",
  status: "upcoming" as AdminEventItem["status"],
  /**
   * Cover photo state. Three possible shapes:
   *   - null: no cover (new event) or user cleared an existing one.
   *   - "/uploads/cover-xxx.jpg": the existing cover path loaded from the
   *     server when editing (sent as-is to ImageDropZone for preview; NOT
   *     re-sent on submit since the server already has it).
   *   - "data:image/...;base64,...": a freshly-uploaded cover (will be sent
   *     to the API as fotoCover on submit).
   */
  fotoCover: null as string | null,
};

function AdminPanel({ urlSecret: _urlSecret }: AdminPanelProps) {
  // ----- Layer 1 → Layer 2 transition state -----
  // On mount, check if the admin token cookie exists and pre-fill state.
  // This allows the admin session to survive a page refresh.
  const [token, setToken] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return getCookie(ADMIN_COOKIE_NAME);
  });
  const [tokenExpiresAt, setTokenExpiresAt] = React.useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const exp = localStorage.getItem("saratrasaa-admin-exp");
    return exp && getCookie(ADMIN_COOKIE_NAME) ? parseInt(exp, 10) : null;
  });
  const [timeLeft, setTimeLeft] = React.useState<string>("60:00");

  React.useEffect(() => {
    if (!tokenExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, tokenExpiresAt - Date.now());
      if (remaining === 0) {
        clearInterval(interval);
        handleLogout();
        toast.error("Sesi telah habis, silakan login ulang.");
      } else {
        const m = Math.floor(remaining / 60000).toString().padStart(2, "0");
        const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
        setTimeLeft(`${m}:${s}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [tokenExpiresAt]);

  const [tokenDraft, setTokenDraft] = React.useState("");
  const [isVerifyingToken, setIsVerifyingToken] = React.useState(false);

  // ----- Tab state -----
  const [activeTab, setActiveTab] = React.useState<
    | "dashboard"
    | "events"
    | "pendaftar"
    | "keuangan"
    | "history"
    | "webhook"
    | "checkin"
    | "reminders"
    | "testimoni"
  >(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (
        hash === "dashboard" ||
        hash === "events" ||
        hash === "pendaftar" ||
        hash === "keuangan" ||
        hash === "history" ||
        hash === "webhook" ||
        hash === "checkin" ||
        hash === "reminders" ||
        hash === "testimoni"
      ) {
        return hash as any;
      }
    }
    return "dashboard";
  });

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.hash !== `#${activeTab}`) {
        url.hash = activeTab;
        window.history.replaceState(null, "", url.toString());
      }
    }
  }, [activeTab]);

  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (
        hash === "dashboard" ||
        hash === "events" ||
        hash === "pendaftar" ||
        hash === "history" ||
        hash === "webhook" ||
        hash === "checkin" ||
        hash === "reminders" ||
        hash === "testimoni"
      ) {
        setActiveTab(hash as any);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // ----- Events list state (Tab 1) -----
  const [events, setEvents] = React.useState<AdminEventItem[]>([]);
  const [eventsLoading, setEventsLoading] = React.useState(false);

  // ----- Event form state (Tab 1 right side) -----
  // `form.fotoCover` holds the cover state directly (null | path | data URL),
  // so we no longer need a separate coverFile File object — the ImageDropZone
  // component reads the file into a base64 data URL for us.
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [eventToDelete, setEventToDelete] = React.useState<AdminEventItem | null>(null);
  const [lightboxData, setLightboxData] = React.useState<{ urls: string[], fileNames: string[], activeIndex: number } | null>(null);
  const lightboxDataRef = React.useRef(lightboxData);
  React.useEffect(() => {
    lightboxDataRef.current = lightboxData;
  }, [lightboxData]);

  // ----- History form state (Tab 2) -----
  const [selectedHistoryEventId, setSelectedHistoryEventId] = React.useState("");
  const [recap, setRecap] = React.useState("");
  const [historyPhotos, setHistoryPhotos] = React.useState<File[]>([]);
  const [existingDokFotos, setExistingDokFotos] = React.useState<string[]>([]);
  const [historySubmitting, setHistorySubmitting] = React.useState(false);

  React.useEffect(() => {
    if (selectedHistoryEventId) {
      const event = events.find((e) => e.id === selectedHistoryEventId);
      if (event) {
        setRecap(event.recap || "");
        const parsedPhotos = typeof event.fotoDok === "string"
          ? (event.fotoDok ? event.fotoDok.split(",").map(s => s.trim()).filter(Boolean) : [])
          : (Array.isArray(event.fotoDok) ? event.fotoDok : []);
        setExistingDokFotos(parsedPhotos);
      }
    } else {
      setRecap("");
      setExistingDokFotos([]);
    }
  }, [selectedHistoryEventId, events]);

  // ----- Recap modal state (Tab 2 — Dokumentasi History) -----
  // When non-null, the RecapModal is open for that event id. The modal
  // fetches its own data from /api/admin/event/recap using the admin token.
  const [recapEventId, setRecapEventId] = React.useState<string | null>(null);

  // ----- Dashboard state (Tab: Dashboard) -----
  const [dashboardStats, setDashboardStats] = React.useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = React.useState(false);

  // ----- Status distribution state (Dashboard tab — donut chart) -----
  const [statusDistribution, setStatusDistribution] = React.useState<
    StatusDistributionSlice[]
  >([]);
  const [statusDistributionLoading, setStatusDistributionLoading] =
    React.useState(false);

  // ----- Event performance state (Dashboard tab — leaderboard) -----
  const [eventPerformance, setEventPerformance] = React.useState<
    EventPerformanceRow[]
  >([]);
  const [eventPerformanceLoading, setEventPerformanceLoading] =
    React.useState(false);

  // ----- "Last updated" timestamp — refreshed whenever stats are re-fetched. -----
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  // ----- Pendaftar management state (Tab: Pendaftar) -----
  const [pendaftarList, setPendaftarList] = React.useState<AdminPendaftarItem[]>([]);
  const [pendaftarLoading, setPendaftarLoading] = React.useState(false);
  const [pendaftarFilters, setPendaftarFilters] = React.useState<{
    idEvent: string;
    status: string;
  }>({ idEvent: "", status: "" });
  const [pendaftarPage, setPendaftarPage] = React.useState(1);
  const PENDAFTAR_PER_PAGE = 20;
  const [pendaftarActionLoading, setPendaftarActionLoading] = React.useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = React.useState<{
    kodeReferensi: string;
    nama: string;
  } | null>(null);
  const [verifyDialog, setVerifyDialog] = React.useState<{
    kodeReferensi: string;
  } | null>(null);
  const [rejectCatatan, setRejectCatatan] = React.useState("");

  // ----- Bulk selection state (Tab: Pendaftar) -----
  // selectedKodes holds the set of kodeReferensi the admin has ticked.
  // bulkActionLoading gates both bulk buttons while a request is in-flight.
  // bulkRejectDialog controls the bulk-reject confirmation dialog (with catatan).
  const [selectedKodes, setSelectedKodes] = React.useState<Set<string>>(new Set());
  const [logoutDialog, setLogoutDialog] = React.useState(false);
  const [bulkActionLoading, setBulkActionLoading] = React.useState<"verify" | "reject" | null>(null);
  const [bulkRejectOpen, setBulkRejectOpen] = React.useState(false);
  const [bulkRejectCatatan, setBulkRejectCatatan] = React.useState("");

  // ----- CSV export state (Tab: Pendaftar) -----
  const [csvExporting, setCsvExporting] = React.useState(false);

  // ----- Webhook Logs state (Tab: Webhook Logs) -----
  const [webhookLogs, setWebhookLogs] = React.useState<WebhookLogItem[]>([]);
  const [webhookLogsLoading, setWebhookLogsLoading] = React.useState(false);

  // ----- Pendaftar search (client-side filter on nama / kode / kontak) -----
  const [pendaftarSearch, setPendaftarSearch] = React.useState("");

  // ----- Webhook log detail modal -----
  const [webhookDetail, setWebhookDetail] = React.useState<WebhookLogItem | null>(
    null,
  );

  // ----- Pendaftar detail modal (Pendaftar tab) -----
  // pendaftarDetail holds the full detail payload; null = modal closed.
  // pendaftarDetailLoading holds the kode being fetched (for the initial
  // spinner before the payload arrives).
  const [pendaftarDetail, setPendaftarDetail] =
    React.useState<PendaftarDetailData | null>(null);
  const [pendaftarDetailLoading, setPendaftarDetailLoading] = React.useState<
    string | null
  >(null);

  // ----- Notification dialog state (Task 8-E) -----
  // When non-null, the NotificationDialog is open for that kodeReferensi.
  // The admin opens it via the "Buat Pesan Notifikasi" button in the
  // pendaftar detail modal (verified pendaftar only) or the MessageCircle
  // icon button in the pendaftar table row (verified pendaftar only).
  const [notifyKodes, setNotifyKodes] = React.useState<string[] | null>(null);

  // ----- Event detail analytics modal state (Task 9-C) -----
  // When non-null, the EventDetailModal is open for that event id. The
  // modal fetches its own data from /api/admin/event/detail using the
  // admin token. Opened by the "Detail Analytics" (BarChart3) button in
  // the Kelola Event tab.
  const [detailEventId, setDetailEventId] = React.useState<string | null>(null);

  // ----- Check-in dialog + tab data (Task 10-A) -----
  // checkInDialogOpen controls the full-screen QR scanner modal opened from
  // the "Check-in" tab's "Mulai Check-in" button. The tab itself also shows
  // a recent-check-ins list + stats summary; those are kept in
  // `checkInRecent` / `checkInStats` so they're visible without opening the
  // dialog. The dialog fetches its own copy so it can refresh independently
  // after each scan.
  const [checkInDialogOpen, setCheckInDialogOpen] = React.useState(false);
  const [checkInRecent, setCheckInRecent] = React.useState<CheckInRecentItem[]>(
    [],
  );
  const [checkInStats, setCheckInStats] =
    React.useState<CheckInStatsData | null>(null);
  const [checkInRecentLoading, setCheckInRecentLoading] = React.useState(false);
  const [checkInStatsLoading, setCheckInStatsLoading] = React.useState(false);

  // ----- Chart data state (Dashboard tab) -----
  const [chartSeries, setChartSeries] = React.useState<ChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = React.useState(false);
  // Recharts ResponsiveContainer needs a client-side width. We render the
  // chart only after mount to avoid SSR/hydration width mismatches.
  const [chartMounted, setChartMounted] = React.useState(false);

  // ----- Webhook log filters (Webhook Logs tab) -----
  // whFilterReason "" = all; values match WEBHOOK_REASON_LABELS keys.
  // whFilterDays "7" | "30" | "90" | "all" — "all" disables the date filter.
  const [whFilterReason, setWhFilterReason] = React.useState<string>("");
  const [whFilterDays, setWhFilterDays] = React.useState<string>("7");

  const closedEvents = React.useMemo(
    () => events.filter((e) => e.status === "closed"),
    [events],
  );

  /**
   * Client-side filter on webhook logs — by reason + date range. The API
   * returns up to 50 logs, so client-side filtering is fine.
   */
  const filteredWebhookLogs = React.useMemo(() => {
    let result = webhookLogs;
    if (whFilterReason) result = result.filter((l) => l.reason === whFilterReason);
    if (whFilterDays !== "all") {
      const days = parseInt(whFilterDays, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      result = result.filter((l) => new Date(l.receivedAt) >= cutoff);
    }
    return result;
  }, [webhookLogs, whFilterReason, whFilterDays]);

  /**
   * Client-side search filter on top of the server-filtered pendaftar list.
   * Searches across nama, kodeReferensi, and kontak (case-insensitive).
   */
  const filteredPendaftar = React.useMemo(() => {
    const q = pendaftarSearch.trim().toLowerCase();
    if (!q) return pendaftarList;
    return pendaftarList.filter(
      (p) =>
        p.nama.toLowerCase().includes(q) ||
        p.kodeReferensi.toLowerCase().includes(q) ||
        p.kontak.toLowerCase().includes(q),
    );
  }, [pendaftarList, pendaftarSearch]);

  React.useEffect(() => {
    setPendaftarPage(1);
  }, [pendaftarSearch, pendaftarFilters]);

  const paginatedPendaftar = React.useMemo(() => {
    const start = (pendaftarPage - 1) * PENDAFTAR_PER_PAGE;
    return filteredPendaftar.slice(start, start + PENDAFTAR_PER_PAGE);
  }, [filteredPendaftar, pendaftarPage]);
  const totalPendaftarPages = Math.ceil(filteredPendaftar.length / PENDAFTAR_PER_PAGE);

  /**
   * Drop any selected kode that no longer exists in the current list
   * (e.g. after a filter change or after a bulk action refreshed the list).
   * This keeps the bulk-action toolbar count honest.
   */
  React.useEffect(() => {
    if (selectedKodes.size === 0) return;
    const stillPresent = new Set(pendaftarList.map((p) => p.kodeReferensi));
    let changed = false;
    const next = new Set<string>();
    for (const k of selectedKodes) {
      if (stillPresent.has(k)) {
        next.add(k);
      } else {
        changed = true;
      }
    }
    if (changed) setSelectedKodes(next);
  }, [pendaftarList, selectedKodes]);

  /** Derived: how many of the *currently visible* rows are selected. */
  const visibleSelectedCount = React.useMemo(() => {
    let n = 0;
    for (const p of paginatedPendaftar) {
      if (selectedKodes.has(p.kodeReferensi)) n += 1;
    }
    return n;
  }, [paginatedPendaftar, selectedKodes]);

  /** Derived: are all visible (filterable) rows selected? "indeterminate" if some. */
  const allVisibleSelected =
    filteredPendaftar.length > 0 &&
    filteredPendaftar.every((p) => selectedKodes.has(p.kodeReferensi));
  const someVisibleSelected =
    !allVisibleSelected &&
    filteredPendaftar.some((p) => selectedKodes.has(p.kodeReferensi));

  /** Of the selected kodes, how many are *eligible* for bulk action (pending). */
  const selectedPendingCount = React.useMemo(() => {
    const byKode = new Map(pendaftarList.map((p) => [p.kodeReferensi, p]));
    let n = 0;
    for (const k of selectedKodes) {
      if (byKode.get(k)?.status === "pending_payment") n += 1;
    }
    return n;
  }, [pendaftarList, selectedKodes]);

  /** Toggle one row's checkbox. */
  function toggleKode(kode: string) {
    setSelectedKodes((prev) => {
      const next = new Set(prev);
      if (next.has(kode)) next.delete(kode);
      else next.add(kode);
      return next;
    });
  }

  /** Toggle all currently-visible rows. */
  function toggleAllVisible() {
    setSelectedKodes((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        // Deselect all filtered rows
        for (const p of filteredPendaftar) next.delete(p.kodeReferensi);
      } else {
        // Select all filtered rows
        for (const p of filteredPendaftar) next.add(p.kodeReferensi);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedKodes(new Set());
  }

  /* ------------------------------------------------------------------ */
  /* Token gate submit / logout                                         */
  /* ------------------------------------------------------------------ */
  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isVerifyingToken) return;

    const t = tokenDraft.trim();
    if (!t) {
      toast.error("Token tidak boleh kosong.");
      return;
    }

    setIsVerifyingToken(true);
    try {
      // Verify token stealthily before actually entering the dashboard
      const res = await adminFetch("/api/admin/stats", t, { method: "GET" });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        setTokenDraft("");
        return;
      }
      if (!res.ok) {
        toast.error("Gagal terhubung ke server.");
        return;
      }

      setToken(t);
      setCookie(ADMIN_COOKIE_NAME, t, ADMIN_COOKIE_MAX_AGE);
      const exp = Date.now() + ADMIN_COOKIE_MAX_AGE * 1000;
      setTokenExpiresAt(exp);
      localStorage.setItem("saratrasaa-admin-exp", exp.toString());
      setTokenDraft("");
      toast.success("Token disimpan untuk sesi ini. Cookie berlaku 1 jam.");
    } catch (err) {
      toast.error("Terjadi kesalahan saat memverifikasi token.");
    } finally {
      setIsVerifyingToken(false);
    }
  }

  function handleLogout() {

    setToken(null);
    setTokenExpiresAt(null);
    deleteCookie(ADMIN_COOKIE_NAME);
    localStorage.removeItem("saratrasaa-admin-exp");
    setEvents([]);
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setHistoryPhotos([]);
    setRecap("");
    setSelectedHistoryEventId("");
    setActiveTab("dashboard");
    setDashboardStats(null);
    setPendaftarList([]);
    setPendaftarFilters({ idEvent: "", status: "" });
    setPendaftarActionLoading(null);
    setRejectDialog(null);
    setVerifyDialog(null);
    setRejectCatatan("");
    setSelectedKodes(new Set());
    setBulkActionLoading(null);
    setBulkRejectOpen(false);
    setBulkRejectCatatan("");
    setCsvExporting(false);
    setWebhookLogs([]);
    setWebhookLogsLoading(false);
    setPendaftarSearch("");
    setWebhookDetail(null);
    setChartSeries([]);
    setChartLoading(false);
    setWhFilterReason("");
    setWhFilterDays("7");
    setPendaftarDetail(null);
    setPendaftarDetailLoading(null);
    setRecapEventId(null);
    setNotifyKodes(null);
    setDetailEventId(null);
    setStatusDistribution([]);
    setStatusDistributionLoading(false);
    setEventPerformance([]);
    setEventPerformanceLoading(false);
    setLastUpdated(null);
    setCheckInDialogOpen(false);
    setCheckInRecent([]);
    setCheckInStats(null);
    setCheckInRecentLoading(false);
    setCheckInStatsLoading(false);
  }

  /* ------------------------------------------------------------------ */
  /* Fetch events — on Layer 2 mount + when Tab 1 regains focus         */
  /* ------------------------------------------------------------------ */
  const fetchEvents = React.useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    setEventsLoading(true);
    try {
      const res = await adminFetch("/api/admin/event", token, { method: "GET", signal });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Gagal memuat event." }));
        toast.error(data.error || "Gagal memuat event.");
        return;
      }
      const data = (await res.json()) as { events: AdminEventItem[] };
      setEvents(data.events);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      toast.error("Gagal memuat event: " + (err as Error).message);
    } finally {
      setEventsLoading(false);
    }
  }, [token]);

  async function moveEvent(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === events.length - 1) return;

    const newEvents = [...events];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    
    const temp = newEvents[index];
    newEvents[index] = newEvents[targetIndex];
    newEvents[targetIndex] = temp;

    setEvents(newEvents);

    try {
      const res = await fetch("/api/admin/event/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderedIds: newEvents.map((e) => e.id),
        }),
      });

      if (!res.ok) {
        throw new Error("Gagal menyimpan urutan");
      }
      toast.success("Urutan event diperbarui");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan urutan");
      fetchEvents(); 
    }
  }

  React.useEffect(() => {
    const controller = new AbortController();
    // Events list also feeds the Pendaftar, Keuangan, and History tabs — fetch on these.
    if (token && (activeTab === "events" || activeTab === "pendaftar" || activeTab === "keuangan" || activeTab === "history")) {
      void fetchEvents(controller.signal);
    }
    return () => controller.abort();
  }, [token, activeTab, fetchEvents]);

  /* ------------------------------------------------------------------ */
  /* Fetch dashboard stats — on Layer 2 mount + when Dashboard is active */
  /* ------------------------------------------------------------------ */
  const fetchStats = React.useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    setDashboardLoading(true);
    try {
      const res = await adminFetch("/api/admin/stats", token, { method: "GET", signal });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat statistik." }));
        toast.error(data.error || "Gagal memuat statistik.");
        return;
      }
      const data = (await res.json()) as { stats: DashboardStats };
      setDashboardStats(data.stats);
      setLastUpdated(new Date());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      toast.error("Gagal memuat statistik: " + (err as Error).message);
    } finally {
      setDashboardLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    const controller = new AbortController();
    if (token && activeTab === "dashboard") {
      void fetchStats(controller.signal);
    }
    return () => controller.abort();
  }, [token, activeTab, fetchStats]);

  /* ------------------------------------------------------------------ */
  /* Fetch status distribution — for the donut chart                     */
  /* ------------------------------------------------------------------ */
  const fetchStatusDistribution = React.useCallback(async () => {
    if (!token) return;
    setStatusDistributionLoading(true);
    try {
      const res = await adminFetch("/api/admin/status-distribution", token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat distribusi status." }));
        toast.error(data.error || "Gagal memuat distribusi status.");
        return;
      }
      const data = (await res.json()) as {
        distribution: StatusDistributionSlice[];
      };
      setStatusDistribution(data.distribution);
    } catch (err) {
      toast.error("Gagal memuat distribusi status: " + (err as Error).message);
    } finally {
      setStatusDistributionLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (token && activeTab === "dashboard") {
      void fetchStatusDistribution();
    }
  }, [token, activeTab, fetchStatusDistribution]);

  /* ------------------------------------------------------------------ */
  /* Fetch event performance leaderboard                                 */
  /* ------------------------------------------------------------------ */
  const fetchEventPerformance = React.useCallback(async () => {
    if (!token) return;
    setEventPerformanceLoading(true);
    try {
      const res = await adminFetch("/api/admin/event-performance", token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat performa event." }));
        toast.error(data.error || "Gagal memuat performa event.");
        return;
      }
      const data = (await res.json()) as {
        events: EventPerformanceRow[];
      };
      setEventPerformance(data.events);
    } catch (err) {
      toast.error("Gagal memuat performa event: " + (err as Error).message);
    } finally {
      setEventPerformanceLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (token && activeTab === "dashboard") {
      void fetchEventPerformance();
    }
  }, [token, activeTab, fetchEventPerformance]);

  /** Refresh every dashboard section at once — wired to the top-right button. */
  function refreshDashboard() {
    void fetchStats();
    void fetchChartData();
    void fetchStatusDistribution();
    void fetchEventPerformance();
  }

  /* ------------------------------------------------------------------ */
  /* Fetch chart data — alongside the dashboard stats                    */
  /* ------------------------------------------------------------------ */
  const fetchChartData = React.useCallback(async () => {
    if (!token) return;
    setChartLoading(true);
    try {
      const res = await adminFetch("/api/admin/chart-data?days=30", token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat data grafik." }));
        toast.error(data.error || "Gagal memuat data grafik.");
        return;
      }
      const data = (await res.json()) as { series: ChartDataPoint[] };
      setChartSeries(data.series);
    } catch (err) {
      toast.error("Gagal memuat data grafik: " + (err as Error).message);
    } finally {
      setChartLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (token && activeTab === "dashboard") {
      void fetchChartData();
    }
  }, [token, activeTab, fetchChartData]);

  // Flip the `mounted` flag once on the client so the chart can render.
  React.useEffect(() => {
    setChartMounted(true);
  }, []);

  /** True iff every day in the series has zero pendaftar (→ show empty note). */
  const chartAllZero = React.useMemo(
    () => chartSeries.length > 0 && chartSeries.every((d) => d.total === 0),
    [chartSeries],
  );

  /* ------------------------------------------------------------------ */
  /* Fetch pendaftar list — on tab focus + whenever filters change      */
  /* ------------------------------------------------------------------ */
  const fetchPendaftar = React.useCallback(async () => {
    if (!token) return;
    setPendaftarLoading(true);
    try {
      const params = new URLSearchParams();
      if (pendaftarFilters.idEvent) params.set("idEvent", pendaftarFilters.idEvent);
      if (pendaftarFilters.status) params.set("status", pendaftarFilters.status);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await adminFetch(`/api/admin/pendaftar${qs}`, token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat pendaftar." }));
        toast.error(data.error || "Gagal memuat pendaftar.");
        return;
      }
      const data = (await res.json()) as { pendaftar: AdminPendaftarItem[] };
      setPendaftarList(data.pendaftar);
    } catch (err) {
      toast.error("Gagal memuat pendaftar: " + (err as Error).message);
    } finally {
      setPendaftarLoading(false);
    }
  }, [token, pendaftarFilters]);

  React.useEffect(() => {
    if (token && activeTab === "pendaftar") {
      void fetchPendaftar();
    }
  }, [token, activeTab, fetchPendaftar]);

  /* ------------------------------------------------------------------ */
  /* Fetch webhook logs — on tab focus                                  */
  /* ------------------------------------------------------------------ */
  const fetchWebhookLogs = React.useCallback(async () => {
    if (!token) return;
    setWebhookLogsLoading(true);
    try {
      const res = await adminFetch("/api/admin/webhook-logs?limit=50", token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat log webhook." }));
        toast.error(data.error || "Gagal memuat log webhook.");
        return;
      }
      const data = (await res.json()) as { logs: WebhookLogItem[] };
      setWebhookLogs(data.logs);
    } catch (err) {
      toast.error("Gagal memuat log webhook: " + (err as Error).message);
    } finally {
      setWebhookLogsLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (token && activeTab === "webhook") {
      void fetchWebhookLogs();
    }
  }, [token, activeTab, fetchWebhookLogs]);

  /* ------------------------------------------------------------------ */
  /* Fetch check-in recent + stats — on "Check-in" tab focus             */
  /* ------------------------------------------------------------------ */
  const fetchCheckInRecent = React.useCallback(async () => {
    if (!token) return;
    setCheckInRecentLoading(true);
    try {
      const res = await adminFetch("/api/admin/check-in/recent", token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat check-in terkini." }));
        toast.error(data.error || "Gagal memuat check-in terkini.");
        return;
      }
      const data = (await res.json()) as { checkIns: CheckInRecentItem[] };
      setCheckInRecent(data.checkIns);
    } catch (err) {
      toast.error(
        "Gagal memuat check-in terkini: " + (err as Error).message,
      );
    } finally {
      setCheckInRecentLoading(false);
    }
  }, [token]);

  const fetchCheckInStats = React.useCallback(async () => {
    if (!token) return;
    setCheckInStatsLoading(true);
    try {
      const res = await adminFetch("/api/admin/check-in/stats", token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat statistik check-in." }));
        toast.error(data.error || "Gagal memuat statistik check-in.");
        return;
      }
      const data = (await res.json()) as CheckInStatsData;
      setCheckInStats(data);
    } catch (err) {
      toast.error(
        "Gagal memuat statistik check-in: " + (err as Error).message,
      );
    } finally {
      setCheckInStatsLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    if (token && activeTab === "checkin") {
      void fetchCheckInRecent();
      void fetchCheckInStats();
    }
  }, [token, activeTab, fetchCheckInRecent, fetchCheckInStats]);

  /* ------------------------------------------------------------------ */
  /* Export CSV — GET /api/admin/pendaftar/export (blob download)       */
  /* ------------------------------------------------------------------ */
  async function handleExportCsv() {
    if (!token) return;
    setCsvExporting(true);
    try {
      const params = new URLSearchParams();
      if (pendaftarFilters.idEvent) params.set("idEvent", pendaftarFilters.idEvent);
      if (pendaftarFilters.status) params.set("status", pendaftarFilters.status);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await adminFetch(`/api/admin/pendaftar/export${qs}`, token, {
        method: "GET",
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal mengunduh CSV." }));
        toast.error(data.error || "Gagal mengunduh CSV.");
        return;
      }
      // Fetch with headers can't trigger a native download, so we read
      // the CSV as a blob, build a temporary object URL, and click a
      // synthesized <a download> element to hand off to the browser.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition");
      const match = cd?.match(/filename=?"([^";]+)"?/i);
      a.download =
        match?.[1] ||
        `pendaftar-saratrasaa-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV berhasil diunduh.");
    } catch (err) {
      toast.error("Gagal mengunduh CSV: " + (err as Error).message);
    } finally {
      setCsvExporting(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Verify / reject — POST /api/admin/pendaftar                         */
  /* ------------------------------------------------------------------ */
  async function postPendaftarAction(
    kodeReferensi: string,
    action: "verify" | "reject",
    catatan?: string,
  ) {
    if (!token) return;
    setPendaftarActionLoading(kodeReferensi);
    try {
      const body: Record<string, unknown> = { kodeReferensi, action };
      // Reject action accepts an optional catatan that the server stores
      // as `catatanAdmin` and surfaces on the Cek Status page.
      if (action === "reject" && catatan && catatan.trim()) {
        body.catatan = catatan.trim().slice(0, MAX_REJECT_CATATAN);
      }
      const res = await adminFetch("/api/admin/pendaftar", token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (res.status === 409) {
        toast.error("Status sudah bukan pending.");
        await fetchPendaftar();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memperbarui status pendaftar." }));
        toast.error(data.error || "Gagal memperbarui status pendaftar.");
        return;
      }
      toast.success(
        action === "verify" ? "Pendaftar diverifikasi." : "Pendaftar ditolak.",
      );
      // Confetti celebration on successful verification — desktop only
      // (mobile admins are usually in the field; the confetti could be
      // distracting on a small screen). Respects prefers-reduced-motion.
      if (action === "verify") {
        fireVerifyConfetti();
      }
      // Refresh both the pendaftar list and the dashboard stats so the
      // counts/revenue stay in sync after a status change.
      await Promise.all([fetchPendaftar(), fetchStats()]);
    } catch (err) {
      toast.error("Gagal memperbarui status: " + (err as Error).message);
    } finally {
      setPendaftarActionLoading(null);
    }
  }

  function handleVerify(kodeReferensi: string) {
    return postPendaftarAction(kodeReferensi, "verify");
  }

  function handleReject(kodeReferensi: string, catatan?: string) {
    return postPendaftarAction(kodeReferensi, "reject", catatan);
  }

  /* ------------------------------------------------------------------ */
  /* Bulk verify / reject — POST /api/admin/pendaftar/bulk              */
  /* ------------------------------------------------------------------ */
  async function postBulkPendaftarAction(
    action: "verify" | "reject",
    kodes: string[],
    catatan?: string,
  ): Promise<{ ok: boolean; updated?: number; failed?: string[] } | null> {
    if (!token || kodes.length === 0) return null;
    setBulkActionLoading(action);
    try {
      const body: Record<string, unknown> = { action, kodes };
      if (action === "reject" && catatan && catatan.trim()) {
        body.catatan = catatan.trim().slice(0, MAX_REJECT_CATATAN);
      }
      const res = await adminFetch("/api/admin/pendaftar/bulk", token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return null;
      }
      if (res.status === 429) {
        const data = await res
          .json()
          .catch(() => ({ error: "Terlalu banyak permintaan bulk." }));
        toast.error(data.error || "Terlalu banyak permintaan bulk.");
        return null;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memproses bulk action." }));
        toast.error(data.error || "Gagal memproses bulk action.");
        return null;
      }
      const data = (await res.json()) as {
        ok: boolean;
        updated: number;
        failed: string[];
      };

      // Toast feedback — distinguish "all succeeded" vs "some skipped".
      if (data.updated === 0) {
        toast.error(
          "Tidak ada pendaftar yang diperbarui — semua sudah bukan pending.",
        );
      } else if (data.failed.length > 0) {
        toast.warning(
          `${data.updated} pendaftar ${action === "verify" ? "terverifikasi" : "ditolak"}. ` +
          `${data.failed.length} dilewati (status bukan pending).`,
        );
      } else {
        toast.success(
          `${data.updated} pendaftar ${action === "verify" ? "terverifikasi" : "ditolak"}.`,
        );
      }

      // Refresh both the pendaftar list and the dashboard stats so the
      // counts/revenue stay in sync after a bulk status change.
      await Promise.all([fetchPendaftar(), fetchStats()]);
      return { ok: true, updated: data.updated, failed: data.failed };
    } catch (err) {
      toast.error("Gagal memproses bulk action: " + (err as Error).message);
      return null;
    } finally {
      setBulkActionLoading(null);
    }
  }

  /** Bulk verify handler — guards against non-pending selections. */
  async function handleBulkVerify() {
    if (selectedKodes.size === 0) return;
    // Filter to just pending ones — warn if any selected are not eligible.
    const byKode = new Map(pendaftarList.map((p) => [p.kodeReferensi, p]));
    const eligible: string[] = [];
    let skipped = 0;
    for (const k of selectedKodes) {
      if (byKode.get(k)?.status === "pending_payment") eligible.push(k);
      else skipped += 1;
    }
    if (eligible.length === 0) {
      toast.error(
        `Tidak ada pendaftar pending untuk diverifikasi${skipped > 0 ? ` (${skipped} sudah bukan pending)` : ""}.`,
      );
      return;
    }
    if (skipped > 0) {
      toast.warning(
        `${skipped} pendaftar dilewati (status bukan pending). ${eligible.length} akan diverifikasi.`,
      );
    }
    const result = await postBulkPendaftarAction("verify", eligible);
    if (result?.ok) clearSelection();
  }

  /** Open the bulk-reject dialog (catatan input). */
  function handleBulkRejectOpen() {
    if (selectedKodes.size === 0) return;
    const byKode = new Map(pendaftarList.map((p) => [p.kodeReferensi, p]));
    let eligible = 0;
    let skipped = 0;
    for (const k of selectedKodes) {
      if (byKode.get(k)?.status === "pending_payment") eligible += 1;
      else skipped += 1;
    }
    if (eligible === 0) {
      toast.error(
        `Tidak ada pendaftar pending untuk ditolak${skipped > 0 ? ` (${skipped} sudah bukan pending)` : ""}.`,
      );
      return;
    }
    setBulkRejectCatatan("");
    setBulkRejectOpen(true);
  }

  /** Confirm bulk reject — fires the API call. */
  async function confirmBulkReject() {
    if (selectedKodes.size === 0) {
      setBulkRejectOpen(false);
      return;
    }
    const byKode = new Map(pendaftarList.map((p) => [p.kodeReferensi, p]));
    const eligible: string[] = [];
    for (const k of selectedKodes) {
      if (byKode.get(k)?.status === "pending_payment") eligible.push(k);
    }
    setBulkRejectOpen(false);
    const result = await postBulkPendaftarAction(
      "reject",
      eligible,
      bulkRejectCatatan,
    );
    if (result?.ok) clearSelection();
  }

  /* ------------------------------------------------------------------ */
  /* Fetch pendaftar detail — GET /api/admin/pendaftar/detail           */
  /* ------------------------------------------------------------------ */
  async function fetchPendaftarDetail(kode: string) {
    if (!token) return;
    setPendaftarDetailLoading(kode);
    try {
      const res = await adminFetch(
        `/api/admin/pendaftar/detail?kode=${encodeURIComponent(kode)}`,
        token,
        { method: "GET" },
      );
      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (res.status === 404) {
        toast.error("Pendaftar tidak ditemukan.");
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal memuat detail pendaftar." }));
        toast.error(data.error || "Gagal memuat detail pendaftar.");
        return;
      }
      const data = (await res.json()) as { pendaftar: PendaftarDetailData };
      setPendaftarDetail(data.pendaftar);
    } catch (err) {
      toast.error("Gagal memuat detail: " + (err as Error).message);
    } finally {
      setPendaftarDetailLoading(null);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tab 1 — Event form handlers                                        */
  /* ------------------------------------------------------------------ */
  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  }

  function startEdit(ev: AdminEventItem) {
    setEditingId(ev.id);
    setForm({
      judul: ev.judul,
      deskripsi: ev.deskripsi,
      tanggal: ev.tanggal,
      waktuMulai: ev.waktuMulai || "",
      lokasi: ev.lokasi,
      linkGmaps: ev.linkGmaps || "",
      harga: String(ev.harga),
      kuotaMax: String(ev.kuotaMax),
      status: ev.status,
      // Carry the existing cover path so ImageDropZone can render a preview.
      // On submit we only re-send fotoCover if it's a fresh data: URL.
      fotoCover: ev.fotoCover,
    });
  }

  async function handleEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    // Client-side validation (server repeats it; this is for UX)
    if (!form.judul.trim()) return toast.error("Judul wajib diisi.");
    if (!form.deskripsi.trim()) return toast.error("Deskripsi wajib diisi.");
    if (!form.tanggal) return toast.error("Tanggal wajib diisi.");
    if (!form.lokasi.trim()) return toast.error("Lokasi wajib diisi.");
    const harga = Number(form.harga);
    if (!Number.isInteger(harga) || harga <= 0) {
      return toast.error("Harga harus bilangan bulat > 0.");
    }
    const kuotaMax = Number(form.kuotaMax);
    if (!Number.isInteger(kuotaMax) || kuotaMax < 1 || kuotaMax > 1000) {
      return toast.error("Kuota harus bilangan bulat 1–1000.");
    }

    setSubmitting(true);
    try {
      // The ImageDropZone already validated + base64-encoded any new upload
      // into form.fotoCover. We forward it to the server only when it's a
      // fresh data: URL. A path string means the existing cover is unchanged
      // (the server already has it), and null means the user cleared it —
      // in either case we omit fotoCover from the body, so the server keeps
      // the existing value (clearing a cover isn't currently supported by
      // the API, matching the previous behaviour).
      const isNewUpload =
        typeof form.fotoCover === "string" && form.fotoCover.startsWith("data:");

      const body: Record<string, unknown> = {
        judul: form.judul.trim(),
        deskripsi: form.deskripsi.trim(),
        tanggal: form.tanggal,
        waktuMulai: form.waktuMulai || null,
        lokasi: form.lokasi.trim(),
        linkGmaps: form.linkGmaps.trim() || null,
        harga,
        kuotaMax,
        status: form.status,
      };
      if (editingId) body.id = editingId;
      if (isNewUpload) {
        body.fotoCover = form.fotoCover;
      }

      const res = await adminFetch("/api/admin/event", token, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Gagal menyimpan event." }));
        toast.error(data.error || "Gagal menyimpan event.");
        return;
      }

      toast.success(editingId ? "Perubahan tersimpan." : "Event baru ditambahkan.");
      resetForm();
      await fetchEvents();
    } catch (err) {
      toast.error("Gagal menyimpan event: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDeleteEvent() {
    const ev = eventToDelete;
    if (!ev || !token) return;
    try {
      const res = await adminFetch(
        `/api/admin/event?id=${encodeURIComponent(ev.id)}`,
        token,
        { method: "DELETE" },
      );
      if (res.status === 401) {
        toast.error("Sesi telah habis, silakan login ulang.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Gagal menghapus event." }));
        toast.error(data.error || "Gagal menghapus event.");
        setEventToDelete(null);
        return;
      }

      toast.success("Event berhasil dihapus.");
      resetForm();
      await fetchEvents();
    } catch (err) {
      toast.error("Gagal menghapus event: " + (err as Error).message);
    } finally {
      setEventToDelete(null);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tab 2 — History photo handlers                                     */
  /* ------------------------------------------------------------------ */
  function handleHistoryFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file later

    const accepted: File[] = [];
    for (const f of files) {
      if (f.size > MAX_PHOTO_BYTES) {
        toast.error(`"${f.name}" melebihi 2MB — dilewati.`);
        continue;
      }
      accepted.push(f);
    }

    setHistoryPhotos((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_PHOTOS) {
        toast.error(`Maksimal ${MAX_PHOTOS} foto. Foto tambahan diabaikan.`);
        return merged.slice(0, MAX_PHOTOS);
      }
      return merged;
    });
  }

  function removeHistoryPhoto(index: number) {
    setHistoryPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  // Generate preview URLs for image files; PDFs get a placeholder icon.
  // useMemo regenerates the array when historyPhotos changes; the matching
  // useEffect below revokes the previously-generated URLs after the new ones
  // are committed to the DOM (so we never revoke a URL still in use).
  const historyPreviews = React.useMemo(
    () =>
      historyPhotos.map((f) =>
        f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
      ),
    [historyPhotos],
  );

  React.useEffect(() => {
    return () => {
      historyPreviews.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
    };
  }, [historyPreviews]);

  async function handleDeletePhoto(photoUrl: string) {
    if (!token || !selectedHistoryEventId) return;
    if (!confirm("Hapus foto ini secara permanen?")) return;

    try {
      const res = await adminFetch("/api/admin/history", token, {
        method: "DELETE",
        body: JSON.stringify({
          idEvent: selectedHistoryEventId,
          photoUrl,
        }),
      });

      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Gagal menghapus foto." }));
        toast.error(data.error || "Gagal menghapus foto.");
        return;
      }

      toast.success("Foto berhasil dihapus.");
      setExistingDokFotos((prev) => prev.filter((url) => url !== photoUrl));
      await fetchEvents(); // Refresh data from server
    } catch (err) {
      toast.error("Gagal menghapus foto: " + (err as Error).message);
    }
  }

  async function handleDeleteHistory() {
    if (!token || !selectedHistoryEventId) return;
    if (!confirm("Yakin ingin menghapus SELURUH dokumentasi (recap dan semua foto) untuk event ini secara permanen?")) return;

    setHistorySubmitting(true);
    try {
      const res = await adminFetch("/api/admin/history", token, {
        method: "DELETE",
        body: JSON.stringify({
          idEvent: selectedHistoryEventId,
        }),
      });

      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Gagal menghapus dokumentasi." }));
        toast.error(data.error || "Gagal menghapus dokumentasi.");
        return;
      }

      toast.success("Seluruh dokumentasi berhasil dihapus.");
      setRecap("");
      setHistoryPhotos([]);
      setExistingDokFotos([]);
      setSelectedHistoryEventId("");
      await fetchEvents(); // Refresh data from server
    } catch (err) {
      toast.error("Gagal menghapus dokumentasi: " + (err as Error).message);
    } finally {
      setHistorySubmitting(false);
    }
  }

  async function handleHistorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!selectedHistoryEventId) return toast.error("Pilih event dulu.");
    if (!recap.trim()) return toast.error("Recap wajib diisi.");
    if (recap.length > MAX_RECAP_LEN) {
      return toast.error(`Recap maksimal ${MAX_RECAP_LEN} karakter.`);
    }
    if (historyPhotos.length + existingDokFotos.length === 0) {
      return toast.error("Pilih minimal 1 foto.");
    }

    setHistorySubmitting(true);
    try {
      const fotos = await Promise.all(historyPhotos.map(readFileAsDataUrl));
      const res = await adminFetch("/api/admin/history", token, {
        method: "POST",
        body: JSON.stringify({
          idEvent: selectedHistoryEventId,
          recap: recap.trim(),
          fotos,
        }),
      });

      if (res.status === 401) {
        toast.error("Token tidak valid.");
        handleLogout();
        return;
      }
      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gagal menyimpan dokumentasi." }));
        toast.error(data.error || "Gagal menyimpan dokumentasi.");
        return;
      }

      const data = (await res.json()) as { addedPhotos: number };
      toast.success(`Dokumentasi tersimpan. ${data.addedPhotos} foto ditambahkan.`);
      setRecap("");
      setHistoryPhotos([]);
      setSelectedHistoryEventId("");
      await fetchEvents(); // Refresh data from server
    } catch (err) {
      toast.error("Gagal menyimpan dokumentasi: " + (err as Error).message);
    } finally {
      setHistorySubmitting(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* RENDER — Layer 1: Token gate                                       */
  /* ------------------------------------------------------------------ */
  if (!token) {
    return (
      <div className="min-h-screen bg-pink-soft/30 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="shadow-lg">
            <CardHeader className="text-center items-center gap-3">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-pink-soft">
                <ShieldCheck className="size-7 text-pink-primary" />
              </div>
              <CardTitle className="font-display text-2xl">
                Panel Pengelola Saratrasaa
              </CardTitle>
              <CardDescription>
                URL rahasia terverifikasi. Sekarang masukkan token admin untuk mengelola event dan dokumentasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTokenSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="admin-token">Token admin</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="admin-token"
                      type="password"
                      placeholder="Token admin"
                      autoComplete="off"
                      value={tokenDraft}
                      onChange={(e) => setTokenDraft(e.target.value)}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isVerifyingToken} className="bg-pink-primary hover:bg-pink-primary/90">
                  {isVerifyingToken ? <Loader2 className="size-4 animate-spin" /> : "Masuk"}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  Token disimpan di cookie (1 jam). Klik "Keluar" untuk menghapus.
                </p>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* RENDER — Layer 2: Admin dashboard                                  */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-pink-soft/20">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-pink-primary" />
            <span className="font-display font-semibold">Panel Pengelola</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5 font-mono bg-background text-muted-foreground">
              <Clock className="size-3.5" />
              {timeLeft}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setLogoutDialog(true)}>
              <LogOut className="size-4" />
              Keluar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            setActiveTab(
              v as
              | "dashboard"
              | "events"
              | "pendaftar"
              | "keuangan"
              | "history"
              | "webhook"
              | "checkin"
              | "reminders"
              | "testimoni"
            )
          }
        >
          <div className="w-full mb-4">
            <TabsList className="hidden md:flex flex-wrap w-full justify-start h-auto gap-1 p-1">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="events">Kelola Event</TabsTrigger>
              <TabsTrigger value="pendaftar">Pendaftar</TabsTrigger>
              <TabsTrigger value="testimoni">Testimoni</TabsTrigger>
              <TabsTrigger value="history">Dokumentasi History</TabsTrigger>
              <TabsTrigger value="webhook">Payment History</TabsTrigger>
              <TabsTrigger value="checkin" className="gap-1.5">
                <QrCode className="size-3.5" />
                Check-in
              </TabsTrigger>
              <TabsTrigger value="keuangan" className="gap-1.5">
                <Wallet className="size-3.5" />
                Keuangan
              </TabsTrigger>
              <TabsTrigger value="reminders" className="gap-1.5">
                <Bell className="size-3.5" />
                Pengingat
              </TabsTrigger>
            </TabsList>

            {/* Mobile Nav via floating Sheet */}
            <div className="md:hidden fixed bottom-6 right-6 z-50">
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="icon" className="rounded-full shadow-2xl size-14 bg-pink-primary hover:bg-pink-primary/90 text-white border-2 border-white/20">
                    <Menu className="size-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-[2rem] max-h-[85vh] overflow-y-auto px-6 pb-8 pt-4 border-t border-border/40 shadow-2xl bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
                  <SheetHeader className="mb-6 text-left">
                    <SheetTitle className="text-xl font-display text-ink">Menu Navigasi</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col w-full h-auto bg-transparent gap-2 p-0 items-stretch">
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("dashboard")}
                        className={cn("w-full text-left py-3 px-4 text-base rounded-xl transition-all border", activeTab === "dashboard" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        Dashboard
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("events")}
                        className={cn("w-full text-left py-3 px-4 text-base rounded-xl transition-all border", activeTab === "events" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        Kelola Event
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("pendaftar")}
                        className={cn("w-full text-left py-3 px-4 text-base rounded-xl transition-all border", activeTab === "pendaftar" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        Pendaftar
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("testimoni")}
                        className={cn("w-full text-left py-3 px-4 text-base rounded-xl transition-all border", activeTab === "testimoni" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        Testimoni
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("history")}
                        className={cn("w-full text-left py-3 px-4 text-base rounded-xl transition-all border", activeTab === "history" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        Dokumentasi History
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("webhook")}
                        className={cn("w-full text-left py-3 px-4 text-base rounded-xl transition-all border", activeTab === "webhook" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        Payment History
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("checkin")}
                        className={cn("w-full flex items-center text-left py-3 px-4 text-base rounded-xl transition-all border gap-2", activeTab === "checkin" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        <QrCode className="size-4" /> Check-in
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("keuangan")}
                        className={cn("w-full flex items-center text-left py-3 px-4 text-base rounded-xl transition-all border gap-2", activeTab === "keuangan" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        <Wallet className="size-4" /> Keuangan
                      </button>
                    </SheetClose>
                    <SheetClose asChild>
                      <button
                        onClick={() => setActiveTab("reminders")}
                        className={cn("w-full flex items-center text-left py-3 px-4 text-base rounded-xl transition-all border gap-2", activeTab === "reminders" ? "bg-primary/10 text-primary border-primary/20 font-semibold" : "border-transparent hover:bg-secondary/50")}
                      >
                        <Bell className="size-4" /> Pengingat
                      </button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* ------------------------------ Dashboard ------------------------------ */}
          <TabsContent value="dashboard" className="mt-4">
            {/* Subtle gradient backdrop so the dashboard reads as its own zone. */}
            <div className="rounded-2xl bg-gradient-to-br from-pink-soft/40 via-background to-amber/5 p-4 sm:p-5 ring-1 ring-pink-soft/40">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="font-display text-xl text-ink">Dashboard</h2>
                  <p className="text-sm text-muted-foreground">
                    Ringkasan aktivitas Saratrasaa.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {lastUpdated ? (
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                      <Clock className="size-3" />
                      Update: {lastUpdated.toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDashboard}
                    disabled={
                      dashboardLoading ||
                      chartLoading ||
                      statusDistributionLoading ||
                      eventPerformanceLoading
                    }
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        (dashboardLoading ||
                          chartLoading ||
                          statusDistributionLoading ||
                          eventPerformanceLoading) &&
                        "animate-spin",
                      )}
                    />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Stat cards — 7 total. 2 cols on mobile, 3 on md, 4 on lg. */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                {dashboardLoading && !dashboardStats
                  ? [...Array(7)].map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl" />
                  ))
                  : dashboardStats
                    ? (
                      <>
                        <StatCard
                          icon={Calendar}
                          label="Event Aktif"
                          value={dashboardStats.events.active}
                          color="pink"
                        />
                        <StatCard
                          icon={Clock}
                          label="Pendaftar Pending"
                          value={dashboardStats.pendaftar.pending}
                          color="amber"
                          pulse={dashboardStats.pendaftar.pending > 0}
                        />
                        <StatCard
                          icon={CheckCircle}
                          label="Pendaftar Terverifikasi"
                          value={dashboardStats.pendaftar.verified}
                          color="green"
                        />
                        <StatCard
                          icon={Wallet}
                          label="Pendapatan"
                          value={formatIDR(dashboardStats.revenue)}
                          color="pink"
                        />
                        <StatCard
                          icon={Users}
                          label="Total Relawan"
                          value={dashboardStats.totalUniqueRelawan}
                          color="amber"
                        />
                        <StatCard
                          icon={TrendingUp}
                          label="Rata-rata / Event"
                          value={dashboardStats.avgPendaftarPerEvent}
                          color="green"
                          description="Rata-rata pendaftar dari semua event."
                        />
                        <StatCard
                          icon={Percent}
                          label="Tingkat Konversi"
                          value={`${dashboardStats.conversionRate}%`}
                          color="pink"
                          description="Persentase pendaftar yang bayar lunas."
                        />
                      </>
                    )
                    : [...Array(7)].map((_, i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
              </div>

              {/* Pendaftar-over-time chart (30 days) */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <CardTitle className="font-display text-lg flex items-center gap-2">
                        <BarChart3 className="size-4 text-pink-primary" />
                        Tren Pendaftaran (30 Hari)
                      </CardTitle>
                      <CardDescription>
                        Stacked area — pending, terverifikasi, dan ditolak per hari.
                      </CardDescription>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 rounded-sm"
                            style={{ background: "var(--pending)" }}
                          />
                          Pending
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 rounded-sm"
                            style={{ background: "var(--success)" }}
                          />
                          Terverifikasi
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 rounded-sm"
                            style={{ background: "var(--rejected)" }}
                          />
                          Ditolak
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchChartData()}
                      disabled={chartLoading}
                      className="shrink-0"
                    >
                      <RefreshCw
                        className={cn("size-4", chartLoading && "animate-spin")}
                      />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartLoading && chartSeries.length === 0 ? (
                    <Skeleton className="h-[260px] w-full rounded-lg" />
                  ) : chartAllZero ? (
                    <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                      Belum ada pendaftaran dalam 30 hari terakhir.
                    </div>
                  ) : chartMounted ? (
                    <div style={{ width: "100%", height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartSeries}
                          margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#FFD6E5"
                          />
                          <XAxis
                            dataKey="date"
                            interval={1}
                            tick={{ fontSize: 11, fill: "#1F1115" }}
                            stroke="#FFD6E5"
                            tickFormatter={(d: string) => {
                              // YYYY-MM-DD → DD/MM
                              const parts = String(d).split("-");
                              return parts.length === 3
                                ? `${parts[2]}/${parts[1]}`
                                : String(d);
                            }}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: "#1F1115" }}
                            stroke="#FFD6E5"
                          />
                          <Tooltip
                            contentStyle={{
                              background: "white",
                              border: "1px solid #F3D9DE",
                              borderRadius: "0.5rem",
                              fontSize: "12px",
                            }}
                            labelFormatter={(label: unknown) => {
                              const parts = String(label).split("-");
                              return parts.length === 3
                                ? `${parts[2]}/${parts[1]}/${parts[0]}`
                                : String(label);
                            }}
                          />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="pending"
                            name="Pending"
                            stackId="1"
                            stroke="var(--pending)"
                            fill="var(--pending)"
                            fillOpacity={0.7}
                          />
                          <Area
                            type="monotone"
                            dataKey="verified"
                            name="Terverifikasi"
                            stackId="1"
                            stroke="var(--success)"
                            fill="var(--success)"
                            fillOpacity={0.7}
                          />
                          <Area
                            type="monotone"
                            dataKey="rejected"
                            name="Ditolak"
                            stackId="1"
                            stroke="var(--rejected)"
                            fill="var(--rejected)"
                            fillOpacity={0.7}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <Skeleton className="h-[260px] w-full rounded-lg" />
                  )}
                </CardContent>
              </Card>

              {/* Status distribution donut chart */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <CardTitle className="font-display text-lg flex items-center gap-2">
                        <PieChartIcon className="size-4 text-pink-primary" />
                        Distribusi Status Pendaftar
                      </CardTitle>
                      <CardDescription>
                        Proporsi pending, terverifikasi, dan ditolak dari total pendaftar.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchStatusDistribution()}
                      disabled={statusDistributionLoading}
                      className="shrink-0"
                    >
                      <RefreshCw
                        className={cn(
                          "size-4",
                          statusDistributionLoading && "animate-spin",
                        )}
                      />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {statusDistributionLoading && statusDistribution.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <Skeleton className="h-[240px] w-full rounded-full mx-auto max-w-[240px]" />
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    </div>
                  ) : statusDistribution.length === 0 ||
                    statusDistribution.every((s) => s.value === 0) ? (
                    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                      Belum ada pendaftar untuk ditampilkan.
                    </div>
                  ) : chartMounted ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div style={{ width: "100%", height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={statusDistribution}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={90}
                              paddingAngle={2}
                              label={(entry: { value?: number }) => {
                                const total = statusDistribution.reduce(
                                  (sum, s) => sum + s.value,
                                  0,
                                );
                                if (!total) return "";
                                const pct = Math.round(
                                  ((entry.value || 0) / total) * 100,
                                );
                                return `${pct}%`;
                              }}
                              labelLine={false}
                              isAnimationActive
                            >
                              {statusDistribution.map((slice) => (
                                <Cell
                                  key={slice.name}
                                  fill={slice.color}
                                  stroke="white"
                                  strokeWidth={2}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: "white",
                                border: "1px solid #F3D9DE",
                                borderRadius: "0.5rem",
                                fontSize: "12px",
                              }}
                              formatter={(value: number, name: string) => [
                                `${value} pendaftar`,
                                name,
                              ]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Custom legend with counts + percentages */}
                      <div className="space-y-2">
                        {(() => {
                          const total = statusDistribution.reduce(
                            (sum, s) => sum + s.value,
                            0,
                          );
                          return statusDistribution.map((slice) => {
                            const pct =
                              total > 0
                                ? Math.round((slice.value / total) * 1000) / 10
                                : 0;
                            return (
                              <div
                                key={slice.name}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className="size-3 rounded-sm"
                                    style={{ background: slice.color }}
                                    aria-hidden
                                  />
                                  <span className="text-sm font-medium">
                                    {slice.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-sm">
                                  <span className="text-ink">{slice.value}</span>
                                  <span className="text-muted-foreground">
                                    ({pct}%)
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  ) : (
                    <Skeleton className="h-[240px] w-full rounded-lg" />
                  )}
                </CardContent>
              </Card>

              {/* Event Performance leaderboard */}
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <CardTitle className="font-display text-lg flex items-center gap-2">
                        <TrendingUp className="size-4 text-pink-primary" />
                        Performa Event Teratas
                      </CardTitle>
                      <CardDescription>
                        5 event dengan pendapatan tertinggi — lengkap dengan
                        tingkat pengisian kuota.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchEventPerformance()}
                      disabled={eventPerformanceLoading}
                      className="shrink-0"
                    >
                      <RefreshCw
                        className={cn(
                          "size-4",
                          eventPerformanceLoading && "animate-spin",
                        )}
                      />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {eventPerformanceLoading && eventPerformance.length === 0 ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : eventPerformance.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      Belum ada event dengan pendaftar.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[28rem] overflow-y-auto scroll-soft pr-1">
                      {eventPerformance.map((ev, idx) => {
                        // Color the fill rate bar: green ≥80%, amber 40–79%, pink <40%.
                        const barColor =
                          ev.fillRate >= 80
                            ? "bg-success"
                            : ev.fillRate >= 40
                              ? "bg-amber"
                              : "bg-pink-primary";
                        return (
                          <motion.div
                            key={ev.id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              duration: 0.25,
                              delay: idx * 0.04,
                              ease: "easeOut",
                            }}
                            className="rounded-lg border border-border bg-card/60 p-3 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="size-5 rounded-full bg-pink-soft text-pink-primary text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  <h4 className="font-medium truncate">
                                    {ev.judul}
                                  </h4>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="size-3" />
                                    {formatTanggal(ev.tanggal)}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="size-3" />
                                    {ev.verifiedCount} / {ev.totalPendaftar} verified
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono text-sm font-bold text-ink">
                                  {formatIDR(ev.revenue)}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Pendapatan
                                </div>
                              </div>
                            </div>
                            {/* Quota fill bar */}
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                                <span className="font-mono">
                                  {ev.terpakai} / {ev.kuotaMax} kuota
                                </span>
                                <span className="font-mono font-semibold">
                                  {ev.fillRate}%
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${ev.fillRate}%` }}
                                  transition={{
                                    duration: 0.6,
                                    delay: 0.1 + idx * 0.04,
                                    ease: "easeOut",
                                  }}
                                  className={cn(
                                    "h-full rounded-full",
                                    barColor,
                                  )}
                                />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent pendaftar */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="size-4 text-pink-primary" />
                    Pendaftar Terbaru
                  </CardTitle>
                  <CardDescription>
                    10 pendaftar terakhir di semua event.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dashboardLoading && !dashboardStats ? (
                    <div className="space-y-2">
                      {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : dashboardStats && dashboardStats.recent.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto scroll-soft">
                      <Table className="text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kode</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead className="text-right">Jumlah</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Tanggal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dashboardStats.recent.map((p) => (
                            <TableRow key={p.kodeReferensi}>
                              <TableCell className="font-mono text-pink-primary">
                                {p.kodeReferensi}
                              </TableCell>
                              <TableCell className="font-medium max-w-[180px] truncate">
                                {p.nama}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-muted-foreground">
                                {p.event.judul}
                              </TableCell>
                              <TableCell className="font-data text-right">
                                {p.jumlahOrang}
                              </TableCell>
                              <TableCell className="font-data text-right">
                                {formatIDR(p.totalBayar)}
                              </TableCell>
                              <TableCell>
                                <PendaftarStatusBadge status={p.status} />
                              </TableCell>
                              <TableCell className="font-data text-muted-foreground">
                                {formatTanggal(p.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      Belum ada pendaftar.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ------------------------------ Testimoni ------------------------------ */}
          <TabsContent value="testimoni" className="mt-4">
            <AdminTestimoni token={token!} />
          </TabsContent>

          {/* ------------------------------ Laporan Keuangan ------------------------------ */}
          <TabsContent value="keuangan" className="mt-4">
            <AdminKeuangan token={token} events={events} />
          </TabsContent>

          {/* ------------------------------ Kelola Event ------------------------------ */}
          <TabsContent value="events" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Event list */}
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calendar className="size-4 text-pink-primary" />
                          Daftar Event
                        </CardTitle>
                        <CardDescription>
                          Klik "Detail" untuk lihat analytics, "Edit" untuk mengisi form di kanan.
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchEvents()}
                        disabled={eventsLoading}
                        className="shrink-0"
                      >
                        <RefreshCw className={cn("size-4", eventsLoading && "animate-spin")} />
                        Refresh
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {eventsLoading && events.length === 0 ? (
                      <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : events.length === 0 ? (
                      <div className="text-center py-10 text-sm text-muted-foreground">
                        Belum ada event. Tambahkan event pertama di form kanan.
                      </div>
                    ) : (
                      <div className="overflow-x-auto w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Judul</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>
                                <span className="inline-flex items-center gap-1">
                                  <Users className="size-3.5" /> Kuota
                                </span>
                              </TableHead>
                              <TableHead>Tanggal</TableHead>
                              <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {events.map((ev, i) => (
                              <TableRow key={ev.id}>
                                <TableCell className="font-medium max-w-[220px] truncate">
                                  {ev.judul}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={ev.status} />
                                </TableCell>
                                <TableCell className="font-data">{ev.kuotaMax}</TableCell>
                                <TableCell className="font-data">{ev.tanggal}</TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="size-8"
                                      onClick={() => moveEvent(i, "up")}
                                      disabled={i === 0}
                                      title="Pindah Ke Atas"
                                    >
                                      <ArrowUp className="size-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="size-8"
                                      onClick={() => moveEvent(i, "down")}
                                      disabled={i === events.length - 1}
                                      title="Pindah Ke Bawah"
                                    >
                                      <ArrowDown className="size-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setDetailEventId(ev.id)}
                                      title="Detail analytics event ini"
                                      aria-label={`Detail analytics ${ev.judul}`}
                                    >
                                      <BarChart3 className="size-3.5" />
                                      <span className="hidden sm:inline">Detail</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => startEdit(ev)}
                                    >
                                      <Pencil className="size-3.5" />
                                      <span className="hidden sm:inline">Edit</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:bg-destructive/10"
                                      onClick={() => setEventToDelete(ev)}
                                    >
                                      <Trash2 className="size-3.5" />
                                      <span className="hidden sm:inline">Hapus</span>
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Event form */}
              <div className="lg:col-span-2">
                <Card className="lg:sticky lg:top-20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {editingId ? (
                        <>
                          <Pencil className="size-4 text-pink-primary" />
                          Edit Event
                        </>
                      ) : (
                        <>
                          <Plus className="size-4 text-pink-primary" />
                          Tambah Event
                        </>
                      )}
                    </CardTitle>
                    {editingId && (
                      <CardDescription>
                        Sedang mengedit event. Klik &quot;Batal&quot; untuk membuat event baru.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleEventSubmit} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="f-judul">Judul *</Label>
                        <Input
                          id="f-judul"
                          value={form.judul}
                          onChange={(e) => setForm({ ...form, judul: e.target.value })}
                          placeholder="Nama event"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="f-deskripsi">Deskripsi *</Label>
                        <Textarea
                          id="f-deskripsi"
                          value={form.deskripsi}
                          onChange={(e) =>
                            setForm({ ...form, deskripsi: e.target.value })
                          }
                          placeholder="Deskripsi singkat event"
                          required
                          rows={3}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1.5 col-span-2">
                          <Label htmlFor="f-tanggal">Tanggal *</Label>
                          <Input
                            id="f-tanggal"
                            type="date"
                            value={form.tanggal}
                            onChange={(e) =>
                              setForm({ ...form, tanggal: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="f-waktu">Waktu Mulai</Label>
                          <Input
                            id="f-waktu"
                            type="time"
                            value={form.waktuMulai}
                            onChange={(e) =>
                              setForm({ ...form, waktuMulai: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="f-lokasi" className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-muted-foreground" />
                          Lokasi *
                        </Label>
                        <Input
                          id="f-lokasi"
                          value={form.lokasi}
                          onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
                          placeholder="Lokasi event"
                          required
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="f-status">Status *</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) =>
                            setForm({ ...form, status: v as AdminEventItem["status"] })
                          }
                        >
                          <SelectTrigger id="f-status" className="w-full">
                            <SelectValue placeholder="Pilih status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="upcoming">Upcoming</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="f-harga">Harga (Rp) *</Label>
                          <Input
                            id="f-harga"
                            type="number"
                            min={0}
                            step={1}
                            value={form.harga}
                            onChange={(e) => setForm({ ...form, harga: e.target.value })}
                            placeholder="50000"
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="f-kuota">Kuota Max *</Label>
                          <Input
                            id="f-kuota"
                            type="number"
                            min={1}
                            max={1000}
                            step={1}
                            value={form.kuotaMax}
                            onChange={(e) =>
                              setForm({ ...form, kuotaMax: e.target.value })
                            }
                            placeholder="50"
                            required
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <ImageDropZone
                          value={form.fotoCover}
                          onChange={(v) =>
                            setForm({ ...form, fotoCover: v })
                          }
                          accept="image/jpeg,image/png,application/pdf"
                          maxSizeBytes={MAX_PHOTO_BYTES}
                          label="Foto Cover Event (opsional)"
                          aspect="aspect-video"
                        />
                        <p className="text-xs text-muted-foreground">
                          JPG/PNG/PDF, maks 2MB.
                          {editingId &&
                            " Kosongkan jika tidak ingin mengganti cover."}
                        </p>
                      </div>

                      <Separator />

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={submitting}
                          className="bg-pink-primary hover:bg-pink-primary/90 flex-1"
                        >
                          {submitting
                            ? "Menyimpan..."
                            : editingId
                              ? "Simpan Perubahan"
                              : "Tambah Event"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={resetForm}
                          title="Bersihkan form"
                        >
                          <Trash2 className="size-4" />
                          {editingId ? "Batal" : "Bersihkan"}
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Jika status diset <span className="font-medium">active</span>,
                        event aktif lainnya otomatis diubah jadi{" "}
                        <span className="font-medium">upcoming</span>.
                      </p>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>

            <AlertDialog open={!!eventToDelete} onOpenChange={(open) => !open && setEventToDelete(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus Event?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Yakin ingin menghapus event &quot;{eventToDelete?.judul}&quot;? Semua data pendaftar, peserta, dan check-in terkait event ini akan ikut terhapus. Tindakan ini TIDAK bisa dibatalkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDeleteEvent} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ------------------------------ Pendaftar ------------------------------ */}
          <TabsContent value="pendaftar" className="mt-4">
            {/* Filter bar */}
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-end gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="p-event">Filter Event</Label>
                        <Select
                          value={pendaftarFilters.idEvent || "all"}
                          onValueChange={(v) =>
                            setPendaftarFilters((prev) => ({
                              ...prev,
                              idEvent: v === "all" ? "" : v,
                            }))
                          }
                        >
                          <SelectTrigger id="p-event" className="w-full">
                            <SelectValue placeholder="Semua Event" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Event</SelectItem>
                            {events.map((ev) => (
                              <SelectItem key={ev.id} value={ev.id}>
                                {ev.judul}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="p-status">Filter Status</Label>
                        <Select
                          value={pendaftarFilters.status || "all"}
                          onValueChange={(v) =>
                            setPendaftarFilters((prev) => ({
                              ...prev,
                              status: v === "all" ? "" : v,
                            }))
                          }
                        >
                          <SelectTrigger id="p-status" className="w-full">
                            <SelectValue placeholder="Semua Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Status</SelectItem>
                            <SelectItem value="pending_payment">Pending</SelectItem>
                            <SelectItem value="verified">Verified</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex md:justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchPendaftar()}
                        disabled={pendaftarLoading}
                        className="shrink-0"
                      >
                        <RefreshCw className={cn("size-4", pendaftarLoading && "animate-spin")} />
                        Refresh
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleExportCsv()}
                        disabled={csvExporting}
                        className="shrink-0"
                      >
                        {csvExporting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                        Export CSV
                      </Button>
                    </div>
                  </div>
                  {/* Free-text client-side search across nama / kode / kontak */}
                  <div className="relative">
                    <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      value={pendaftarSearch}
                      onChange={(e) => setPendaftarSearch(e.target.value)}
                      placeholder="Cari nama / kode / kontak…"
                      className="pl-9"
                      aria-label="Cari pendaftar"
                    />
                    {pendaftarSearch && (
                      <button
                        type="button"
                        onClick={() => setPendaftarSearch("")}
                        aria-label="Bersihkan pencarian"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink cursor-pointer"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pendaftar table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="size-4 text-pink-primary" />
                  Daftar Pendaftar
                </CardTitle>
                <CardDescription>
                  Verifikasi atau tolak pendaftar pending secara manual.
                  Pilih beberapa baris untuk aksi bulk.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendaftarLoading && pendaftarList.length === 0 ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : pendaftarList.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    Belum ada pendaftar dengan filter ini.
                  </div>
                ) : (
                  <>
                    {/* Bulk action toolbar — sticky at the top of the table area.
                      Only rendered when at least one row is selected. */}
                    {selectedKodes.size > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b p-3 rounded-t-lg flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                      >
                        <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                          <span className="inline-flex items-center justify-center size-7 rounded-full bg-pink-primary/10 text-pink-primary font-data font-semibold shrink-0">
                            {selectedKodes.size}
                          </span>
                          <span className="truncate">
                            pendaftar dipilih
                            {selectedPendingCount < selectedKodes.size && (
                              <span className="block text-xs text-muted-foreground">
                                {selectedPendingCount} pending, {" "}
                                {selectedKodes.size - selectedPendingCount} sudah bukan pending
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkActionLoading !== null || selectedPendingCount === 0}
                            onClick={() => void handleBulkVerify()}
                            className="text-success border-success/40 hover:bg-success/10"
                          >
                            {bulkActionLoading === "verify" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Check className="size-3.5" />
                            )}
                            Verifikasi Semua
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkActionLoading !== null || selectedPendingCount === 0}
                            onClick={handleBulkRejectOpen}
                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          >
                            {bulkActionLoading === "reject" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <X className="size-3.5" />
                            )}
                            Tolak Semua
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={bulkActionLoading !== null}
                            onClick={() => setNotifyKodes(Array.from(selectedKodes))}
                            className="text-pink-primary border-pink-primary/40 hover:bg-pink-primary/10"
                          >
                            <MessageCircle className="size-3.5" />
                            Buat Pesan ({selectedKodes.size})
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={bulkActionLoading !== null}
                            onClick={clearSelection}
                          >
                            Batal
                          </Button>
                        </div>
                      </motion.div>
                    )}
                    <div className="overflow-x-auto">
                      <Table className="text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[44px] pr-0">
                              <Checkbox
                                aria-label={
                                  allVisibleSelected
                                    ? "Batal pilih semua"
                                    : "Pilih semua pendaftar"
                                }
                                checked={
                                  allVisibleSelected
                                    ? true
                                    : someVisibleSelected
                                      ? "indeterminate"
                                      : false
                                }
                                onCheckedChange={toggleAllVisible}
                                disabled={paginatedPendaftar.length === 0}
                              />
                            </TableHead>
                            <TableHead>Kode</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Kontak</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead className="text-right">Jumlah</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedPendaftar.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={10}
                                className="text-center text-muted-foreground py-8"
                              >
                                Tidak ada pendaftar yang cocok dengan pencarian di halaman ini.
                              </TableCell>
                            </TableRow>
                          ) : null}
                          {paginatedPendaftar.map((p) => {
                            const isLoading =
                              pendaftarActionLoading === p.kodeReferensi;
                            const isSelected = selectedKodes.has(p.kodeReferensi);
                            return (
                              <TableRow
                                key={p.kodeReferensi}
                                className={cn(
                                  "transition-colors",
                                  isSelected && "bg-secondary/30",
                                )}
                              >
                                <TableCell className="pr-0">
                                  <Checkbox
                                    aria-label={`Pilih ${p.kodeReferensi}`}
                                    checked={isSelected}
                                    onCheckedChange={() => toggleKode(p.kodeReferensi)}
                                    disabled={bulkActionLoading !== null}
                                  />
                                </TableCell>
                                <TableCell className="font-mono">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void fetchPendaftarDetail(p.kodeReferensi)
                                    }
                                    title="Lihat detail pendaftar"
                                    className="text-pink-primary font-mono cursor-pointer hover:underline text-left"
                                  >
                                    {p.kodeReferensi}
                                  </button>
                                </TableCell>
                                <TableCell className="font-medium max-w-[160px] truncate">
                                  {p.nama}
                                </TableCell>
                                <TableCell className="font-data text-muted-foreground">
                                  {p.kontak}
                                </TableCell>
                                <TableCell className="max-w-[160px] truncate text-muted-foreground">
                                  {p.event.judul}
                                </TableCell>
                                <TableCell className="font-data text-right">
                                  {p.jumlahOrang}
                                </TableCell>
                                <TableCell className="font-data text-right">
                                  {formatIDR(p.totalBayar)}
                                </TableCell>
                                <TableCell>
                                  <PendaftarStatusBadge status={p.status} />
                                </TableCell>
                                <TableCell className="text-right">
                                  {p.status === "pending_payment" ? (
                                    <div className="flex justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isLoading || bulkActionLoading !== null}
                                        onClick={() =>
                                          setVerifyDialog({ kodeReferensi: p.kodeReferensi })
                                        }
                                        className="text-success border-success/40 hover:bg-success/10"
                                      >
                                        {isLoading ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Check className="size-3.5" />
                                        )}
                                        Verifikasi
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={isLoading || bulkActionLoading !== null}
                                        onClick={() => {
                                          setRejectCatatan("");
                                          setRejectDialog({
                                            kodeReferensi: p.kodeReferensi,
                                            nama: p.nama,
                                          });
                                        }}
                                        className="text-destructive border-destructive/40 hover:bg-destructive/10"
                                      >
                                        <X className="size-3.5" />
                                        Tolak
                                      </Button>
                                    </div>
                                  ) : p.status === "verified" ? (
                                    <div className="flex justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        title="Buat pesan notifikasi WhatsApp"
                                        aria-label={`Buat pesan notifikasi untuk ${p.kodeReferensi}`}
                                        onClick={() =>
                                          setNotifyKodes([p.kodeReferensi])
                                        }
                                        className="border-pink-primary/40 text-pink-primary hover:bg-pink-primary/10"
                                      >
                                        <MessageCircle className="size-3.5" />
                                        Buat Pesan
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Menampilkan {paginatedPendaftar.length} dari{" "}
                        {filteredPendaftar.length} hasil (Total {pendaftarList.length} pendaftar)
                      </span>
                      {selectedKodes.size > 0 && (
                        <span className="text-pink-primary">
                          {selectedKodes.size} dipilih
                        </span>
                      )}
                    </div>
                    {totalPendaftarPages > 1 && (
                      <div className="flex items-center justify-end gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          onClick={() => setPendaftarPage((p) => Math.max(1, p - 1))}
                          disabled={pendaftarPage === 1}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground px-2">
                          Halaman {pendaftarPage} dari {totalPendaftarPages}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          onClick={() => setPendaftarPage((p) => Math.min(totalPendaftarPages, p + 1))}
                          disabled={pendaftarPage === totalPendaftarPages}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Bulk reject confirmation dialog */}
            <AlertDialog
              open={bulkRejectOpen}
              onOpenChange={(o) => {
                if (!o) {
                  setBulkRejectOpen(false);
                  setBulkRejectCatatan("");
                }
              }}
            >
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Tolak {selectedPendingCount} pendaftar terpilih?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Tindakan ini akan menolak{" "}
                    <span className="font-medium text-foreground">
                      {selectedPendingCount} pendaftar
                    </span>{" "}
                    berstatus pending secara bersamaan. Pendaftar yang sudah
                    bukan pending akan dilewati. Tindakan tidak bisa dibatalkan.
                    {selectedPendingCount < selectedKodes.size && (
                      <span className="block mt-2 text-xs">
                        {selectedKodes.size - selectedPendingCount} pendaftar
                        terpilih akan dilewati (status sudah bukan pending).
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="px-6 pb-2">
                  <Label
                    htmlFor="bulk-reject-catatan"
                    className="text-sm font-medium text-foreground"
                  >
                    Alasan penolakan (opsional, berlaku untuk semua pendaftar
                    terpilih, akan terlihat saat peserta cek status)
                  </Label>
                  <Textarea
                    id="bulk-reject-catatan"
                    value={bulkRejectCatatan}
                    onChange={(e) =>
                      setBulkRejectCatatan(e.target.value.slice(0, MAX_REJECT_CATATAN))
                    }
                    placeholder="Contoh: Bukti transfer tidak jelas. Silakan daftar ulang dengan bukti yang valid."
                    rows={3}
                    maxLength={MAX_REJECT_CATATAN}
                    className="mt-1.5 resize-none"
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-muted-foreground font-data">
                      {bulkRejectCatatan.length}/{MAX_REJECT_CATATAN}
                    </span>
                  </div>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={bulkActionLoading !== null}>
                    Batal
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    disabled={bulkActionLoading !== null}
                    onClick={(e) => {
                      // Prevent the dialog from auto-closing before the API
                      // call completes — we close it ourselves in
                      // confirmBulkReject() once the request returns.
                      e.preventDefault();
                      void confirmBulkReject();
                    }}
                  >
                    {bulkActionLoading === "reject" ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                        Menolak…
                      </>
                    ) : (
                      `Ya, Tolak ${selectedPendingCount} Pendaftar`
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Reject confirmation dialog */}
            <AlertDialog
              open={rejectDialog !== null}
              onOpenChange={(o) => {
                if (!o) {
                  setRejectDialog(null);
                  setRejectCatatan("");
                }
              }}
            >
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Tolak pendaftaran ini?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Yakin tolak pendaftaran ini? Tindakan tidak bisa dibatalkan.
                    {rejectDialog && (
                      <span className="block mt-2 text-xs">
                        {rejectDialog.nama} —{" "}
                        <span className="font-mono">
                          {rejectDialog.kodeReferensi}
                        </span>
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="px-6 pb-2">
                  <Label
                    htmlFor="reject-catatan"
                    className="text-sm font-medium text-foreground"
                  >
                    Alasan penolakan (opsional, akan terlihat saat peserta cek status)
                  </Label>
                  <Textarea
                    id="reject-catatan"
                    value={rejectCatatan}
                    onChange={(e) =>
                      setRejectCatatan(e.target.value.slice(0, MAX_REJECT_CATATAN))
                    }
                    placeholder="Contoh: Bukti transfer tidak jelas. Silakan daftar ulang dengan bukti yang valid."
                    rows={3}
                    maxLength={MAX_REJECT_CATATAN}
                    className="mt-1.5 resize-none"
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-muted-foreground font-data">
                      {rejectCatatan.length}/{MAX_REJECT_CATATAN}
                    </span>
                  </div>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={async () => {
                      if (rejectDialog) {
                        const kode = rejectDialog.kodeReferensi;
                        await handleReject(kode, rejectCatatan);
                        // If the pendaftar detail modal is open for the same
                        // kode, refresh it so the status badge / action
                        // buttons update after the rejection.
                        if (pendaftarDetail?.kodeReferensi === kode) {
                          await fetchPendaftarDetail(kode);
                        }
                      }
                    }}
                  >
                    Ya, Tolak
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Verifikasi Individual Confirm Dialog */}
            <AlertDialog
              open={verifyDialog !== null}
              onOpenChange={(isOpen) => {
                if (!isOpen) {
                  setVerifyDialog(null);
                }
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Verifikasi Pembayaran</AlertDialogTitle>
                  <AlertDialogDescription>
                    Yakin ingin memverifikasi pembayaran untuk pendaftar{" "}
                    <span className="font-mono text-pink-primary font-bold">
                      {verifyDialog?.kodeReferensi}
                    </span>
                    ? Statusnya akan berubah menjadi Verified.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-success text-white hover:bg-success/90"
                    onClick={async () => {
                      if (verifyDialog) {
                        const kode = verifyDialog.kodeReferensi;
                        await handleVerify(kode);
                        if (pendaftarDetail?.kodeReferensi === kode) {
                          await fetchPendaftarDetail(kode);
                        }
                      }
                    }}
                  >
                    Ya, Verifikasi
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Logout Confirm Dialog */}
            <AlertDialog open={logoutDialog} onOpenChange={setLogoutDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Keluar dari Panel Admin?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sesi Anda akan diakhiri dan token akses akan dihapus. Anda harus memasukkan password kembali untuk mengakses panel ini.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => {
                      setLogoutDialog(false);
                      handleLogout();
                    }}
                  >
                    Ya, Keluar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* ------------------------------ Dokumentasi History ------------------------------ */}
          <TabsContent value="history" className="mt-4">
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
              {/* Cetak Recap — print-friendly recap for closed events (Task 8-D) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Printer className="size-4 text-pink-primary" />
                    Cetak Recap
                  </CardTitle>
                  <CardDescription>
                    Buka recap siap-cetak untuk event <span className="font-medium">closed</span> —
                    termasuk statistik, foto, dan daftar pendaftar. Klik
                    "Cetak / Simpan PDF" di dalam modal untuk mencetak atau
                    menyimpan sebagai PDF.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {closedEvents.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Belum ada event berstatus{" "}
                      <span className="font-medium">closed</span>. Ubah status
                      event ke <span className="font-medium">closed</span> di
                      tab Kelola Event dulu.
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto scroll-soft pr-1">
                      {closedEvents.map((ev) => (
                        <li
                          key={ev.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card hover:bg-pink-soft/20 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm text-ink truncate">
                              {ev.judul}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="size-3" />
                                {formatTanggal(ev.tanggal)}
                              </span>
                              <span className="inline-flex items-center gap-1 truncate">
                                <MapPin className="size-3 shrink-0" />
                                <span className="truncate">{ev.lokasi}</span>
                              </span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRecapEventId(ev.id)}
                            className="shrink-0"
                          >
                            <Printer className="size-4" />
                            Cetak Recap
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Kelola Dokumentasi — recap text + photo upload/delete */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="size-4 text-pink-primary" />
                    Kelola Dokumentasi
                  </CardTitle>
                  <CardDescription>
                    Pilih event berstatus <span className="font-medium">closed</span>,
                    lalu unggah recap dan foto dokumentasi. Anda juga dapat menghapus foto lama atau mereset dokumentasi.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {closedEvents.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      Belum ada event berstatus <span className="font-medium">closed</span>.
                      Ubah status event ke <span className="font-medium">closed</span> di
                      tab Kelola Event dulu.
                    </div>
                  ) : (
                    <form onSubmit={handleHistorySubmit} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="h-event">Event</Label>
                        <Select
                          value={selectedHistoryEventId}
                          onValueChange={setSelectedHistoryEventId}
                        >
                          <SelectTrigger id="h-event" className="w-full">
                            <SelectValue placeholder="Pilih event closed" />
                          </SelectTrigger>
                          <SelectContent>
                            {closedEvents.map((ev) => (
                              <SelectItem key={ev.id} value={ev.id}>
                                {ev.judul} — {ev.tanggal}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="h-recap">Recap *</Label>
                          <span className="text-xs text-muted-foreground font-data">
                            {recap.length}/{MAX_RECAP_LEN}
                          </span>
                        </div>
                        <Textarea
                          id="h-recap"
                          value={recap}
                          onChange={(e) => setRecap(e.target.value.slice(0, MAX_RECAP_LEN))}
                          placeholder="Ringkasan kegiatan, jumlah peserta, momen berkesan, dll."
                          rows={5}
                          required
                          maxLength={MAX_RECAP_LEN}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="h-fotos">Foto Baru (Maks total 10 dengan foto lama)</Label>
                        </div>
                        <Input
                          id="h-fotos"
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          multiple
                          onChange={handleHistoryFileChange}
                        />
                        <p className="text-xs text-muted-foreground">
                          JPG/PNG/PDF, maks 2MB per file.
                        </p>

                        {/* Existing Photos Grid */}
                        {existingDokFotos.length > 0 && (
                          <div className="mt-4">
                            <Label className="text-sm font-semibold mb-2 block">Foto Lama Terunggah ({existingDokFotos.length})</Label>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {existingDokFotos.map((url, i) => (
                                <div
                                  key={url}
                                  className="relative aspect-square rounded-md border overflow-hidden bg-muted group"
                                >
                                  <img
                                    src={url}
                                    alt={`Foto Lama ${i + 1}`}
                                    className="size-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePhoto(url)}
                                    className="absolute top-1 right-1 size-7 rounded-full bg-red-600/80 text-white flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    aria-label={`Hapus foto lama ${i + 1}`}
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* New Photos Preview Grid */}

                        {historyPhotos.length > 0 && (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                            {historyPhotos.map((f, i) => (
                              <div
                                key={`${f.name}-${i}-${f.size}`}
                                className="relative aspect-square rounded-md border overflow-hidden bg-muted"
                              >
                                {historyPreviews[i] ? (
                                  <img
                                    src={historyPreviews[i]}
                                    alt={f.name}
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <div className="size-full flex flex-col items-center justify-center p-1 text-center">
                                    <ImageIcon className="size-6 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground mt-1">
                                      PDF
                                    </span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeHistoryPhoto(i)}
                                  className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                                  aria-label={`Hapus foto ${i + 1}`}
                                >
                                  <X className="size-3" />
                                </button>
                                <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                                  {f.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      <div className="flex flex-col sm:flex-row gap-3">
                        {existingDokFotos.length > 0 && (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDeleteHistory}
                            disabled={historySubmitting}
                            className="w-full sm:w-auto shrink-0"
                          >
                            <Trash2 className="size-4" />
                            Hapus Semua Dokumentasi
                          </Button>
                        )}
                        <Button
                          type="submit"
                          disabled={historySubmitting}
                          className="bg-pink-primary hover:bg-pink-primary/90 w-full"
                        >
                          {historySubmitting ? (
                            "Menyimpan..."
                          ) : (
                            <>
                              <Upload className="size-4" />
                              Simpan / Unggah Tambahan
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ------------------------------ Webhook Logs ------------------------------ */}
          <TabsContent value="webhook" className="mt-4">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="font-display text-xl text-ink">Payment History</h2>
                <p className="text-sm text-muted-foreground">
                  Riwayat webhook dan log verifikasi pembayaran otomatis.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchWebhookLogs()}
                disabled={webhookLogsLoading}
              >
                <RefreshCw
                  className={cn("size-4", webhookLogsLoading && "animate-spin")}
                />
                Refresh
              </Button>
            </div>

            {/* Explainer */}
            <Card className="mb-4 border-amber/30 bg-amber/5">
              <CardContent className="pt-6 flex items-start gap-3">
                <Info className="size-5 text-amber shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Log ini mencatat semua webhook yang diterima.
                  Berguna untuk debug kalau verifikasi pembayaran gagal atau tertunda.
                </p>
              </CardContent>
            </Card>

            {/* Filters — reason + date range (client-side) */}
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wh-reason">Filter Alasan</Label>
                    <Select
                      value={whFilterReason || "all"}
                      onValueChange={(v) =>
                        setWhFilterReason(v === "all" ? "" : v)
                      }
                    >
                      <SelectTrigger id="wh-reason" className="w-full">
                        <SelectValue placeholder="Semua Alasan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Alasan</SelectItem>
                        <SelectItem value="verified">Terverifikasi</SelectItem>
                        <SelectItem value="no_match">Tidak Ada Cocok</SelectItem>
                        <SelectItem value="bad_signature">
                          Signature Salah
                        </SelectItem>
                        <SelectItem value="ip_denied">IP Diblokir</SelectItem>
                        <SelectItem value="bad_json">JSON Invalid</SelectItem>
                        <SelectItem value="bad_amount">Nominal Invalid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wh-days">Rentang Tanggal</Label>
                    <Select value={whFilterDays} onValueChange={setWhFilterDays}>
                      <SelectTrigger id="wh-days" className="w-full">
                        <SelectValue placeholder="Pilih rentang" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 Hari</SelectItem>
                        <SelectItem value="30">30 Hari</SelectItem>
                        <SelectItem value="90">90 Hari</SelectItem>
                        <SelectItem value="all">Semua</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-3">
                  Menampilkan {filteredWebhookLogs.length} dari{" "}
                  {webhookLogs.length} log
                </div>
              </CardContent>
            </Card>

            {/* Webhook logs table */}
            <Card>
              <CardContent className="pt-6">
                {webhookLogsLoading && webhookLogs.length === 0 ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : webhookLogs.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    Belum ada log webhook.
                  </div>
                ) : filteredWebhookLogs.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    Tidak ada log yang cocok dengan filter.
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-auto">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Waktu</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Trx ID</TableHead>
                          <TableHead className="text-right">Nominal</TableHead>
                          <TableHead>Tanda Tangan</TableHead>
                          <TableHead>IP Allowlist</TableHead>
                          <TableHead>Kode Cocok</TableHead>
                          <TableHead>Alasan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWebhookLogs.map((log) => (
                          <TableRow
                            key={log.id}
                            onClick={() => setWebhookDetail(log)}
                            className="cursor-pointer hover:bg-muted/50"
                          >
                            <TableCell className="font-data text-muted-foreground whitespace-nowrap">
                              {formatWaktuWebhook(log.receivedAt)}
                            </TableCell>
                            <TableCell className="font-data text-muted-foreground">
                              {log.ip || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {extractTrxId(log.rawPayload)}
                            </TableCell>
                            <TableCell className="font-data text-right">
                              {log.amount != null
                                ? formatIDR(log.amount)
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {log.signatureOk ? (
                                <Badge className="border-transparent bg-success text-white hover:bg-success">
                                  Valid
                                </Badge>
                              ) : (
                                <Badge className="border-transparent bg-destructive text-white hover:bg-destructive">
                                  Invalid
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.ipOk ? (
                                <Badge className="border-transparent bg-success text-white hover:bg-success">
                                  Allowed
                                </Badge>
                              ) : (
                                <Badge className="border-transparent bg-destructive text-white hover:bg-destructive">
                                  Blocked
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {log.matchedKode ? (
                                <span className="font-mono text-pink-primary">
                                  {log.matchedKode}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <WebhookReasonBadge reason={log.reason} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ Check-in (Task 10-A) ------------------------------ */}
          <TabsContent value="checkin" className="mt-4">
            <div className="rounded-2xl bg-gradient-to-br from-pink-soft/40 via-background to-amber/5 p-4 sm:p-5 ring-1 ring-pink-soft/40">
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display text-xl text-ink flex items-center gap-2">
                    <QrCode className="size-5 text-pink-primary" />
                    Check-in Event
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Scan QR tiket relawan untuk verifikasi kehadiran di lokasi event.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void fetchCheckInRecent();
                      void fetchCheckInStats();
                    }}
                    disabled={
                      checkInRecentLoading || checkInStatsLoading
                    }
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        (checkInRecentLoading || checkInStatsLoading) &&
                        "animate-spin",
                      )}
                    />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setCheckInDialogOpen(true)}
                    className="bg-pink-primary hover:bg-pink-primary/90"
                  >
                    <QrCode className="size-4" />
                    Mulai Check-in
                  </Button>
                </div>
              </div>

              {/* Stats grid — 2 summary tiles + per-event breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {/* Summary tiles */}
                <Card className="lg:col-span-1">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-pink-primary/15">
                          <CalendarDays className="size-4 text-pink-primary" />
                        </span>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Check-in Hari Ini
                          </p>
                          <p className="font-data text-2xl font-semibold text-ink">
                            {checkInStatsLoading && !checkInStats ? (
                              <Skeleton className="h-7 w-12 inline-block" />
                            ) : (
                              checkInStats?.totalToday ?? 0
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-amber/15">
                          <Users className="size-4 text-amber" />
                        </span>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Total Check-in
                          </p>
                          <p className="font-data text-2xl font-semibold text-ink">
                            {checkInStatsLoading && !checkInStats ? (
                              <Skeleton className="h-7 w-12 inline-block" />
                            ) : (
                              checkInStats?.totalCheckedIn ?? 0
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Per-event breakdown */}
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="size-4 text-pink-primary" />
                      Check-in per Event
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {checkInStatsLoading && !checkInStats ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-9 w-full" />
                        ))}
                      </div>
                    ) : checkInStats && checkInStats.byEvent.length > 0 ? (
                      <div className="max-h-60 overflow-y-auto scroll-soft -mx-1">
                        <ul className="divide-y divide-border">
                          {checkInStats.byEvent.map((ev) => (
                            <li
                              key={ev.idEvent}
                              className="flex items-center justify-between gap-2 px-1 py-2 text-sm"
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
                      </div>
                    ) : (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        Belum ada check-in tercatat di event mana pun.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent check-ins table */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <History className="size-4 text-pink-primary" />
                      Check-in Terkini
                      {checkInRecent.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1.5"
                        >
                          {checkInRecent.length}
                        </Badge>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {checkInRecentLoading && checkInRecent.length === 0 ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : checkInRecent.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <History className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                      Belum ada check-in tercatat.
                      <br />
                      Klik &quot;Mulai Check-in&quot; untuk membuka scanner.
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto scroll-soft">
                      <Table className="text-sm">
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Waktu</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Kode</TableHead>
                            <TableHead className="hidden md:table-cell">
                              Event
                            </TableHead>
                            <TableHead className="text-right">Orang</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checkInRecent.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-data text-xs text-muted-foreground whitespace-nowrap">
                                {formatDateTime(c.checkedInAt)}
                              </TableCell>
                              <TableCell className="font-medium max-w-[160px] truncate">
                                {c.nama}
                              </TableCell>
                              <TableCell className="font-mono text-pink-primary text-xs">
                                <div className="flex items-center gap-1.5">
                                  {c.kodeReferensi}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(c.kodeReferensi);
                                      toast.success("Kode disalin");
                                    }}
                                    className="text-muted-foreground hover:text-ink transition-colors focus:outline-none"
                                    title="Salin kode"
                                  >
                                    <Copy className="size-3" />
                                  </button>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell max-w-[200px] truncate text-muted-foreground">
                                {c.judul}
                              </TableCell>
                              <TableCell className="font-data text-right">
                                {c.jumlahOrang}
                              </TableCell>
                              <TableCell>
                                <PendaftarStatusBadge status={c.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <CheckInReport events={events} token={token} />
          </TabsContent>

          {/* ------------------------------ Pengingat (Task 10-C) ------------------------------ */}
          <TabsContent value="reminders" className="mt-4">
            <RemindersTab
              token={token ?? ""}
              onUnauthorized={handleLogout}
            />
          </TabsContent>
        </Tabs>

        {/* ------------------------------ Webhook detail modal ------------------------------ */}
        <Dialog
          open={webhookDetail !== null}
          onOpenChange={(o) => {
            if (!o) setWebhookDetail(null);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Detail Webhook #{webhookDetail?.id}
              </DialogTitle>
            </DialogHeader>
            {webhookDetail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Waktu</div>
                    <div className="font-data">
                      {formatWaktuWebhook(webhookDetail.receivedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">IP</div>
                    <div className="font-data">
                      {webhookDetail.ip || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Nominal</div>
                    <div className="font-data">
                      {webhookDetail.amount != null
                        ? formatIDR(webhookDetail.amount)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Tanda Tangan
                    </div>
                    <div>
                      {webhookDetail.signatureOk ? (
                        <Badge className="border-transparent bg-success text-white hover:bg-success">
                          Valid
                        </Badge>
                      ) : (
                        <Badge className="border-transparent bg-destructive text-white hover:bg-destructive">
                          Invalid
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      IP Allowlist
                    </div>
                    <div>
                      {webhookDetail.ipOk ? (
                        <Badge className="border-transparent bg-success text-white hover:bg-success">
                          Allowed
                        </Badge>
                      ) : (
                        <Badge className="border-transparent bg-destructive text-white hover:bg-destructive">
                          Blocked
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Kode Cocok
                    </div>
                    <div className="font-mono text-pink-primary">
                      {webhookDetail.matchedKode || "—"}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">Alasan</div>
                    <div>
                      <WebhookReasonBadge reason={webhookDetail.reason} />
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Raw Payload
                  </div>
                  <pre className="text-xs font-mono bg-muted/50 p-3 rounded-lg overflow-x-auto max-h-60 whitespace-pre-wrap break-all">
                    {webhookDetail.rawPayload || "(kosong)"}
                  </pre>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setWebhookDetail(null)}
                  >
                    Tutup
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ------------------------------ Pendaftar detail modal ------------------------------ */}
        <Dialog
          open={pendaftarDetail !== null || pendaftarDetailLoading !== null}
          onOpenChange={(o) => {
            if (!o) {
              setPendaftarDetail(null);
              setPendaftarDetailLoading(null);
            }
          }}
        >
          <DialogContent
            className="max-w-4xl sm:max-w-4xl w-[95vw] max-h-[85vh] overflow-y-auto"
            onPointerDownOutside={(e) => {
              if (lightboxDataRef.current) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (lightboxDataRef.current) e.preventDefault();
            }}
            onEscapeKeyDown={(e) => {
              if (lightboxDataRef.current) e.preventDefault();
            }}
          >
            {pendaftarDetailLoading !== null && pendaftarDetail === null ? (
              <div className="flex items-center justify-center gap-2 py-16">
                <Loader2 className="size-6 animate-spin text-pink-primary" />
                <span className="text-sm text-muted-foreground">
                  Memuat detail…
                </span>
              </div>
            ) : pendaftarDetail ? (
              <>
                <DialogHeader>
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <DialogTitle className="font-mono text-pink-primary break-all text-base">
                      Detail Pendaftar {pendaftarDetail.kodeReferensi}
                    </DialogTitle>
                    <PendaftarStatusBadge status={pendaftarDetail.status} />
                  </div>
                </DialogHeader>

                <div className="px-6 pb-2 space-y-4">
                  {/* Info grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Data Pendaftar */}
                    <Card className="bg-pink-soft/20">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Users className="size-4 text-pink-primary" />
                          Data Pendaftar
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm pt-0">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Nama</span>
                          <span className="font-medium text-right">
                            {pendaftarDetail.nama}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Kontak</span>
                          <span className="font-mono text-right break-all">
                            {pendaftarDetail.kontak}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Jumlah Orang
                          </span>
                          <span className="font-mono">
                            {pendaftarDetail.jumlahOrang}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Kode Referensi
                          </span>
                          <span className="font-mono text-pink-primary flex items-center gap-2">
                            {pendaftarDetail.kodeReferensi}
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(pendaftarDetail.kodeReferensi);
                                toast.success("Kode disalin");
                              }}
                              className="text-muted-foreground hover:text-ink transition-colors focus:outline-none"
                              title="Salin kode"
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Pembayaran */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Wallet className="size-4 text-pink-primary" />
                          Pembayaran
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm pt-0">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Harga Dasar
                          </span>
                          <span className="font-data">
                            {formatIDR(pendaftarDetail.hargaDasar)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-muted-foreground">
                            Total Bayar
                          </span>
                          <span className="font-mono font-bold text-lg text-ink">
                            {formatIDR(pendaftarDetail.totalBayar)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 items-center">
                          <span className="text-muted-foreground">Status</span>
                          <PendaftarStatusBadge status={pendaftarDetail.status} />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Event */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Calendar className="size-4 text-pink-primary" />
                          Event
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm pt-0">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Judul</span>
                          <span className="font-medium text-right">
                            {pendaftarDetail.event.judul}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Tanggal</span>
                          <span className="font-data">
                            {formatTanggal(pendaftarDetail.event.tanggal)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Lokasi</span>
                          <span className="text-right">
                            {pendaftarDetail.event.lokasi}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Harga/orang
                          </span>
                          <span className="font-data">
                            {formatIDR(pendaftarDetail.event.harga)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Timeline */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Clock className="size-4 text-pink-primary" />
                          Timeline
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm pt-0">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Dibuat Pada
                          </span>
                          <span className="font-data text-right">
                            {formatDateTime(pendaftarDetail.createdAt)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            Diverifikasi Pada
                          </span>
                          <span className="font-data text-right">
                            {pendaftarDetail.verifiedAt
                              ? formatDateTime(pendaftarDetail.verifiedAt)
                              : "—"}
                          </span>
                        </div>
                        {pendaftarDetail.catatanAdmin && (
                          <div className="pt-2">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                              Catatan Admin
                            </div>
                            <div className="text-sm border border-border rounded-lg p-2 bg-muted/30 whitespace-pre-wrap">
                              {pendaftarDetail.catatanAdmin}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Detail Peserta */}
                  {pendaftarDetail.peserta && pendaftarDetail.peserta.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Users className="size-4 text-pink-primary" />
                          Daftar Peserta ({pendaftarDetail.peserta.length} Orang)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {pendaftarDetail.peserta.map((p) => (
                            <div key={p.urutan} className="border border-border rounded-lg p-3 bg-card flex flex-col gap-1.5 text-sm">
                              <div className="flex items-center justify-between border-b pb-1.5 mb-1.5">
                                <span className="font-semibold text-ink text-xs uppercase tracking-wider text-muted-foreground">Peserta {p.urutan}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground text-xs">Nama Lengkap</span>
                                <span className="font-medium text-right text-xs truncate" title={p.namaLengkap}>{p.namaLengkap}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground text-xs">Panggilan</span>
                                <span className="text-right text-xs">{p.namaPanggilan}</span>
                              </div>
                              {p.umur && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground text-xs">Umur</span>
                                  <span className="text-right text-xs">{p.umur} thn</span>
                                </div>
                              )}
                              {p.alamat && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground text-xs">Alamat</span>
                                  <span className="text-right text-xs max-w-[120px] truncate" title={p.alamat}>{p.alamat}</span>
                                </div>
                              )}
                              <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground text-xs">WhatsApp</span>
                                <span className="font-mono text-right text-xs">{p.nomorWa}</span>
                              </div>
                              {p.instagram && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground text-xs">Instagram</span>
                                  <a
                                    href={`https://instagram.com/${encodeURIComponent(p.instagram.replace(/^@/, '').trim())}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-right text-xs text-pink-primary font-medium hover:underline cursor-pointer pointer-events-auto z-10"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    @{p.instagram}
                                  </a>
                                </div>
                              )}
                              {p.fotoDiri ? (
                                <div className="mt-2 flex items-center justify-between border-t pt-2 border-border">
                                  <span className="text-muted-foreground text-xs">Foto Diri</span>
                                  {typeof p.fotoDiri === "string" && p.fotoDiri.includes("drive.google.com") ? (
                                    <a
                                      href={p.fotoDiri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-pink-primary font-medium hover:underline inline-flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ArrowUpRight className="size-3" /> Buka GDrive
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const path = p.fotoDiri as string;
                                        const allFotos = pendaftarDetail.peserta
                                          .filter(x => x.fotoDiri && !(x.fotoDiri as string).includes("drive.google.com"))
                                          .map(x => ({
                                            url: (x.fotoDiri as string).startsWith("http") ? (x.fotoDiri as string) : `${window.location.origin}${(x.fotoDiri as string).startsWith("/") ? "" : "/"}${x.fotoDiri}`,
                                            fileName: `${x.namaLengkap} - Foto Diri.jpg`
                                          }));
                                        const clickedUrl = path.startsWith("http") ? path : `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
                                        const clickedIndex = allFotos.findIndex(s => s.url === clickedUrl);
                                        setLightboxData({
                                          urls: allFotos.map(s => s.url),
                                          fileNames: allFotos.map(s => s.fileName),
                                          activeIndex: clickedIndex >= 0 ? clickedIndex : 0
                                        });
                                      }}
                                      className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-primary rounded overflow-hidden mt-3"
                                    >
                                      <img
                                        src={p.fotoDiri.startsWith("http") ? p.fotoDiri : `${window.location.origin}${p.fotoDiri.startsWith("/") ? "" : "/"}${p.fotoDiri}`}
                                        alt={`Foto Diri ${p.namaLengkap}`}
                                        className="size-10 rounded-md object-cover border border-border"
                                      />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-2 flex items-center justify-between border-t pt-2 border-border">
                                  <span className="text-muted-foreground text-xs">Foto Diri</span>
                                  <span className="text-xs text-muted-foreground italic">Belum diunggah</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Bukti Transfer */}
                  {pendaftarDetail.buktiTransfer && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                        Bukti Transfer
                      </div>
                      {(() => {
                        const path = pendaftarDetail.buktiTransfer as string;
                        const fullUrl = path.startsWith("http")
                          ? path
                          : `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
                        const isGdrive = /drive\.google\.com/i.test(path);
                        const isImage = !isGdrive && /\.(jpg|jpeg|png)$/i.test(path);
                        const isPdf = !isGdrive && /\.pdf$/i.test(path);

                        if (isGdrive) {
                          return (
                            <a
                              href={fullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-pink-primary hover:underline"
                            >
                              <ArrowUpRight className="size-4" />
                              Buka GDrive
                            </a>
                          );
                        }

                        if (isImage) {
                          return (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => setLightboxData({ urls: [fullUrl], fileNames: [`${pendaftarDetail.nama} - Bukti Pembayaran.jpg`], activeIndex: 0 })}
                                className="block mx-auto cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-primary rounded-lg overflow-hidden"
                              >
                                <img
                                  src={fullUrl}
                                  alt="Bukti transfer"
                                  className="max-h-48 rounded-lg object-contain border border-border"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => setLightboxData({ urls: [fullUrl], fileNames: [`${pendaftarDetail.nama} - Bukti Pembayaran.jpg`], activeIndex: 0 })}
                                className="inline-flex items-center gap-1 text-xs text-pink-primary hover:underline"
                              >
                                <ExternalLink className="size-3" />
                                Perbesar Gambar
                              </button>
                            </div>
                          );
                        }
                        if (isPdf) {
                          return (
                            <a
                              href={fullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-pink-primary hover:underline"
                            >
                              <FileText className="size-4" />
                              Lihat Bukti PDF
                            </a>
                          );
                        }
                        return (
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-pink-primary hover:underline"
                          >
                            <ExternalLink className="size-4" />
                            Lihat Bukti
                          </a>
                        );
                      })()}
                    </div>
                  )}

                  <DialogFooter className="gap-2 sm:gap-2">
                    {pendaftarDetail.status === "pending_payment" && (
                      <>
                        <Button
                          variant="outline"
                          className="text-success border-success/40 hover:bg-success/10 mr-auto"
                          disabled={
                            pendaftarActionLoading ===
                            pendaftarDetail.kodeReferensi
                          }
                          onClick={async () => {
                            setVerifyDialog({ kodeReferensi: pendaftarDetail.kodeReferensi });
                          }}
                        >
                          {pendaftarActionLoading ===
                            pendaftarDetail.kodeReferensi ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                          Verifikasi
                        </Button>
                        <Button
                          variant="outline"
                          className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          disabled={
                            pendaftarActionLoading ===
                            pendaftarDetail.kodeReferensi
                          }
                          onClick={() => {
                            setRejectCatatan("");
                            setRejectDialog({
                              kodeReferensi: pendaftarDetail.kodeReferensi,
                              nama: pendaftarDetail.nama,
                            });
                          }}
                        >
                          <X className="size-4" />
                          Tolak
                        </Button>
                      </>
                    )}
                    {pendaftarDetail.status === "verified" && (
                      <Button
                        variant="outline"
                        className="mr-auto border-pink-primary/40 text-pink-primary hover:bg-pink-primary/10"
                        onClick={() =>
                          setNotifyKodes([pendaftarDetail.kodeReferensi])
                        }
                      >
                        <Sparkles className="size-4" />
                        Buat Pesan Notifikasi
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setPendaftarDetail(null)}
                    >
                      Tutup
                    </Button>
                  </DialogFooter>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* ------------------------------ Recap modal (Task 8-D) ------------------------------ */}
        {/* Opened by the "Cetak Recap" button in the Dokumentasi History tab.
            Renders a print-friendly recap view (stats + recap text + photos +
            pendaftar table) with a "Cetak / Simpan PDF" button that calls
            window.print(). The print CSS in globals.css hides everything on
            the page except the .recap-print-area inside this modal. */}
        <RecapModal
          eventId={recapEventId}
          token={token ?? ""}
          onClose={() => setRecapEventId(null)}
        />

        {/* ------------------------------ Notification dialog (Task 8-E) ------------------------------ */}
        {/* Opened by the "Buat Pesan Notifikasi" button in the pendaftar
            detail modal (verified pendaftar only) or the MessageCircle icon
            button in the pendaftar table row (verified pendaftar only).
            Calls /api/admin/pendaftar/notify to generate a friendly
            Indonesian WhatsApp-style message. */}
        <NotificationDialog
          kodes={notifyKodes}
          token={token ?? ""}
          onClose={() => setNotifyKodes(null)}
        />

        {/* ------------------------------ Event detail analytics modal (Task 9-C) ------------------------------ */}
        {/* Opened by the "Detail" (BarChart3) button in the Kelola Event
            tab. Renders a comprehensive analytics view for one event:
            6 stat cards, a registration-timeline area chart, and the full
            pendaftar table. Fetches its own data from
            /api/admin/event/detail using the admin token. */}
        <AdminEventDetailModal
          eventId={detailEventId}
          token={token ?? ""}
          onClose={() => setDetailEventId(null)}
        />

        {/* ------------------------------ Check-in dialog (Task 10-A) ------------------------------ */}
        {/* Opened by the "Mulai Check-in" button in the Check-in tab.
            Hosts the QRScanner (camera + scan animation + beep + vibrate +
            manual fallback) + a live recent-check-ins list + a compact
            stats summary. The dialog fetches its own data so it can refresh
            after each successful scan without affecting the tab's data. */}
        <CheckInDialog
          open={checkInDialogOpen}
          onOpenChange={(o) => {
            setCheckInDialogOpen(o);
            // When the dialog closes, refresh the tab's data so the recent
            // list + stats reflect any check-ins made while the dialog was
            // open.
            if (!o && token) {
              void fetchCheckInRecent();
              void fetchCheckInStats();
            }
          }}
          token={token ?? ""}
        />

        <AnimatePresence>
          {lightboxData && (
            <PhotoLightbox
              photos={lightboxData.urls}
              activeIndex={lightboxData.activeIndex}
              onIndexChange={(i) => setLightboxData(prev => prev ? { ...prev, activeIndex: i } : null)}
              onClose={() => setLightboxData(null)}
              altPrefix="Bukti Foto"
              fileNames={lightboxData.fileNames}
            />
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

export { AdminPanel };
export default AdminPanel;
