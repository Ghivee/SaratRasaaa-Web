'use client';

/**
 * NotificationDialog — Saratrasaa
 *
 * WhatsApp notification composer for verified pendaftar. Supports bulk kodes.
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
  Send,
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
import { formatIDR } from "@/lib/saratrasa";
import { Textarea } from "@/components/ui/textarea";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface NotifyPendaftar {
  kodeReferensi: string;
  nama: string;
  peserta?: { namaPanggilan: string }[];
  kontak: string;
  jumlahOrang: number;
  totalBayar: number;
  status: "pending_payment" | "verified" | "rejected";
}

interface NotifyData {
  pendaftar: NotifyPendaftar;
  event: {
    judul: string;
    tanggal: string;
    lokasi: string;
  };
  shareUrl: string;
}

interface NotifyResponse {
  ok: true;
  data: NotifyData[];
}

interface NotifyErrorResponse {
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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

const DEFAULT_TEMPLATE = `Halo {nama}! 👋

Yeay, pembayaranmu sudah kami verifikasi! ✅

📋 *Detail Pendaftaran:*
🎪 Event: {eventJudul}
📅 Tanggal: {eventTanggal}
📍 Lokasi: {eventLokasi}
👥 Jumlah Orang: {jumlahOrang}
💰 Total Bayar: {totalBayar}

🎫 Kode Referensi: *{kodeReferensi}*
Simpan kode ini baik-baik ya, kamu akan butuhkan saat check-in nanti.

🔗 Cek status & tiketmu di sini:
{shareUrl}

Sampai jumpa di lokasi! 🌿💚
— Tim Saratrasaa`;

function hydrateTemplate(template: string, d: NotifyData): string {
  const fullName = d.pendaftar.nama;
  const shortName = d.pendaftar.peserta?.[0]?.namaPanggilan || fullName.split(" ")[0] || fullName;

  return template
    .replace(/{nama}/g, shortName)
    .replace(/{namaLengkap}/g, fullName)
    .replace(/{eventJudul}/g, d.event.judul)
    .replace(/{eventTanggal}/g, formatTanggal(d.event.tanggal))
    .replace(/{eventLokasi}/g, d.event.lokasi)
    .replace(/{jumlahOrang}/g, String(d.pendaftar.jumlahOrang))
    .replace(/{totalBayar}/g, formatIDR(d.pendaftar.totalBayar))
    .replace(/{kodeReferensi}/g, d.pendaftar.kodeReferensi)
    .replace(/{shareUrl}/g, d.shareUrl);
}

/* -------------------------------------------------------------------------- */
/* Props                                                                        */
/* -------------------------------------------------------------------------- */

