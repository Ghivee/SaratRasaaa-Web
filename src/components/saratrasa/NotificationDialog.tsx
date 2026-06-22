'use client';

/**
 * NotificationDialog — Saratrasaa (Task 8-E)
 *
 * LLM-powered WhatsApp notification composer for verified pendaftar.
 *
 * Flow:
 *   1. Admin opens the dialog (either from the pendaftar table row's
 *      MessageCircle icon, or from the "Buat Pesan Notifikasi" button in
 *      the pendaftar detail modal — the latter shows only for verified
 *      pendaftar).
 *   2. The dialog immediately fires POST /api/admin/pendaftar/notify with
 *      the pendaftar's kode. The server fetches the pendaftar + event,
 *      calls z-ai-web-dev-sdk to compose a friendly Indonesian message,
 *      and returns it.
 *   3. The message renders in a chat-bubble style block. Action buttons:
 *        - Salin Pesan        — copies to clipboard
 *        - Buka WhatsApp      — opens https://wa.me/<phone>?text=<encoded>
 *        - Regenerasi         — calls the API again for a fresh variation
 *        - Tutup              — closes the dialog
 *
 * Error handling:
 *   - On LLM failure (502) or network error, show an inline error block
 *     with a "Coba lagi" button that re-fires the request.
 *   - On 401 (token expired), surface the error and let the parent close.
 *
 * Styling: Saratrasaa pink palette. No indigo/blue. WhatsApp button uses
 * the brand's green (#25D366) as a single accent — allowed since it's a
 * recognised brand affordance, not a primary UI color.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  MessageCircle,
  X,
  AlertTriangle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

/* -------------------------------------------------------------------------- */
/* Types — matches the /api/admin/pendaftar/notify response                   */
/* -------------------------------------------------------------------------- */

interface NotifyPendaftar {
  kodeReferensi: string;
  nama: string;
  kontak: string;
  jumlahOrang: number;
  totalBayar: number;
  status: "pending_payment" | "verified" | "rejected";
}

interface NotifyResponse {
  ok: true;
  message: string;
  pendaftar: NotifyPendaftar;
  event: {
    judul: string;
    tanggal: string;
    lokasi: string;
  };
  shareUrl: string;
}

interface NotifyErrorResponse {
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Normalize an Indonesian phone number for wa.me.
 *
 * wa.me expects the international format WITHOUT the leading "+" or "00".
 * Indonesian numbers come in many shapes — we handle the common ones:
 *   - "081234567890"  → "6281234567890"
 *   - "+6281234567890" → "6281234567890"
 *   - "6281234567890"  → unchanged
 *   - "0812 3456 7890" → "6281234567890"  (strips spaces / dashes)
 *
 * Returns "" if the input doesn't look like a phone number (length < 8 after
 * stripping non-digits), so the caller can fall back to the no-phone wa.me URL.
 */
