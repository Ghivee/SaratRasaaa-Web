"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageCircle, AlertTriangle, Sparkles, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Normalizes a contact number by removing non-digits.
 * If it doesn't start with '+', it returns the raw digits (often starting with 0 or 62).
 * Fonnte usually handles '08...', '628...', or '+628...' well.
 */
function normalizeWaNumber(raw: string): string {
  let s = raw.trim();
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return "";
  if (hasPlus) return s;
  // If it starts with 0, change to 62
  if (s.startsWith("0")) {
    return "62" + s.slice(1);
  }
  return s;
}

export interface BroadcastUser {
  nama: string;         // nama panggilan
  namaLengkap: string;
  kontak: string;
}

const DEFAULT_TEMPLATE = `Halo {nama}! 👋

Ada info terbaru nih dari *SaratRasaa* untuk kamu!

[Tulis pesan broadcast kamu di sini...]

Salam hangat,
— Tim Saratrasaa`;

function hydrateTemplate(template: string, d: BroadcastUser): string {
  return template
    .replace(/{nama}/g, d.nama)
    .replace(/{namaLengkap}/g, d.namaLengkap);
}

interface BroadcastGlobalDialogProps {
  users: BroadcastUser[] | null;
  token: string;
  onClose: () => void;
  title?: string;
}

export function BroadcastGlobalDialog({
  users,
  token,
  onClose,
  title = "Broadcast Massal",
}: BroadcastGlobalDialogProps) {
  const open = users !== null;

  const [template, setTemplate] = React.useState(DEFAULT_TEMPLATE);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  
  // Track send statuses for each recipient
  const [sendingAll, setSendingAll] = React.useState(false);
  const [sendStatus, setSendStatus] = React.useState<Record<string, "sending" | "success" | "error">>({});

  React.useEffect(() => {
    if (open) {
      const saved = localStorage.getItem("saratrasaa_broadcast_template");
      if (saved) {
        setTemplate(saved);
      } else {
        setTemplate(DEFAULT_TEMPLATE);
      }
    }
  }, [open]);

  function handleTemplateChange(val: string) {
    setTemplate(val);
    localStorage.setItem("saratrasaa_broadcast_template", val);
  }

  function resetTemplate() {
    setTemplate(DEFAULT_TEMPLATE);
    localStorage.removeItem("saratrasaa_broadcast_template");
  }

  React.useEffect(() => {
    if (!open) {
      setSendStatus({});
      setSendingAll(false);
    }
  }, [open]);

  async function handleSendViaFonnte(dataList: BroadcastUser[]) {
    if (!token) {
      toast.error("Token admin tidak ditemukan.");
      return;
    }

    try {
      setSendingAll(true);
      
      // Mark all as sending
      const newStatus = { ...sendStatus };
      dataList.forEach(d => {
        newStatus[d.kontak] = "sending";
      });
      setSendStatus(newStatus);

      // Prepare messages
      const messages = dataList.map(d => ({
        kode: d.kontak, // use kontak as unique ID for the result matching
        target: normalizeWaNumber(d.kontak),
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Gagal mengirim pesan");
      }

      const result = await res.json();
      
      // Update statuses based on results
      const finalStatus = { ...newStatus };
      result.results.forEach((r: any) => {
        finalStatus[r.kode] = r.success ? "success" : "error";
      });
      setSendStatus(finalStatus);

      if (result.failCount === 0) {
        toast.success(`Berhasil mengirim ${result.successCount} pesan.`);
      } else {
        toast.warning(`Berhasil: ${result.successCount}, Gagal: ${result.failCount}. Cek status di daftar.`);
      }
      
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan sistem");
      // Mark any still sending as error
      setSendStatus(prev => {
        const next = { ...prev };
        dataList.forEach(d => {
          if (next[d.kontak] === "sending") next[d.kontak] = "error";
        });
        return next;
      });
    } finally {
      setSendingAll(false);
    }
  }

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      toast.success("Pesan disalin ke clipboard!");
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast.error("Gagal menyalin pesan.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="p-6 overflow-y-auto scroll-soft">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-display text-lg flex items-center gap-2">
              <Sparkles className="size-5 text-pink-primary" />
              {title}
            </DialogTitle>
            <DialogDescription>
              Kirim pesan massal ke seluruh kontak unik yang kamu pilih. Variabel <code className="bg-muted px-1 rounded">{'{nama}'}</code> akan otomatis diganti.
            </DialogDescription>
          </DialogHeader>

          {!users || users.length === 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-destructive text-sm">Tidak ada kontak yang dipilih</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Template Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Template Pesan</span>
                    <div className="text-[10px] bg-muted px-2 py-1 rounded text-muted-foreground overflow-x-auto max-w-full">
                      Tersedia: <code className="text-pink-primary">{'{nama}'}</code> (Panggilan), <code className="text-pink-primary">{'{namaLengkap}'}</code> (Lengkap)
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetTemplate} className="h-7 text-[10px] uppercase tracking-wider">Reset</Button>
                </div>
                <Textarea
                  value={template}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="min-h-[160px] font-mono text-sm leading-relaxed"
                  placeholder="Ketik template pesan di sini..."
                />
              </div>

              {/* Recipient List */}
              <div className="space-y-3 mt-6">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <MessageCircle className="size-3" />
                    Daftar Penerima ({users.length} Kontak Unik)
                  </div>
                  <Button 
                    size="sm" 
                    disabled={sendingAll || users.length === 0}
                    onClick={() => handleSendViaFonnte(users)}
                    className="h-8 gap-2 bg-pink-primary hover:bg-pink-700 text-white"
                  >
                    {sendingAll ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    {sendingAll ? "Mengirim..." : `Kirim ke Semua (${users.length})`}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto p-1">
                  {users.map((d, idx) => {
                    const finalMsg = hydrateTemplate(template, d);
                    const status = sendStatus[d.kontak];
                    return (
                      <div key={d.kontak} className="bg-card border rounded-lg p-3 space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm truncate max-w-[70%]">{d.nama}</span>
                            <span className="text-xs font-mono text-pink-primary shrink-0">{d.kontak}</span>
                          </div>
                          <div className="bg-muted/50 rounded-md p-2.5 relative group">
                            <p className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-4 group-hover:line-clamp-none transition-all">
                              {finalMsg}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur"
                              onClick={() => handleCopy(finalMsg, idx)}
                            >
                              {copiedIndex === idx ? <CheckCircle2 className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Status Indicator */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status Fonnte</span>
                          {status === "sending" ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                              <Loader2 className="size-3 animate-spin" /> Mengirim...
                            </span>
                          ) : status === "success" ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="size-3" /> Terkirim
                            </span>
                          ) : status === "error" ? (
                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="size-3" /> Gagal
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Menunggu</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
