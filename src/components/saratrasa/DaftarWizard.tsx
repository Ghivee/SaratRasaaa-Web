"use client";

/**
 * DaftarWizard — 3-step volunteer registration wizard (Saratrasaa brief §4.2).
 *
 * Flow: Info Event → Data Peserta → Pembayaran.
 *
 * Key change (user request):
 *   - Registration supports 1–5 people per submission.
 *   - EACH person must have their own data filled (not just one representative).
 *   - Per-person fields: nama lengkap, nama panggilan, instagram (optional), nomor WhatsApp.
 *   - Max 5 people per registration.
 *   - On success: show "Berhasil Terdaftar" + redirect to WhatsApp group link.
 *
 * Integration contract with the parent page:
 *   - The "Cek Status Pembayaran" button dispatches a CustomEvent
 *     `saratrasa:goto` with detail "cek-status" on window.
 */

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatIDR, formatNumber } from "@/lib/saratrasa";
import { ActiveEventSummary, DaftarResponse } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface DaftarWizardProps {
  activeEvent: ActiveEventSummary | null;
  onBack: () => void; // back to beranda
}

const WA_RE = /^(\+62|62|0)8[1-9][0-9]{6,11}$/;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB — matches validateUpload
const ACCEPTED_MIME = ["image/jpeg", "image/png", "application/pdf"];
const MAX_PESERTA = 5;

/** Per-person data structure. */
interface PesertaForm {
  namaLengkap: string;
  namaPanggilan: string;
  instagram: string;
  nomorWa: string;
}

function emptyPeserta(): PesertaForm {
  return { namaLengkap: "", namaPanggilan: "", instagram: "", nomorWa: "" };
}

