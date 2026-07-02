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

import { useMemo, useRef, useState, useEffect } from "react";
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
  Download,
  RefreshCw,
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
  loading?: boolean; // true while fetching active event
  onBack: () => void; // back to beranda
}

const WA_RE = /^08[1-9][0-9]{6,11}$/;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB — matches validateUpload
const ACCEPTED_MIME = ["image/jpeg", "image/png", "application/pdf"];
const MAX_PESERTA = 5;

/** Per-person data structure. */
interface PesertaForm {
  namaLengkap: string;
  namaPanggilan: string;
  umur: string;
  alamat: string;
  instagram: string;
  nomorWa: string;
  fotoDiriFile: File | null;
  fotoDiriPreview: string | null;
}

function emptyPeserta(): PesertaForm {
  return { namaLengkap: "", namaPanggilan: "", umur: "", alamat: "", instagram: "", nomorWa: "", fotoDiriFile: null, fotoDiriPreview: null };
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

export function DaftarWizard({ activeEvent, loading: isLoading, onBack }: DaftarWizardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<1 | 2 | "otp" | 3>(1);
  const [timeLeft, setTimeLeft] = useState<number>(300);
  // Step 2 form state — array of peserta (1–5)
  const [pesertaList, setPesertaList] = useState<PesertaForm[]>([emptyPeserta()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // OTP State
  const [otpInput, setOtpInput] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = window.setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => window.clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Recovery Step 3
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("srt_payment");
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data && data.kodeReferensi && data.expiredAt) {
            const now = new Date().getTime();
            const exp = new Date(data.expiredAt).getTime();
            if (now > exp) {
              setPaymentStatus("expired");
            } else {
              const diffSecs = Math.floor((exp - now) / 1000);
              setTimeLeft(Math.min(diffSecs, 300));
            }
            // Mock a minimal DaftarResponse to satisfy UI requirements
            setDaftarResponse({
              kodeReferensi: data.kodeReferensi,
              trxId: data.trxId,
              qrImageUrl: data.qrImageUrl,
              expiredAt: data.expiredAt,
              totalBayar: data.totalBayar,
              // Fallbacks if data doesn't have it (UI will show blanks but won't crash)
              eventJudul: activeEvent?.judul || "Event Saratrasaa",
              eventTanggal: activeEvent?.tanggal || new Date().toISOString().split('T')[0],
              eventLokasi: activeEvent?.lokasi || "-",
              hargaDasar: data.totalBayar,
              jumlahOrang: 1, // fallback
              linkGrupWa: activeEvent?.linkGrupWa || null
            });

            if (data.peserta && Array.isArray(data.peserta)) {
              const restoredPeserta = data.peserta.map((p: any) => ({
                ...emptyPeserta(),
                namaLengkap: p.namaLengkap,
                fotoDiriFile: p.uploaded ? new File([], "dummy") : null
              }));
              setPesertaList(restoredPeserta);

              const uploads: Record<number, string> = {};
              data.peserta.forEach((p: any, idx: number) => {
                if (p.uploaded) uploads[idx] = "success";
              });
              setUploadedSelfies(uploads);
            }
            setStep(3);
          }
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Step 3 state
  const [daftarResponse, setDaftarResponse] = useState<DaftarResponse | null>(
    null,
  );
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "success" | "expired" | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadingSelfies, setUploadingSelfies] = useState<Record<number, boolean>>({});
  const [uploadedSelfies, setUploadedSelfies] = useState<Record<number, string>>({});
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
      const umurVal = parseInt(p.umur);
      const isUmurValid = !isNaN(umurVal) && umurVal >= 5 && umurVal <= 100;
      return (
        p.namaLengkap.trim().length >= 2 &&
        p.namaPanggilan.trim().length >= 1 &&
        isUmurValid &&
        p.alamat.trim().length >= 3 &&
        p.instagram.trim().length >= 1 &&
        WA_RE.test(p.nomorWa.trim()) &&
        p.fotoDiriFile !== null
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
  async function handleLanjutKeOtp(isResend = false) {
    if (!activeEvent || !formValid || submitting) return;
    if (isResend && resendCooldown > 0) return;

    setSubmitting(true);
    try {
      const nomorWa = pesertaList[0].nomorWa.trim();
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomorWa }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(`Kode OTP ${isResend ? 'dikirim ulang' : 'dikirim'} ke WhatsApp ${nomorWa}`);
        setStep("otp");
        setResendCooldown(60);
      } else {
        toast.error(data?.error || "Gagal mengirim OTP.");
      }
    } catch (err) {
      console.error("[DaftarWizard] /api/otp/send error", err);
      toast.error("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifikasiOtp() {
    if (otpInput.trim().length !== 6 || verifyingOtp) return;
    setVerifyingOtp(true);
    try {
      const nomorWa = pesertaList[0].nomorWa.trim();
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomorWa, otp: otpInput.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success("Nomor WhatsApp berhasil diverifikasi!");
        await handleDaftar();
      } else {
        toast.error(data?.error || "Kode OTP salah atau kedaluwarsa.");
      }
    } catch (err) {
      console.error("[DaftarWizard] /api/otp/verify error", err);
      toast.error("Terjadi kesalahan verifikasi.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleDaftar() {
    if (!activeEvent) return;
    setSubmitting(true);
    try {
      const payload = {
        idEvent: activeEvent.id,
        peserta: pesertaList.map((p) => ({
          namaLengkap: p.namaLengkap.trim(),
          namaPanggilan: p.namaPanggilan.trim(),
          umur: parseInt(p.umur) || 0,
          alamat: p.alamat.trim(),
          instagram: p.instagram.trim(),
          nomorWa: p.nomorWa.trim(),
        })),
      };
      const res = await fetch("/api/daftar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | (DaftarResponse & { error?: string })
        | { error?: string }
        | null;

      if (res.status === 201 && data && "kodeReferensi" in data) {
        setDaftarResponse(data);
        
        // Simpan ke sessionStorage untuk recovery (Skenario 2 & 3F)
        const localExpiredAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const photoStatuses = pesertaList.map(p => ({
          namaLengkap: p.namaLengkap,
          uploaded: p.fotoDiriFile !== null
        }));

        const sessionData = {
          kodeReferensi: data.kodeReferensi,
          trxId: data.trxId,
          qrImageUrl: data.qrImageUrl,
          expiredAt: localExpiredAt,
          totalBayar: data.totalBayar,
          peserta: photoStatuses,
        };
        sessionStorage.setItem("srt_payment", JSON.stringify(sessionData));

        // Cek apakah ada peserta dengan foto diri yang dipilih
        const hasSelfie = pesertaList.some(p => p.fotoDiriFile !== null);
        if (hasSelfie) {
          toast.loading("Menyimpan foto peserta...", { id: "upload-selfie" });
          const uploadPromises = pesertaList.map(async (p, idx) => {
            if (!p.fotoDiriFile) return;
            try {
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Gagal membaca file"));
                reader.readAsDataURL(p.fotoDiriFile!);
              });

              const upRes = await fetch("/api/upload-selfie", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kodeReferensi: data.kodeReferensi,
                  urutan: idx + 1,
                  file: dataUrl,
                }),
              });
              if (!upRes.ok) throw new Error("Gagal upload");
              setUploadedSelfies(prev => ({ ...prev, [idx]: "success" }));
            } catch (e) {
              setUploadedSelfies(prev => ({ ...prev, [idx]: "error" }));
              toast.error(`Gagal menyimpan foto ${p.namaPanggilan}`);
            }
          });

          await Promise.allSettled(uploadPromises);
          toast.dismiss("upload-selfie");
        }

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
      toast.error((data && data.error) || "Terjadi kesalahan. Coba lagi ya.");
    } catch (err) {
      console.error("[DaftarWizard] /api/daftar error", err);
      toast.error("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setSubmitting(false);
    }
  }

  function startPolling(trxId: string, kodeReferensi: string) {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        // Cek YoBasePay public
        try {
          const ybRes = await fetch(`https://yobasepay.net/api.php?action=check_public&trxid=${encodeURIComponent(trxId)}`);
          if (ybRes.ok) {
            const ybData = await ybRes.json();
            if (ybData.status === true || ybData.status === 1) {
              const status = ybData.data?.status;
              if (status === "SUCCESS" || status === "PAID") {
                await fetch("/api/konfirmasi-pembayaran", {
                  method: "POST",
                  body: JSON.stringify({ trxId, kodeReferensi }),
                  headers: { "Content-Type": "application/json" }
                });
              }
            }
          }
        } catch (e) {
          // ignore yobasepay fetch errors
        }

        const res = await fetch(`/api/cek-status?kode=${kodeReferensi}`);
        if (res.ok) {
          const data = await res.json();
          const status = data?.pendaftar?.status;

          if (status === "verified") {
            clearInterval(pollingRef.current!);
            setPaymentStatus("success");
            toast.success("Pembayaran terverifikasi! 🎉");
          } else if (status === "failed" || status === "rejected") {
            clearInterval(pollingRef.current!);
            setPaymentStatus("expired");
          }
        }
      } catch {
        // Silent fail — terus poll
      }
    }, 2000);
  }

  // Cleanup saat unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // Timer untuk Step 3 (5 menit)
  useEffect(() => {
    let timerId: number;
    if (step === 3 && timeLeft > 0 && paymentStatus !== "success" && paymentStatus !== "expired") {
      timerId = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && paymentStatus !== "success") {
      setPaymentStatus("expired");
    }
    return () => window.clearInterval(timerId);
  }, [step, timeLeft, paymentStatus]);

  // Auto-cancel pendaftaran ketika expired agar kuota kembali
  useEffect(() => {
    if (paymentStatus === "expired" && daftarResponse?.kodeReferensi) {
      fetch("/api/cancel-pendaftaran", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kodeReferensi: daftarResponse.kodeReferensi }),
      }).catch((err) => console.error("Gagal auto-cancel pendaftaran", err));
    }
  }, [paymentStatus, daftarResponse]);

  // Start polling saat masuk step 3
  useEffect(() => {
    if (step === 3 && daftarResponse?.trxId && paymentStatus !== "success" && paymentStatus !== "expired") {
      startPolling(daftarResponse.trxId, daftarResponse.kodeReferensi);
    }
  }, [step, daftarResponse, paymentStatus]);

  function handleDaftarUlang() {
    sessionStorage.removeItem("srt_payment");
    setPaymentStatus(null);
    setDaftarResponse(null);
    setStep(1);
    setPesertaList([emptyPeserta()]);
    setTimeLeft(300);
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

  async function handleSelfieChange(e: React.ChangeEvent<HTMLInputElement>, urutan: number) {
    const file = e.target.files?.[0];
    if (!file || !daftarResponse) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Ukuran foto melebihi 2 MB.`);
      e.target.value = "";
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error(`Format foto harus JPG atau PNG.`);
      e.target.value = "";
      return;
    }

    setUploadingSelfies(prev => ({ ...prev, [urutan]: true }));
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Gagal membaca file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/upload-selfie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kodeReferensi: daftarResponse.kodeReferensi,
          urutan,
          file: dataUrl,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;

      if (res.ok && data && data.ok && data.url) {
        setUploadedSelfies(prev => ({ ...prev, [urutan]: data.url as string }));
        toast.success(`Foto diri peserta ${urutan} terunggah.`);
      } else {
        const msg = (data && data.error) || `Gagal mengunggah foto peserta ${urutan}.`;
        toast.error(msg);
      }
    } catch (err) {
      console.error("[DaftarWizard] /api/upload-selfie error", err);
      toast.error(`Gagal mengunggah foto peserta ${urutan}.`);
    } finally {
      setUploadingSelfies(prev => ({ ...prev, [urutan]: false }));
      e.target.value = "";
    }
  }

  const handleRefreshPayment = async () => {
    if (!daftarResponse?.kodeReferensi || !daftarResponse?.trxId) return;
    setIsRefreshing(true);
    try {
      try {
        const ybRes = await fetch(`https://yobasepay.net/api.php?action=check_public&trxid=${encodeURIComponent(daftarResponse.trxId)}`);
        if (ybRes.ok) {
          const ybData = await ybRes.json();
          if (ybData.status === true || ybData.status === 1) {
            const status = ybData.data?.status;
            if (status === "SUCCESS" || status === "PAID") {
              await fetch("/api/konfirmasi-pembayaran", {
                method: "POST",
                body: JSON.stringify({ trxId: daftarResponse.trxId, kodeReferensi: daftarResponse.kodeReferensi }),
                headers: { "Content-Type": "application/json" }
              });
            }
          }
        }
      } catch (e) {
        console.warn("YoBasePay check error", e);
      }

      const res = await fetch(`/api/cek-status?kode=${daftarResponse.kodeReferensi}`);
      if (res.ok) {
        const data = await res.json();
        const status = data?.pendaftar?.status;
        if (status === "verified") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPaymentStatus("success");
          toast.success("Pembayaran terverifikasi! 🎉");
        } else if (status === "failed" || status === "rejected") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPaymentStatus("expired");
        } else {
          toast.info("Pembayaran belum diterima. Coba lagi nanti.");
        }
      }
    } catch {
      toast.error("Gagal mengecek status pembayaran.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadQR = async () => {
    if (!daftarResponse?.qrImageUrl) return;
    try {
      const res = await fetch(daftarResponse.qrImageUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `QRIS-Saratrasaa-${daftarResponse.kodeReferensi}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Gagal mengunduh QR Code.");
    }
  };

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
  // Loading state — skeleton while fetching active event
  // ---------------------------------------------------------------------
  if (!isMounted) return null;

  if (isLoading) {
    return (
      <Card className="mx-auto max-w-4xl border-secondary bg-card">
        <div className="relative overflow-hidden bg-gradient-to-b from-secondary to-background px-6 py-8">
          <div className="space-y-3">
            <div className="h-4 w-32 animate-pulse rounded bg-secondary/60" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-secondary/60" />
            <div className="flex gap-3">
              <div className="h-4 w-40 animate-pulse rounded bg-secondary/60" />
              <div className="h-4 w-32 animate-pulse rounded bg-secondary/60" />
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 pt-6">
          <div className="h-4 w-full animate-pulse rounded bg-secondary/60" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-secondary/60" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-secondary/60" />
          <Separator />
          <div className="flex items-baseline justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-secondary/60" />
            <div className="h-8 w-32 animate-pulse rounded bg-secondary/60" />
          </div>
          <div className="h-3 w-full animate-pulse rounded bg-secondary/60" />
          <div className="flex items-center justify-between pt-4">
            <div className="h-10 w-28 animate-pulse rounded-full bg-secondary/60" />
            <div className="h-10 w-40 animate-pulse rounded-full bg-secondary/60" />
          </div>
        </CardContent>
      </Card>
    );
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
          const stepNum = step === "otp" ? 2.5 : step;
          const isCurrent = stepNum === s.n || (stepNum === 2.5 && s.n === 2); // 'otp' highlights step 2 or we can just leave it as isCurrent = false for steps. Let's make it highlight step 2.
          const isCompleted = stepNum > s.n && !isCurrent;
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
                      stepNum > s.n ? "scale-x-100" : "scale-x-0",
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
              <div className="flex flex-col md:flex-row bg-gradient-to-b from-secondary to-background">
                {activeEvent.fotoCover && activeEvent.fotoCover.trim() !== "" && (
                  <div className="w-full md:w-1/3 shrink-0 bg-secondary/50 p-4 flex items-center justify-center">
                    <img
                      src={activeEvent.fotoCover}
                      alt={activeEvent.judul}
                      className="max-h-[250px] w-auto rounded-lg object-contain shadow-sm border border-secondary"
                      decoding="async"
                    />
                  </div>
                )}
                <div className="flex-1 px-6 py-8 flex flex-col justify-center">
                  <p className="text-xs font-medium uppercase tracking-wider text-primary">
                    Pendaftaran Relawan
                  </p>
                  <h2 className="mt-1 font-display text-3xl font-semibold leading-tight">
                    {activeEvent.judul}
                  </h2>
                  <div className="mt-3 flex flex-col gap-1.5 text-sm text-foreground/80">
                    <p className="flex items-center gap-2">
                      <MapPin className="size-4 shrink-0" />{" "}
                      {formatTanggal(activeEvent.tanggal)}
                    </p>
                    <p className="flex items-start gap-2">
                      <MapPin className="size-4 shrink-0 mt-0.5" />{" "}
                      <span className="leading-tight">{activeEvent.lokasi}</span>
                    </p>
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
                      className="size-11 md:size-10 rounded-full border-secondary"
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
                      className="size-11 md:size-10 rounded-full border-secondary"
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
                    Total
                  </p>
                  <p className="mt-1 font-mono text-4xl font-semibold text-primary">
                    {formatIDR(hargaDasarCalc)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {jumlahOrang} orang × {formatIDR(activeEvent.harga)} ={" "}
                    {formatIDR(hargaDasarCalc)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Biaya akan diverifikasi secara otomatis melalui QRIS Yobasepay.
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
                  onClick={() => handleLanjutKeOtp(false)}
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

        {/* ===================================================== STEP OTP */}
        {step === "otp" && (
          <motion.div
            key="stepOtp"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-auto max-w-md"
          >
            <Card className="border-secondary text-center shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl">Verifikasi Nomor WhatsApp</CardTitle>
                <CardDescription>
                  Masukkan 6 digit kode OTP yang telah dikirim ke nomor WhatsApp <br />
                  <b>{pesertaList[0].nomorWa}</b>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex justify-center">
                  <Input
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="______"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="h-14 w-40 text-center text-3xl font-bold tracking-widest"
                    maxLength={6}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleVerifikasiOtp}
                    disabled={otpInput.length !== 6 || verifyingOtp || submitting}
                    className="w-full rounded-full"
                    size="lg"
                  >
                    {verifyingOtp ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Memverifikasi...
                      </>
                    ) : (
                      "Verifikasi & Daftar"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleLanjutKeOtp(true)}
                    disabled={resendCooldown > 0 || verifyingOtp || submitting}
                    className="w-full rounded-full"
                  >
                    {resendCooldown > 0
                      ? `Kirim Ulang OTP (${resendCooldown}s)`
                      : "Kirim Ulang Kode"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setStep(2)}
                    className="text-xs text-muted-foreground"
                    disabled={verifyingOtp || submitting}
                  >
                    Batal / Ganti Nomor WhatsApp
                  </Button>
                </div>
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
            className="mx-auto max-w-2xl"
          >
            {/* 1. SUCCESS STATE */}
            {paymentStatus === "success" && (
              <Card className="border-[var(--success)]/30 overflow-hidden shadow-xl text-center">
                <div className="h-2 bg-[color:var(--success)]" />
                <CardContent className="pt-10 pb-10 px-6">
                  <div className="relative">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.7, type: "spring", bounce: 0.5 }}
                      className="mx-auto mb-5 flex size-24 items-center justify-center rounded-full bg-[var(--success)] text-white shadow-lg shadow-[var(--success)]/40 relative z-10"
                    >
                      <CheckCircle2 className="size-12" />
                    </motion.div>
                    
                    {/* Simple CSS-based ping ring */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-[var(--success)] animate-ping opacity-20 pointer-events-none" />
                  </div>

                  <h2 className="font-display text-3xl font-bold text-foreground">
                    Pembayaran Berhasil!
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
                    Tiket <strong>{daftarResponse.eventJudul}</strong> kamu sudah diamankan.
                  </p>

                  <div className="mt-6 p-5 rounded-xl bg-secondary/30 border border-secondary border-dashed flex flex-col items-center gap-2 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--success)]/50 to-transparent" />
                    <p className="text-xs font-semibold uppercase text-muted-foreground tracking-widest">Kode Pendaftaran Anda</p>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-primary flex items-center gap-3"
                    >
                      {daftarResponse.kodeReferensi}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="size-8 rounded-full hover:bg-primary/10 text-primary"
                        onClick={() => {
                          navigator.clipboard.writeText(daftarResponse.kodeReferensi || "");
                          toast.success("Kode disalin!");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </motion.div>
                    <p className="text-xs text-muted-foreground mt-1">
                      (Harap simpan atau screenshot kode ini)
                    </p>
                  </div>
                  
                  <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
                    <Button onClick={handleCekStatus} size="lg" className="rounded-full shadow-md px-8 text-base">
                      Lihat Tiket Saya <ArrowRight className="ml-2 size-4" />
                    </Button>
                    {daftarResponse.linkGrupWa && (
                      <Button onClick={handleJoinGrupWa} size="lg" variant="outline" className="rounded-full border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 px-8 text-base">
                        <Users className="mr-2 size-4" /> Grup WhatsApp
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. EXPIRED STATE */}
            {paymentStatus === "expired" && (
              <Card className="border-[color:var(--destructive)]/30 overflow-hidden shadow-xl text-center">
                <div className="h-2 bg-[color:var(--destructive)]" />
                <CardContent className="pt-10 pb-10 px-6">
                  <AlertCircle className="size-20 mx-auto text-[color:var(--destructive)]/80 mb-5" />
                  <h2 className="font-display text-3xl font-bold text-foreground">
                    Waktu Pembayaran Habis
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                    Batas waktu 5 menit telah berlalu dan pendaftaran dibatalkan secara otomatis. Jika kamu masih ingin mendaftar, silakan daftar ulang. Jika kamu sudah transfer tepat waktu, silakan cek status pendaftaran.
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button onClick={handleDaftarUlang} size="lg" className="rounded-full px-8 bg-pink-primary hover:bg-pink-primary/90">
                      Daftar Ulang
                    </Button>
                    <Button onClick={handleCekStatus} size="lg" variant="outline" className="rounded-full px-8">
                      Cek Status / Upload Bukti <ArrowRight className="ml-2 size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 3. PENDING STATE (PAYMENT) */}
            {paymentStatus !== "success" && paymentStatus !== "expired" && (
              <Card className="border-secondary overflow-hidden shadow-xl relative">
                {/* SIMPAN KODE INI SEKARANG Box */}
                <div className="bg-pink-soft/80 border-b border-pink-primary/30 p-5 text-center flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-5 text-pink-primary" />
                    <span className="font-bold text-pink-primary uppercase tracking-wide text-sm">
                      Simpan Kode Ini Sekarang
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <span className="font-mono text-3xl font-bold tracking-wider text-foreground">
                      {daftarResponse.kodeReferensi}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSalinKode}
                      className="rounded-full border-pink-primary/40 hover:bg-pink-primary/10 text-pink-primary"
                    >
                      {copied ? (
                        <><Check className="size-4" /> Tersalin</>
                      ) : (
                        <><Copy className="size-4" /> Salin</>
                      )}
                    </Button>
                  </div>
                </div>

                <CardContent className="pt-8 space-y-8">
                  {/* Info Event & Total */}
                  <div className="text-center space-y-2">
                    <h3 className="font-display text-2xl font-bold">{daftarResponse.eventJudul}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatTanggal(daftarResponse.eventTanggal)} — {daftarResponse.eventLokasi} ({daftarResponse.jumlahOrang} Orang)
                    </p>
                    <p className="font-mono text-4xl font-semibold text-primary mt-4 mb-2">
                      {formatIDR(daftarResponse.totalBayar)}
                    </p>
                    <p className="text-xs text-muted-foreground mx-auto max-w-[280px] leading-relaxed">
                      *Nominal sudah termasuk kode unik dan <strong>wajib ditransfer persis sesuai nominal di atas</strong> (angka tidak selalu bulat).
                    </p>
                  </div>

                  {/* QRIS Yobasepay */}
                  <div className="mx-auto w-fit p-1.5 rounded-2xl bg-gradient-to-br from-pink-primary/30 via-pink-soft/50 to-amber/30 shadow-lg relative">
                    <div className="bg-background rounded-xl p-5 border border-pink-primary/20 flex flex-col items-center">
                      <div className="font-display font-bold text-lg text-pink-primary mb-3">
                        SARATRASAA
                      </div>
                      
                      <div className="relative">
                        {daftarResponse.qrImageUrl ? (
                          <img
                            src={daftarResponse.qrImageUrl}
                            alt="QR Yobasepay"
                            className="w-[240px] h-[240px] rounded-lg object-cover bg-white shadow-sm border border-border"
                          />
                        ) : (
                          <div className="flex h-[240px] w-[240px] items-center justify-center rounded-lg bg-secondary/30">
                            <Loader2 className="size-10 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Scan via QRIS
                      </div>
                      
                      {daftarResponse.qrImageUrl && (
                        <Button 
                          onClick={handleDownloadQR} 
                          variant="outline" 
                          size="sm" 
                          className="mt-4 rounded-full border-pink-primary/30 text-pink-primary hover:bg-pink-soft/20"
                        >
                          <Download className="size-4 mr-2" /> Simpan QR
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Timer & Polling */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <div className="rounded-xl bg-amber-500/10 p-4 flex items-center justify-center gap-3 border border-amber-500/30">
                      <div className="flex items-center gap-2 font-mono text-lg font-bold text-amber-700 dark:text-amber-400">
                        ⏱ {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                      </div>
                      <div className="h-6 w-px bg-amber-500/30"></div>
                      <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                        </span>
                        Menunggu...
                      </div>
                    </div>
                    <Button 
                      onClick={handleRefreshPayment} 
                      variant="secondary" 
                      className="rounded-xl h-14 px-5 border border-border shrink-0"
                      disabled={isRefreshing}
                    >
                      <RefreshCw className={cn("size-4 mr-2", isRefreshing && "animate-spin")} /> 
                      {isRefreshing ? "Mengecek..." : "Perbarui Status"}
                    </Button>
                  </div>

                  {/* Status Foto Diri */}
                  <div className="rounded-xl border border-border p-4 bg-secondary/10">
                    <p className="text-sm font-semibold mb-3 text-foreground">Foto diri peserta:</p>
                    <ul className="space-y-2">
                      {pesertaList.map((p, idx) => {
                        const status = uploadedSelfies[idx]; // 'success' or 'error'
                        let icon = null;
                        if (p.fotoDiriFile && status === "success") {
                          icon = <span className="text-[color:var(--success)] flex items-center gap-1.5"><CheckCircle2 className="size-4" /> Terunggah</span>;
                        } else if (p.fotoDiriFile && status === "error") {
                          icon = <span className="text-[color:var(--destructive)] flex items-center gap-1.5"><AlertCircle className="size-4" /> Gagal</span>;
                        } else {
                          icon = <span className="text-muted-foreground flex items-center gap-1.5 text-xs">❌ Upload via Cek Status</span>;
                        }
                        return (
                          <li key={idx} className="flex justify-between items-center text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                            <span>{p.namaLengkap || `Peserta ${idx + 1}`}</span>
                            {icon}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Upload Bukti Manual (Collapsible) */}
                  <details className="group rounded-xl border border-border bg-card shadow-sm mt-4 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between p-4 font-semibold text-sm hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 text-muted-foreground" />
                        Sudah transfer tapi QR bermasalah?
                      </div>
                      <Plus className="size-4 text-muted-foreground transition-transform group-open:rotate-45" />
                    </summary>
                    <div className="border-t border-border p-4 space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Unggah bukti transfer atau mutasi rekening kamu di sini. Admin akan memverifikasi pembayaran kamu secara manual.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                          ref={fileInputRef}
                          id="bukti-upload-step3"
                        />
                        <label
                          htmlFor="bukti-upload-step3"
                          className={cn(
                            "inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-primary bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-6 gap-2 w-full sm:w-auto",
                            uploading && "pointer-events-none opacity-60"
                          )}
                        >
                          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                          {uploading ? "Mengunggah..." : "Pilih File"}
                        </label>
                        {uploadedUrl && (
                          <span className="text-sm font-semibold text-[color:var(--success)] flex items-center gap-2">
                            <CheckCircle2 className="size-4" /> Terunggah
                          </span>
                        )}
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}
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
  const umurVal = parseInt(peserta.umur);
  const umurValid = !isNaN(umurVal) && umurVal >= 5 && umurVal <= 100;
  const alamatValid = peserta.alamat.trim().length >= 3;
  const waValid = WA_RE.test(peserta.nomorWa.trim());

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shrink-0">
            {index + 1}
          </div>
          <span className="font-display text-base font-semibold text-foreground">
            Peserta {index + 1}
          </span>
          {index === 0 && (
            <Badge variant="outline" className="bg-pink-soft/20 text-pink-primary border-pink-primary/30">
              Pendaftar Utama / Kontak
            </Badge>
          )}
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

        {/* Umur */}
        <div className="space-y-1.5">
          <Label htmlFor={`umur-${index}`} className="text-sm font-medium">
            Umur
          </Label>
          <Input
            id={`umur-${index}`}
            type="number"
            value={peserta.umur}
            onChange={(e) => onChange("umur", e.target.value)}
            placeholder="Contoh: 20"
            aria-invalid={peserta.umur.length > 0 && !umurValid}
            className="h-11"
          />
          {peserta.umur.length > 0 && !umurValid && (
            <p className="text-xs text-destructive">
              Umur harus antara 5 dan 100 tahun.
            </p>
          )}
        </div>

        {/* Alamat */}
        <div className="space-y-1.5">
          <Label htmlFor={`alamat-${index}`} className="text-sm font-medium">
            Domisili Tinggal
          </Label>
          <Input
            id={`alamat-${index}`}
            value={peserta.alamat}
            onChange={(e) => onChange("alamat", e.target.value)}
            placeholder="Contoh: Banjarnegara"
            aria-invalid={peserta.alamat.length > 0 && !alamatValid}
            className="h-11"
          />
          {peserta.alamat.length > 0 && !alamatValid && (
            <p className="text-xs text-destructive">
              Domisili minimal 3 karakter.
            </p>
          )}
        </div>

        {/* Instagram (wajib) */}
        <div className="space-y-1.5">
          <Label htmlFor={`instagram-${index}`} className="text-sm font-medium">
            Instagram
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
              aria-invalid={peserta.instagram.length > 0 && peserta.instagram.trim().length < 1}
              className="h-11 pl-7"
            />
          </div>
          {peserta.instagram.length > 0 && peserta.instagram.trim().length < 1 && (
            <p className="text-xs text-destructive">
              Instagram wajib diisi.
            </p>
          )}
        </div>

        {/* Nomor WhatsApp */}
        <div className="space-y-1.5">
          <Label htmlFor={`nomorWa-${index}`} className="text-sm font-medium">
            Nomor WhatsApp
          </Label>
          <Input
            id={`nomorWa-${index}`}
            value={peserta.nomorWa}
            onChange={(e) => {
              let val = e.target.value;
              if (val.startsWith("+62")) val = "0" + val.substring(3);
              else if (val.startsWith("62")) val = "0" + val.substring(2);
              val = val.replace(/[^0-9]/g, "");
              onChange("nomorWa", val);
            }}
            placeholder="081234567890"
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

      {/* Foto Diri (Selfie) */}
      <div className="mt-6 rounded-lg border border-border bg-secondary/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Foto Diri (untuk co-card volunteer)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">JPG/PNG, maksimal 2MB. Bisa dilengkapi nanti.</p>
          </div>
          <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-wider">
            Opsional
          </Badge>
        </div>
        
        {peserta.fotoDiriPreview ? (
          <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-border bg-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={peserta.fotoDiriPreview} 
              alt="Preview selfie" 
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity hover:opacity-100 flex items-end justify-center p-3">
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="h-8 shadow-sm"
                  onClick={() => {
                    const el = document.getElementById(`selfie-${index}`);
                    if (el) el.click();
                  }}
                >
                  Ganti
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  className="h-8 shadow-sm"
                  onClick={() => {
                    onChange("fotoDiriFile", null as any);
                    onChange("fotoDiriPreview", null as any);
                  }}
                >
                  Hapus
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <label 
            htmlFor={`selfie-${index}`}
            className="flex aspect-[21/9] w-full max-w-sm cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background transition-colors hover:bg-secondary/40"
          >
            <Upload className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Pilih foto selfie</span>
          </label>
        )}
        <input 
          id={`selfie-${index}`}
          type="file" 
          accept="image/jpeg, image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              toast.error("Ukuran file maksimal 2 MB.");
              return;
            }
            if (!["image/jpeg", "image/png"].includes(file.type)) {
              toast.error("Hanya file JPG dan PNG yang diperbolehkan.");
              return;
            }
            const url = URL.createObjectURL(file);
            onChange("fotoDiriFile", file as any);
            onChange("fotoDiriPreview", url as any);
          }}
        />
      </div>
    </div>
  );
}