interface NotificationDialogProps {
  /** Array of kodes. If null, the dialog is closed. */
  kodes: string[] | null;
  /** Admin token — sent as X-Admin-Token header on the fetch. */
  token: string;
  /** Called when the user wants to close the dialog (Tutup / backdrop / ESC). */
  onClose: () => void;
  /** Custom default template for the textarea. */
  defaultTemplate?: string;
  /** Custom title for the dialog header. */
  title?: string;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                    */
/* -------------------------------------------------------------------------- */

export function NotificationDialog({
  kodes,
  token,
  onClose,
  defaultTemplate = DEFAULT_TEMPLATE,
  title = "Pesan Notifikasi",
}: NotificationDialogProps) {
  const open = kodes !== null;

  const [data, setData] = React.useState<NotifyData[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [template, setTemplate] = React.useState(defaultTemplate);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  
  // Track send statuses for each recipient
  const [sendingAll, setSendingAll] = React.useState(false);
  const [sendStatus, setSendStatus] = React.useState<Record<string, "sending" | "success" | "error">>({});

  React.useEffect(() => {
    // Reset template if defaultTemplate changes while closed
    if (open) {
      setTemplate(defaultTemplate);
    }
  }, [open, defaultTemplate]);

  React.useEffect(() => {
    if (!open || !kodes || kodes.length === 0 || !token) {
      setData(null);
      setError(null);
      setSendStatus({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/admin/pendaftar/notify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Token": token,
          },
          body: JSON.stringify({ kodes }),
        });
        if (cancelled) return;
        if (res.status === 401) {
          toast.error("Token admin tidak valid.");
          onClose();
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as NotifyErrorResponse;
          setError(body.error || "Gagal membuat pesan.");
          return;
        }
        const json = (await res.json()) as NotifyResponse;
        if (cancelled) return;
        setData(json.data);
      } catch (err) {
        if (cancelled) return;
        setError("Gagal memuat data: " + (err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, kodes, token]);

  async function handleCopy(msg: string, idx: number) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(msg);
      } else {
        const ta = document.createElement("textarea");
        ta.value = msg;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedIndex(idx);
      toast.success("Pesan disalin ke clipboard.");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast.error("Gagal menyalin: " + (err as Error).message);
    }
  }

  function handleOpenWhatsApp(msg: string, phoneStr: string) {
    const text = encodeURIComponent(msg);
    const phone = normalizeWaNumber(phoneStr);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSendViaFonnte(recipients: NotifyData[]) {
    setSendingAll(true);
    // Mark sending
    const newStatus = { ...sendStatus };
    recipients.forEach(r => newStatus[r.pendaftar.kodeReferensi] = "sending");
    setSendStatus(newStatus);

    try {
      const messages = recipients.map(d => ({
        kode: d.pendaftar.kodeReferensi,
        target: normalizeWaNumber(d.pendaftar.kontak),
        text: hydrateTemplate(template, d)
      }));

      const res = await fetch("/api/admin/whatsapp/send-bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": token,
        },
        body: JSON.stringify({ messages }),
      });

      if (!res.ok) throw new Error("Gagal terhubung ke server");
      
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Gagal mengirim");

      const updatedStatus = { ...newStatus };
      json.results.forEach((r: any) => {
        updatedStatus[r.kode] = r.success ? "success" : "error";
      });
      setSendStatus(updatedStatus);
      
      toast.success(`Berhasil mengirim ${json.successCount} pesan, gagal ${json.failCount}.`);
    } catch (err: any) {
      toast.error(err.message || "Gagal memproses pengiriman");
      const errStatus = { ...newStatus };
      recipients.forEach(r => errStatus[r.pendaftar.kodeReferensi] = "error");
      setSendStatus(errStatus);
    } finally {
      setSendingAll(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Sparkles className="size-5 text-pink-primary" />
            {title} {data && data.length > 1 ? "Massal" : ""}
          </DialogTitle>
          <DialogDescription>
            Edit template pesan di bawah ini. Variabel yang diapit kurung kurawal (contoh: <code className="bg-muted px-1 rounded">{'{nama}'}</code>) akan otomatis diganti dengan data tiap pendaftar.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="size-7 animate-spin text-pink-primary" />
            <p className="text-sm text-muted-foreground text-center">Memuat data pendaftar…</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-destructive text-sm">Gagal memuat data</p>
                <p className="text-xs text-muted-foreground mt-1 break-words">{error}</p>
              </div>
            </div>
          </div>
        ) : data && data.length > 0 ? (
          <div className="space-y-4">
            {/* Template Editor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <span>Template Pesan</span>
                </div>
              </div>
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="min-h-[160px] font-mono text-sm leading-relaxed"
                placeholder="Ketik template pesan di sini..."
              />
              <p className="text-[11px] text-muted-foreground">
                Variabel: <code className="text-pink-primary">{'{nama}'}</code> (Panggilan), <code className="text-pink-primary">{'{namaLengkap}'}</code> (Lengkap), <code className="text-pink-primary">{'{eventJudul}'}</code>, <code className="text-pink-primary">{'{eventTanggal}'}</code>, <code className="text-pink-primary">{'{eventLokasi}'}</code>, <code className="text-pink-primary">{'{jumlahOrang}'}</code>, <code className="text-pink-primary">{'{totalBayar}'}</code>, <code className="text-pink-primary">{'{kodeReferensi}'}</code>, <code className="text-pink-primary">{'{shareUrl}'}</code>
              </p>
            </div>

            {/* Recipient List */}
            <div className="space-y-3 mt-6">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MessageCircle className="size-3" />
                  Daftar Penerima ({data.length})
                </div>
                <Button 
                  size="sm" 
                  disabled={sendingAll || data.length === 0}
                  onClick={() => handleSendViaFonnte(data)}
                  className="h-8 gap-2 bg-pink-primary hover:bg-pink-700 text-white"
                >
                  {sendingAll ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Kirim Semua via Fonnte
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto p-1">
                {data.map((d, idx) => {
                  const finalMsg = hydrateTemplate(template, d);
                  const status = sendStatus[d.pendaftar.kodeReferensi];
                  return (
                    <div key={d.pendaftar.kodeReferensi} className="bg-card border rounded-lg p-3 space-y-3 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm truncate max-w-[70%]">{d.pendaftar.nama}</span>
                          <span className="text-xs font-mono text-pink-primary shrink-0">{d.pendaftar.kodeReferensi}</span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate mb-2">{d.pendaftar.kontak}</p>
                        
                        {/* Status Indicator */}
                        {status && (
                          <div className={cn(
                            "flex items-center gap-1.5 text-xs font-medium mb-3",
                            status === "sending" ? "text-amber-500" :
                            status === "success" ? "text-success" : "text-destructive"
                          )}>
                            {status === "sending" && <Loader2 className="size-3 animate-spin" />}
                            {status === "success" && <Check className="size-3" />}
                            {status === "error" && <AlertTriangle className="size-3" />}
                            <span>
                              {status === "sending" ? "Mengirim..." : 
                               status === "success" ? "Terkirim" : "Gagal Terkirim"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                         <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(finalMsg, idx)}
                          className="flex-1 min-w-[80px]"
                          title="Salin Pesan"
                        >
                          {copiedIndex === idx ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSendViaFonnte([d])}
                          disabled={status === "sending" || sendingAll}
                          className="flex-1 min-w-[80px] bg-pink-primary/10 text-pink-700 hover:bg-pink-primary/20 border-transparent shadow-none"
                        >
                          <Send className="size-3.5 mr-1" />
                          Kirim
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenWhatsApp(finalMsg, d.pendaftar.kontak)}
                          className="flex-none px-3 bg-[#25D366] text-white hover:bg-[#1da851] border-transparent"
                          title="Buka WA.me Manual"
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NotificationDialog;