/** Format a YYYY-MM-DD date as a long Indonesian date string. */
function formatTanggal(tanggal: string): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  if (!y || !m || !d) return tanggal;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DaftarWizard({ activeEvent, onBack }: DaftarWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 2 form state — array of peserta (1–5)
  const [pesertaList, setPesertaList] = useState<PesertaForm[]>([emptyPeserta()]);
  const [submitting, setSubmitting] = useState(false);

  // Step 3 state
  const [daftarResponse, setDaftarResponse] = useState<DaftarResponse | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Max people is min(sisaKuota, 5)
  const maxOrang = useMemo(() => {
    if (!activeEvent) return 1;
    return Math.max(1, Math.min(MAX_PESERTA, activeEvent.sisaKuota));
  }, [activeEvent]);

  const jumlahOrang = pesertaList.length;

  // Validate all peserta
  const pesertaValid = useMemo(() => {
    return pesertaList.every((p) => {
      return (
        p.namaLengkap.trim().length >= 2 &&
        p.namaPanggilan.trim().length >= 1 &&
        WA_RE.test(p.nomorWa.trim())
      );
    });
  }, [pesertaList]);

  const formValid = pesertaValid && jumlahOrang >= 1 && jumlahOrang <= maxOrang;

  const hargaDasarCalc = activeEvent
    ? activeEvent.harga * jumlahOrang
    : 0;

  // ---------------------------------------------------------------------
  // Peserta list handlers
  // ---------------------------------------------------------------------
  function addPeserta() {
    if (pesertaList.length >= maxOrang) return;
    setPesertaList((prev) => [...prev, emptyPeserta()]);
  }

  function removePeserta(index: number) {
    if (pesertaList.length <= 1) return;
    setPesertaList((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePeserta(index: number, field: keyof PesertaForm, value: string) {
    setPesertaList((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  // ---------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------
  async function handleDaftar() {
    if (!activeEvent || !formValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/daftar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idEvent: activeEvent.id,
          peserta: pesertaList.map((p) => ({
            namaLengkap: p.namaLengkap.trim(),
            namaPanggilan: p.namaPanggilan.trim(),
            instagram: p.instagram.trim() || undefined,
            nomorWa: p.nomorWa.trim(),
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (DaftarResponse & { error?: string })
        | { error?: string }
        | null;

      if (res.status === 201 && data && "kodeReferensi" in data) {
        setDaftarResponse(data);
        setStep(3);
        toast.success("Pendaftaran berhasil! Selesaikan pembayaran ya.");
        return;
      }
      if (res.status === 409) {
        const msg =
          (data && data.error) || "Kuota tidak mencukupi. Silakan coba lagi.";
        toast.error(msg);
        setStep(1);
        return;
      }
      if (res.status === 400) {
        const msg = (data && data.error) || "Data tidak valid.";
        toast.error(msg);
        return;
      }
      toast.error("Terjadi kesalahan. Coba lagi ya.");
    } catch (err) {
      console.error("[DaftarWizard] /api/daftar error", err);
      toast.error("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSalinKode() {
    if (!daftarResponse) return;
    try {
      await navigator.clipboard.writeText(daftarResponse.kodeReferensi);
      toast.success("Kode disalin!");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin otomatis. Salin manual ya.");
    }
  }

  async function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file || !daftarResponse) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Ukuran file melebihi 2 MB.");
      e.target.value = "";
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error("Format file harus JPG, PNG, atau PDF.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Gagal membaca file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/upload-bukti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kodeReferensi: daftarResponse.kodeReferensi,
          file: dataUrl,
        }),
      });
      const data = (await res
        .json()
        .catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;

      if (res.ok && data && data.ok && data.url) {
        setUploadedUrl(data.url);
        toast.success("Bukti transfer terunggah.");
      } else {
        const msg = (data && data.error) || "Gagal mengunggah bukti.";
        toast.error(msg);
      }
    } catch (err) {
      console.error("[DaftarWizard] /api/upload-bukti error", err);
      toast.error("Gagal mengunggah bukti. Coba lagi ya.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleCekStatus() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("saratrasa:goto", { detail: "cek-status" }),
      );
    }
  }

  function handleJoinGrupWa() {
    if (daftarResponse?.linkGrupWa) {
      window.open(daftarResponse.linkGrupWa, "_blank", "noopener,noreferrer");
    }
  }

  // ---------------------------------------------------------------------
  // Empty state — no active event
  // ---------------------------------------------------------------------
  if (!activeEvent) {
    return (
      <Card className="mx-auto max-w-lg border-secondary bg-card">
        <CardContent className="flex flex-col items-center gap-4 pt-2 text-center">
          <div className="rounded-full bg-secondary p-4">
            <AlertCircle className="size-8 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-2xl font-semibold">
              Belum ada pendaftaran dibuka saat ini
            </h3>
            <p className="text-sm text-muted-foreground">
              Pantau Instagram{" "}
              <span className="font-medium text-primary">@saratrasaaa</span>{" "}
              untuk event berikutnya.
            </p>
          </div>
          <Button onClick={onBack} className="rounded-full">
            <ArrowLeft className="size-4" /> Kembali ke Beranda
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------
  // Progress indicator — 3 connected circles with labels
  // ---------------------------------------------------------------------
  const steps = [
    { n: 1 as const, label: "Info Event" },
    { n: 2 as const, label: "Data Peserta" },
    { n: 3 as const, label: "Pembayaran" },
  ];

  const quotaPct = Math.min(
    100,
    Math.round((activeEvent.terpakai / activeEvent.kuotaMax) * 100),
  );
  const sisaKuota = activeEvent.sisaKuota;
  const kuotaPenuh = sisaKuota <= 0;
  const kuotaTerbatas = sisaKuota > 0 && sisaKuota <= 5;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center">
        {steps.map((s, i) => {
          const isCurrent = step === s.n;
          const isCompleted = step > s.n;
          return (
            <div
              key={s.n}
              className={cn("flex items-center", i < steps.length - 1 && "flex-1")}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground",
                    isCompleted &&
                      "border-secondary bg-secondary text-primary",
                    !isCurrent &&
                      !isCompleted &&
                      "border-border bg-card text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="size-4" /> : s.n}
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs font-medium",
                    isCurrent ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <div
                    className={cn(
                      "absolute inset-0 origin-left bg-primary transition-transform duration-500",
                      step > s.n ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {/* ===================================================== STEP 1 */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <Card className="overflow-hidden border-secondary shadow-lg">
              <div className="relative overflow-hidden bg-gradient-to-b from-secondary to-background px-6 py-8">
                {activeEvent.fotoCover &&
                  activeEvent.fotoCover.trim() !== "" && (
                    <>
                      <img
                        src={activeEvent.fotoCover}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 size-full object-cover opacity-40"
                        decoding="async"
                      />
                      <div
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-b from-[var(--pink-soft)]/80 to-transparent"
                      />
                    </>
                  )}
                <div className="relative z-10">
                  <p className="text-xs font-medium uppercase tracking-wider text-primary">
                    Pendaftaran Relawan
                  </p>
                  <h2 className="mt-1 font-display text-3xl font-semibold leading-tight">
                    {activeEvent.judul}
                  </h2>
                  <div className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/80">
                    <span className="flex items-center gap-2">
                      <MapPin className="size-4 text-primary" />
                      {formatTanggal(activeEvent.tanggal)}
                    </span>
                    <span className="flex items-center gap-2">
                      <MapPin className="size-4 text-primary" />
                      {activeEvent.lokasi}
                    </span>
                  </div>
                </div>
              </div>

              <CardContent className="space-y-5">
                <p className="text-sm leading-relaxed text-foreground/80">
                  {activeEvent.deskripsi}
                </p>

                <Separator />

                {/* Price + quota block */}
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Harga per orang
                    </span>
                    <span className="font-mono text-2xl font-semibold text-primary">
                      {formatIDR(activeEvent.harga)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        / orang
                      </span>
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {activeEvent.terpakai} dari {activeEvent.kuotaMax} slot
                        terisi
                      </span>
                      {kuotaTerbatas && (
                        <Badge
                          variant="outline"
                          className="animate-pulse-amber border-amber bg-amber/10 text-[color:var(--amber)]"
                        >
                          <AlertCircle className="size-3" /> Kuota terbatas!
                        </Badge>
                      )}
                    </div>
                    <Progress value={quotaPct} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">
                        Sisa: {sisaKuota} slot
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {quotaPct}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="ghost" onClick={onBack} className="rounded-full">
                  <ArrowLeft className="size-4" /> Kembali
                </Button>
                {kuotaPenuh ? (
                  <p className="text-sm font-medium text-[color:var(--pending)]">
                    Kuota penuh — pantau Instagram untuk event berikutnya.
                  </p>
                ) : (
                  <Button
                    onClick={() => setStep(2)}
                    className="rounded-full"
                    size="lg"
                  >
                    Lanjut Isi Data <ArrowRight className="size-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ===================================================== STEP 2 */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <Card className="border-secondary shadow-lg">
              <CardHeader>
                <CardTitle className="font-display text-2xl">
                  Data Peserta
                </CardTitle>
                <CardDescription>
                  Isi data setiap orang yang ikut event. Maksimal {MAX_PESERTA} orang per pendaftaran. Setiap orang wajib diisi datanya.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Peserta count + add/remove */}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                      <Users className="size-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {pesertaList.length} peserta
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Maks. {maxOrang} orang
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-full border-secondary"
                      onClick={() => removePeserta(pesertaList.length - 1)}
                      disabled={pesertaList.length <= 1}
                      aria-label="Kurangi peserta"
                    >
                      <Minus className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 rounded-full border-secondary"
                      onClick={addPeserta}
                      disabled={pesertaList.length >= maxOrang}
                      aria-label="Tambah peserta"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                {/* Peserta forms */}
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {pesertaList.map((peserta, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <PesertaCard
                          index={idx}
                          peserta={peserta}
                          canRemove={pesertaList.length > 1}
                          onRemove={() => removePeserta(idx)}
                          onChange={(field, value) => updatePeserta(idx, field, value)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Add person button (alternative to +) */}
                {pesertaList.length < maxOrang && (
                  <button
                    type="button"
                    onClick={addPeserta}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-secondary bg-secondary/20 px-4 py-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
                  >
                    <Plus className="size-4" />
                    Tambah Peserta ({pesertaList.length}/{maxOrang})
                  </button>
                )}

                <Separator />

                {/* Real-time total */}
                <div className="rounded-xl bg-secondary/40 p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Total (belum termasuk kode unik)
                  </p>
                  <p className="mt-1 font-mono text-4xl font-semibold text-primary">
                    {formatIDR(hargaDasarCalc)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {jumlahOrang} orang × {formatIDR(activeEvent.harga)} ={" "}
                    {formatIDR(hargaDasarCalc)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kode unik 3 digit akan ditambahkan di langkah pembayaran
                    untuk verifikasi otomatis.
                  </p>
                </div>
              </CardContent>

              <CardContent className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="rounded-full"
                >
                  <ArrowLeft className="size-4" /> Kembali
                </Button>
                <Button
                  onClick={handleDaftar}
                  disabled={!formValid || submitting}
                  className="rounded-full"
                  size="lg"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Memproses…
                    </>
                  ) : (
                    <>
                      Lanjut ke Pembayaran <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ===================================================== STEP 3 */}
        {step === 3 && daftarResponse && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            {/* Success banner */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="mb-6 overflow-hidden rounded-2xl border-2 border-[var(--success)]/30 bg-gradient-to-br from-[var(--success)]/10 to-[var(--success)]/5 p-6 text-center shadow-lg"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.2, type: "spring" }}
                className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-[var(--success)] text-white shadow-lg"
              >
                <CheckCircle2 className="size-9" />
              </motion.div>
              <h2 className="font-display text-2xl font-bold text-foreground">
                Berhasil Terdaftar!
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pendaftaran kamu untuk <strong>{daftarResponse.eventJudul}</strong> telah tersimpan.
                Selesaikan pembayaran untuk konfirmasi slot.
              </p>

              {/* WhatsApp group link */}
              {daftarResponse.linkGrupWa && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                  className="mt-4"
                >
                  <Button
                    onClick={handleJoinGrupWa}
                    size="lg"
                    className="w-full gap-2 rounded-full bg-[#25D366] text-white shadow-md hover:bg-[#1ebe5d] sm:w-auto"
                  >
                    <Users className="size-4" />
                    Gabung Grup WhatsApp
                    <ExternalLink className="size-3.5" />
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Gabung grup WhatsApp untuk info dan koordinasi event.
                  </p>
                </motion.div>
              )}
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* LEFT — payment instructions */}
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-xl font-semibold">
                    Selesaikan Pembayaran
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Scan QRIS atau transfer ke rekening tertera. Transfer PERSIS
                    sampai 3 digit terakhir.
                  </p>
                </div>

                {/* QRIS */}
                <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-secondary bg-card p-4 shadow-sm">
                  <img
                    src="/qris-placeholder.png"
                    alt="QRIS Saratrasaa"
                    className="mx-auto max-w-[220px] w-full rounded-lg"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Scan QRIS via GoPay / OVO / Dana / ShopeePay / BCA /
                    m-banking
                  </p>
                </div>

                {/* Nominal display — critical UX */}
                <div className="space-y-3 rounded-xl border-2 border-primary/30 bg-card p-5 shadow-md">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Nominal yang harus ditransfer
                  </p>
                  <NominalDisplay
                    hargaDasar={daftarResponse.hargaDasar}
                    kodeUnik={daftarResponse.kodeUnik}
                  />
                  <div className="flex items-start gap-2 rounded-lg bg-secondary/50 p-3">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-[color:var(--amber)]" />
                    <p className="text-xs leading-relaxed text-foreground/80">
                      Transfer PERSIS sampai 3 digit terakhir ini, ya — supaya
                      pembayaranmu otomatis terverifikasi.
                    </p>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {daftarResponse.jumlahOrang} orang ×{" "}
                    {formatIDR(
                      Math.round(
                        daftarResponse.hargaDasar / daftarResponse.jumlahOrang,
                      ),
                    )}{" "}
                    + kode unik {daftarResponse.kodeUnik} ={" "}
                    {formatIDR(daftarResponse.totalBayar)}
                  </p>
                </div>

                {/* Kode Referensi card */}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Kode Referensi (simpan untuk cek status)
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xl font-semibold text-foreground">
                      {daftarResponse.kodeReferensi}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSalinKode}
                    className="shrink-0 rounded-full border-primary/30"
                  >
                    {copied ? (
                      <>
                        <Check className="size-4 text-[color:var(--success)]" />{" "}
                        Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" /> Salin
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* RIGHT — optional bukti upload + summary */}
              <div className="space-y-4">
                <Card className="border-secondary">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Unggah Bukti Transfer (Opsional)
                    </CardTitle>
                    <CardDescription>
                      JPG, PNG, atau PDF. Maksimal 2 MB.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_MIME.join(",")}
                      onChange={handleFileChange}
                      className="hidden"
                      id="bukti-upload"
                    />
                    {!uploadedUrl ? (
                      <label
                        htmlFor="bukti-upload"
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-secondary bg-secondary/20 px-4 py-8 text-center transition-colors hover:bg-secondary/40",
                          uploading && "pointer-events-none opacity-60",
                        )}
                      >
                        {uploading ? (
                          <Loader2 className="size-6 animate-spin text-primary" />
                        ) : (
                          <Upload className="size-6 text-primary" />
                        )}
                        <span className="text-sm font-medium">
                          {uploading
                            ? "Mengunggah…"
                            : "Klik untuk pilih file"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          JPG / PNG / PDF, maks. 2 MB
                        </span>
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--success)]/30 bg-[color:var(--success)]/5 p-3">
                        {uploadedUrl.toLowerCase().endsWith(".pdf") ? (
                          <div className="flex size-12 items-center justify-center rounded-lg bg-secondary">
                            <FileText className="size-6 text-primary" />
                          </div>
                        ) : (
                          <img
                            src={uploadedUrl}
                            alt="Pratinjau bukti transfer"
                            className="size-12 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            <Check className="size-4 text-[color:var(--success)]" />{" "}
                            Bukti terunggah
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {uploadedUrl}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Ganti
                        </Button>
                      </div>
                    )}
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Verifikasi otomatis biasanya beberapa menit setelah
                      transfer. Cek status kapan saja di halaman Cek Status.
                    </p>
                  </CardContent>
                </Card>

                {/* Peserta summary */}
                <div className="rounded-xl bg-card p-4 text-sm shadow-sm">
                  <p className="font-medium flex items-center gap-2">
                    <Users className="size-4 text-primary" />
                    Peserta Terdaftar ({pesertaList.length}):
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {pesertaList.map((p, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {i + 1}
                        </span>
                        <span className="font-medium text-foreground">
                          {p.namaLengkap.trim() || `Peserta ${i + 1}`}
                        </span>
                        {p.namaPanggilan.trim() && (
                          <span className="text-muted-foreground">
                            ({p.namaPanggilan.trim()})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Event info reminder */}
                <div className="rounded-xl bg-card p-4 text-sm">
                  <p className="font-medium">Event terdaftar:</p>
                  <p className="mt-1 font-display text-base font-semibold">
                    {daftarResponse.eventJudul}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTanggal(daftarResponse.eventTanggal)} —{" "}
                    {daftarResponse.eventLokasi}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom actions */}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                onClick={onBack}
                className="rounded-full"
              >
                <ArrowLeft className="size-4" /> Kembali ke Beranda
              </Button>
              <Button
                onClick={handleCekStatus}
                className="rounded-full"
                size="lg"
              >
                Cek Status Pembayaran <ArrowRight className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-component: per-peserta form card
// -----------------------------------------------------------------------
function PesertaCard({
  index,
  peserta,
  canRemove,
  onRemove,
  onChange,
}: {
  index: number;
  peserta: PesertaForm;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (field: keyof PesertaForm, value: string) => void;
}) {
  const namaValid = peserta.namaLengkap.trim().length >= 2;
  const panggilanValid = peserta.namaPanggilan.trim().length >= 1;
  const waValid = WA_RE.test(peserta.nomorWa.trim());

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {index + 1}
          </div>
          <span className="font-display text-base font-semibold text-foreground">
            Peserta {index + 1}
          </span>
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Hapus peserta ${index + 1}`}
          >
            <Trash2 className="size-3.5" />
            Hapus
          </Button>
        )}
      </div>

      {/* Form fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Nama Lengkap */}
        <div className="space-y-1.5">
          <Label htmlFor={`namaLengkap-${index}`} className="text-sm font-medium">
            Nama Lengkap
          </Label>
          <Input
            id={`namaLengkap-${index}`}
            value={peserta.namaLengkap}
            onChange={(e) => onChange("namaLengkap", e.target.value)}
            placeholder="Nama lengkap sesuai KTP"
            autoComplete="name"
            aria-invalid={peserta.namaLengkap.length > 0 && !namaValid}
            className="h-11"
          />
          {peserta.namaLengkap.length > 0 && !namaValid && (
            <p className="text-xs text-destructive">
              Nama lengkap minimal 2 karakter.
            </p>
          )}
        </div>

        {/* Nama Panggilan */}
        <div className="space-y-1.5">
          <Label htmlFor={`namaPanggilan-${index}`} className="text-sm font-medium">
            Nama Panggilan
          </Label>
          <Input
            id={`namaPanggilan-${index}`}
            value={peserta.namaPanggilan}
            onChange={(e) => onChange("namaPanggilan", e.target.value)}
            placeholder="Nama panggilan sehari-hari"
            aria-invalid={peserta.namaPanggilan.length > 0 && !panggilanValid}
            className="h-11"
          />
          {peserta.namaPanggilan.length > 0 && !panggilanValid && (
            <p className="text-xs text-destructive">
              Nama panggilan wajib diisi.
            </p>
          )}
        </div>

        {/* Instagram (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor={`instagram-${index}`} className="text-sm font-medium">
            Instagram{" "}
            <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              @
            </span>
            <Input
              id={`instagram-${index}`}
              value={peserta.instagram}
              onChange={(e) => onChange("instagram", e.target.value.replace(/^@/, ""))}
              placeholder="username_ig"
              autoComplete="username"
              className="h-11 pl-7"
            />
          </div>
        </div>

        {/* Nomor WhatsApp */}
        <div className="space-y-1.5">
          <Label htmlFor={`nomorWa-${index}`} className="text-sm font-medium">
            Nomor WhatsApp
          </Label>
          <Input
            id={`nomorWa-${index}`}
            value={peserta.nomorWa}
            onChange={(e) => onChange("nomorWa", e.target.value)}
            placeholder="081234567890 atau +6281234567890"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={peserta.nomorWa.length > 0 && !waValid}
            className="h-11"
          />
          {peserta.nomorWa.length > 0 && !waValid && (
            <p className="text-xs text-destructive">
              Format tidak valid. Contoh: 081234567890.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Sub-component: nominal display with kode_unik highlight.
// -----------------------------------------------------------------------
function NominalDisplay({
  hargaDasar,
  kodeUnik,
}: {
  hargaDasar: number;
  kodeUnik: number;
}) {
  const baseThousands = Math.floor(hargaDasar / 1000);
  const baseLabel = formatNumber(baseThousands);
  const kodeLabel = String(kodeUnik).padStart(3, "0");
  return (
    <p className="font-mono text-5xl font-bold leading-none tracking-tight text-foreground sm:text-6xl">
      <span className="text-muted-foreground">Rp </span>
      {baseLabel}.
      <span className="text-[color:var(--amber)] text-6xl underline decoration-2 underline-offset-4 sm:text-7xl">
        {kodeLabel}
      </span>
    </p>
  );
}