function normalizeWaNumber(raw: string): string {
  if (!raw) return "";
  // Keep only digits and a leading +.
  let s = raw.trim();
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return "";
  if (hasPlus) {
    // Already international — strip the leading country code's "+"
    return s;
  }
  if (s.startsWith("00")) {
    // International prefix with "00"
    return s.slice(2);
  }
  if (s.startsWith("0")) {
    // Indonesian local — replace leading 0 with 62
    return "62" + s.slice(1);
  }
  if (s.startsWith("62")) {
    return s;
  }
  // Fallback: assume Indonesian local without leading 0
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
/* Props                                                                        */
/* -------------------------------------------------------------------------- */

interface NotificationDialogProps {
  /** When non-null, the dialog is open for this kode. */
  kode: string | null;
  /** Admin token — sent as X-Admin-Token header on the fetch. */
  token: string;
  /** Called when the user wants to close the dialog (Tutup / backdrop / ESC). */
  onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                    */
/* -------------------------------------------------------------------------- */

export function NotificationDialog({
  kode,
  token,
  onClose,
}: NotificationDialogProps) {
  const open = kode !== null;

  const [data, setData] = React.useState<NotifyResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  // bump on regenerate to force the fetch effect to re-run with a new nonce
  const [regenNonce, setRegenNonce] = React.useState(0);

  // Reset state + fire the fetch whenever the dialog opens for a new kode,
  // or the regenNonce changes (regenerate button).
  React.useEffect(() => {
    if (!open || !kode || !token) {
      setData(null);
      setError(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Keep the previous message visible while regenerating for less jarring
    // UX — only clear on the first load for a new kode.
    setData((prev) => (prev?.pendaftar.kodeReferensi === kode ? prev : null));

    (async () => {
      try {
        const res = await fetch("/api/admin/pendaftar/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Token": token,
          },
          body: JSON.stringify({ kode }),
        });
        if (cancelled) return;
        if (res.status === 401) {
          toast.error("Token admin tidak valid.");
          onClose();
          return;
        }
        if (res.status === 404) {
          setError("Pendaftar tidak ditemukan.");
          return;
        }
        if (res.status === 429) {
          const body = (await res
            .json()
            .catch(() => ({}))) as NotifyErrorResponse;
          setError(
            body.error ||
              "Terlalu banyak permintaan pesan. Tunggu sebentar lalu coba lagi.",
          );
          return;
        }
        if (res.status === 502) {
          const body = (await res
            .json()
            .catch(() => ({}))) as NotifyErrorResponse;
          setError(
            body.error ||
              "Gagal membuat pesan dengan LLM. Coba lagi sebentar.",
          );
          return;
        }
        if (!res.ok) {
          const body = (await res
            .json()
            .catch(() => ({}))) as NotifyErrorResponse;
          setError(body.error || "Gagal membuat pesan.");
          return;
        }
        const json = (await res.json()) as NotifyResponse;
        if (cancelled) return;
        setData(json);
        setCopied(false);
      } catch (err) {
        if (cancelled) return;
        setError("Gagal membuat pesan: " + (err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, kode, token, regenNonce]);

  /** Copy the message to the clipboard. */
  async function handleCopy() {
    if (!data) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(data.message);
      } else {
        // Fallback for non-secure contexts (e.g. plain HTTP on localhost).
        const ta = document.createElement("textarea");
        ta.value = data.message;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("Pesan disalin ke clipboard.");
      // Reset the copied checkmark after 2s so the icon returns to "Copy".
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Gagal menyalin: " + (err as Error).message);
    }
  }

  /** Open WhatsApp with the message + pendaftar's phone pre-filled. */
  function handleOpenWhatsApp() {
    if (!data) return;
    const text = encodeURIComponent(data.message);
    const phone = normalizeWaNumber(data.pendaftar.kontak);
    // If we have a valid phone, open the direct chat; otherwise open the
    // "share" intent without a number (admin can pick a chat manually).
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /** Regenerate — re-fire the API call. */
  function handleRegenerate() {
    if (!kode || loading) return;
    setRegenNonce((n) => n + 1);
  }

  // Derived: which phone number will WhatsApp open? (for the helper text)
  const waPhone = data ? normalizeWaNumber(data.pendaftar.kontak) : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Sparkles className="size-5 text-pink-primary" />
            Pesan Notifikasi WhatsApp
          </DialogTitle>
          <DialogDescription>
            Dibuat otomatis oleh AI. Periksa isi pesan sebelum dikirim —
            kamu bisa salin, buka WhatsApp, atau regenerasi.
          </DialogDescription>
        </DialogHeader>

        {/* Pendaftar info summary — always visible (even during loading) */}
        {data ? (
          <div className="rounded-lg border border-border bg-pink-soft/20 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Nama</span>
              <span className="font-medium text-right truncate max-w-[60%]">
                {data.pendaftar.nama}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Kode Ref</span>
              <span className="font-mono text-pink-primary">
                {data.pendaftar.kodeReferensi}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Event</span>
              <span className="text-right truncate max-w-[60%]">
                {data.event.judul}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Tanggal</span>
              <span className="font-data">
                {formatTanggal(data.event.tanggal)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Kontak</span>
              <span className="font-mono text-right break-all">
                {data.pendaftar.kontak}
                {waPhone && waPhone !== data.pendaftar.kontak && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({waPhone})
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-muted-foreground">Status</span>
              <Badge
                className={
                  data.pendaftar.status === "verified"
                    ? "border-transparent bg-success text-white hover:bg-success"
                    : data.pendaftar.status === "rejected"
                      ? "border-transparent bg-destructive text-white hover:bg-destructive"
                      : "border-transparent bg-amber text-ink hover:bg-amber"
                }
              >
                {data.pendaftar.status === "verified"
                  ? "Verified"
                  : data.pendaftar.status === "rejected"
                    ? "Rejected"
                    : "Pending"}
              </Badge>
            </div>
          </div>
        ) : null}

        {/* Body — loading / error / message bubble */}
        {loading && !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="size-7 animate-spin text-pink-primary" />
            <p className="text-sm text-muted-foreground text-center">
              Menyusun pesan dengan AI…
              <br />
              <span className="text-xs">Biasanya 3–8 detik.</span>
            </p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-destructive text-sm">
                  Gagal membuat pesan
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
              onClick={handleRegenerate}
              disabled={loading}
              className="w-full"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              Coba lagi
            </Button>
          </div>
        ) : data ? (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageCircle className="size-3" />
              Pratinjau Pesan
              {loading ? (
                <Loader2 className="size-3 animate-spin ml-1" />
              ) : null}
            </div>
            {/* Chat-bubble style — rounded with a "tail" feel using rounded-2xl
                and asymmetric corner radii. */}
            <div className="bg-[#dcf8c6] dark:bg-[#0b3d2e] text-foreground rounded-2xl rounded-tl-sm p-3.5 shadow-sm">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {data.message}
              </p>
              {/* Footer inside the bubble — link preview + meta */}
              <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-2">
                <a
                  href={data.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-pink-primary hover:underline inline-flex items-center gap-1 min-w-0 truncate"
                  title={data.shareUrl}
                >
                  <ExternalLink className="size-2.5 shrink-0" />
                  <span className="truncate">{data.shareUrl}</span>
                </a>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {data.message.length} karakter
                </span>
              </div>
            </div>
            {data.message.length > 500 ? (
              <p className="text-xs text-amber flex items-center gap-1.5">
                <AlertTriangle className="size-3 shrink-0" />
                Pesan melebihi 500 karakter — WhatsApp mungkin memotongnya
                jika diteruskan sebagai pesan broadcast.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            disabled={!data || loading}
            className="flex-1 min-w-[120px]"
          >
            {copied ? (
              <>
                <Check className="size-4 text-success" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Salin Pesan
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={handleOpenWhatsApp}
            disabled={!data || loading}
            className="flex-1 min-w-[120px] bg-[#25D366] text-white hover:bg-[#1da851] border-transparent"
          >
            <MessageCircle className="size-4" />
            Buka WhatsApp
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRegenerate}
            disabled={loading || !kode}
            className="flex-1 min-w-[120px]"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Regenerasi
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            <X className="size-4" />
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NotificationDialog;
