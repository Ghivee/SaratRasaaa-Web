'use client';

/**
 * CekStatus — IDOR-safe status check page (brief §4.3, security fix #5).
 *
 * Two lookup modes, gated by Tabs:
 *   - "kode"        → single input for kode referensi (SRT-XXXXXX).
 *   - "kombinasi"   → nomor HP + nama depan (HP-only search is rejected
 *                     server-side by `validateStatusLookup` in
 *                     src/lib/security.ts — this is the IDOR fix).
 *
 * The "kombinasi" mode includes a helper line explaining WHY the nama depan
 * is required (user-facing security transparency).
 *
 * Fetches GET /api/cek-status with the right params and renders:
 *   - 200 → status-based result (pending_payment | verified | rejected).
 *   - 404 → warm "not found" card with a Search icon.
 *   - 400 → toast the server error message.
 *   - other → toast a generic retry message.
 *
 * The "verified" branch renders <TicketCard /> — the signature element.
 */

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { History, Loader2, Search, ShieldCheck, Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatIDR } from "@/lib/saratrasa";

import type { PendaftarResult } from "./types";
import { TicketCard } from "./TicketCard";
import { TicketSkeleton } from "./Skeleton";
import { VolunteerHistory } from "./VolunteerHistory";

interface CekStatusProps {
  /** Optional initial kode to prefill (e.g. from a URL param). */
  initialKode?: string;
}

type LookupMode = "kode" | "kombinasi";

export function CekStatus({ initialKode }: CekStatusProps) {
  const [mode, setMode] = React.useState<LookupMode>("kode");
  const [kode, setKode] = React.useState(initialKode ?? "");
  const [kontak, setKontak] = React.useState("");
  const [namaDepan, setNamaDepan] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PendaftarResult | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  // Volunteer history dialog (Task 9-A) — opened from the "Lihat Riwayat Saya"
  // button below the main form. Pre-filled with the current kontak + namaDepan
  // if the user has typed them on the "kombinasi" tab.
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Prefill from URL param (or any parent-supplied value).
  React.useEffect(() => {
    if (initialKode) {
      setMode("kode");
      setKode(initialKode.toUpperCase());
    }
  }, [initialKode]);

  function validateKodeMode(): string | null {
    const k = kode.trim().toUpperCase();
    if (!k) {
      toast.error("Masukkan kode referensi terlebih dahulu.");
      return null;
    }
    return k;
  }

  function validateKombinasiMode():
    | { kontak: string; nama: string }
    | null {
    const ko = kontak.trim();
    const na = namaDepan.trim();
    if (!ko || !na) {
      toast.error("Nomor HP dan nama depan wajib diisi.");
      return null;
    }
    return { kontak: ko, nama: na };
  }

  async function handleCek(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setNotFound(false);

    try {
      const params = new URLSearchParams();
      if (mode === "kode") {
        const k = validateKodeMode();
        if (!k) {
          setLoading(false);
          return;
        }
        params.set("kode", k);
      } else {
        const v = validateKombinasiMode();
        if (!v) {
          setLoading(false);
          return;
        }
        params.set("kontak", v.kontak);
        params.set("nama", v.nama);
      }

      const res = await fetch(`/api/cek-status?${params.toString()}`);

      if (res.status === 200) {
        const data = (await res.json()) as { pendaftar: PendaftarResult };
        setResult(data.pendaftar);
        return;
      }

      if (res.status === 404) {
        setNotFound(true);
        return;
      }

      if (res.status === 400) {
        let msg: string | null = null;
        try {
          const data = (await res.json()) as { error?: string };
          msg = data.error ?? null;
        } catch {
          /* swallow parse error */
        }
        toast.error(msg ?? "Input tidak valid.");
        return;
      }

      toast.error("Terjadi kesalahan. Coba lagi ya.");
    } catch (err) {
      console.error("[CekStatus]", err);
      toast.error("Terjadi kesalahan. Coba lagi ya.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      {/* Decorative background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-[24rem] rounded-full bg-[var(--amber)]/5 blur-3xl" />
      </div>

      <header className="mb-7 text-center">
        {/* Decorative accent dots */}
        <div className="mb-4 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="size-1.5 rounded-full bg-primary" />
          <span className="size-1.5 rounded-full bg-primary/60" />
          <span className="size-1.5 rounded-full bg-primary/30" />
        </div>
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          Cek Status Pendaftaran
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Punya kode referensi? Cek di sini. Lupa kode? Masukkan nomor HP + nama depan.
        </p>
      </header>

      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as LookupMode)}
        className="w-full"
      >
        <TabsList className="mx-auto grid w-full max-w-md grid-cols-2 rounded-full bg-secondary/80 p-1">
          <TabsTrigger value="kode" className="gap-1.5 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            <ShieldCheck className="size-3.5" />
            Kode Referensi
          </TabsTrigger>
          <TabsTrigger value="kombinasi" className="gap-1.5 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            <Search className="size-3.5" />
            HP + Nama Depan
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleCek} className="mt-5">
          <TabsContent value="kode" className="space-y-1.5">
            <Label htmlFor="kode" className="text-sm font-medium">Kode Referensi</Label>
            <Input
              id="kode"
              value={kode}
              onChange={(e) => setKode(e.target.value.toUpperCase())}
              placeholder="SRT-XXXXXX"
              className="h-12 rounded-xl border-secondary bg-card font-mono text-base tracking-wider shadow-sm transition-all focus-visible:ring-primary/30 focus-visible:shadow-md"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground">
              Format: <span className="font-mono font-medium">SRT-XXXXXX</span> (6 karakter setelah strip).
            </p>
          </TabsContent>

          <TabsContent value="kombinasi" className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kontak" className="text-sm font-medium">Nomor HP</Label>
              <Input
                id="kontak"
                value={kontak}
                onChange={(e) => setKontak(e.target.value)}
                placeholder="0812xxxx"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                className="h-12 rounded-xl border-secondary bg-card shadow-sm transition-all focus-visible:ring-primary/30 focus-visible:shadow-md"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="namaDepan" className="text-sm font-medium">Nama Depan</Label>
              <Input
                id="namaDepan"
                value={namaDepan}
                onChange={(e) => setNamaDepan(e.target.value)}
                placeholder="Nama depan kamu"
                autoComplete="given-name"
                maxLength={60}
                className="h-12 rounded-xl border-secondary bg-card shadow-sm transition-all focus-visible:ring-primary/30 focus-visible:shadow-md"
              />
            </div>
            <p className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              Dem keamanan data, pencarian dengan nomor HP wajib diisi nama depan juga.
            </p>
          </TabsContent>

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="btn-press mt-5 w-full rounded-full bg-primary shadow-md hover:bg-primary/90 hover:shadow-lg transition-all h-12"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Mengecek...
              </>
            ) : (
              <>
                <Search className="size-4" />
                Cek Status
              </>
            )}
          </Button>
        </form>
      </Tabs>

      {/* "Lihat Riwayat Saya" — opens the VolunteerHistory dialog (Task 9-A).
          Prefilled with whatever kontak + nama depan the user has typed on
          the "kombinasi" tab, so they don't have to re-type them. */}
      <div className="mt-5 rounded-xl border border-dashed border-secondary bg-secondary/20 p-4 text-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => setHistoryOpen(true)}
          className="btn-press gap-1.5 rounded-full border-primary/30 bg-card text-pink-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
        >
          <History className="size-4" />
          Lihat Riwayat Saya
        </Button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Sudah pernah ikut event Saratrasaa? Lihat semua riwayat pendaftaranmu di sini.
        </p>
      </div>

      <VolunteerHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        initialKontak={kontak}
        initialNama={namaDepan}
      />

      {/* Loading — TicketSkeleton mirrors the verified TicketCard layout so
          the user sees the ticket "appearing" in place rather than the
          layout collapsing and jumping when the real card arrives. */}
      {loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-6"
          aria-busy="true"
          aria-live="polite"
        >
          <TicketSkeleton />
        </motion.div>
      )}

      {/* 404 — warm not-found card with shake animation + CTA */}
      {notFound && (
        <NotFoundCard
          mode={mode}
          onLihatRiwayat={() => setHistoryOpen(true)}
        />
      )}

      {/* Result — fade-in */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-6"
        >
          <ResultView pendaftar={result} />
        </motion.div>
      )}
    </section>
  );
}

function NotFoundCard({
  mode,
  onLihatRiwayat,
}: {
  mode: LookupMode;
  onLihatRiwayat: () => void;
}) {
  const reduceMotion = useReducedMotion();

  // A friendlier not-found state than the previous tiny inline card.
  // Features:
  //   - Larger Search icon with a subtle shake animation (one-shot, ~600ms)
  //     — communicates "not quite right, try again" without being annoying.
  //   - Decorative pink blob behind the icon for warmth.
  //   - Two concrete suggestions based on which lookup mode the user was in:
  //     * kode mode      → "Cek kembali 6 karakter setelah SRT-"
  //     * kombinasi mode → "Pastikan nomor HP aktif + nama depan sesuai KTP"
  //   - "Coba Lihat Riwayat" CTA → opens the VolunteerHistory dialog so the
  //     user can browse ALL their past registrations (often the real reason
  //     they're searching — they forgot which kode belongs to which event).
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-6"
      role="status"
      aria-live="polite"
    >
      <Card className="relative overflow-hidden border-secondary bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent shadow-md">
        {/* Decorative pink blob — top-right, very faint */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-primary/8 blur-2xl"
        />
        <CardContent className="relative flex flex-col items-center gap-4 pt-8 text-center sm:items-start sm:text-left">
          {/* Larger Search icon with one-shot shake animation */}
          <div className="relative inline-flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-inset ring-primary/15">
            <Search
              className={
                "size-7 text-primary" +
                (reduceMotion ? "" : " animate-shake-subtle")
              }
              aria-hidden
            />
          </div>

          <div className="space-y-1.5">
            <p className="font-display text-lg font-bold text-foreground">
              Pendaftaran tidak ditemukan
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Hmm, kami nggak nemu pendaftaran dengan data itu. Coba cek
              sekali lagi — atau lihat riwayat semua pendaftaranmu lewat
              tombol di bawah.
            </p>
          </div>

          {/* Suggestions list — concrete actionable tips */}
          <div className="w-full rounded-xl border border-secondary/60 bg-card/70 p-3 text-left">
            <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Lightbulb className="size-3.5" aria-hidden />
              Coba cek hal berikut
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground sm:text-sm">
              {mode === "kode" ? (
                <>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    Format kode: <span className="font-mono font-medium text-foreground">SRT-XXXXXX</span> (6 karakter setelah strip).
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    Pastikan huruf besar/kecil nggak keliru (kode selalu huruf besar).
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    Nomor HP harus yang kamu pakai saat daftar (format 08xx atau 62xxx).
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    Nama depan harus persis seperti yang diisi saat daftar.
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onLihatRiwayat}
              className="btn-press inline-flex w-full items-center justify-center gap-2 rounded-full border-primary/30 bg-card text-pink-primary hover:bg-primary hover:text-primary-foreground hover:border-primary sm:w-auto"
            >
              <History className="size-4" aria-hidden />
              Coba Lihat Riwayat
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ResultView({ pendaftar }: { pendaftar: PendaftarResult }) {
  if (pendaftar.status === "verified") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-center gap-2">
          <Badge className="border-success/20 bg-success/15 text-success">
            <ShieldCheck className="size-3" />
            Terverifikasi
          </Badge>
        </div>
        <TicketCard pendaftar={pendaftar} />
      </div>
    );
  }

  if (pendaftar.status === "pending_payment") {
    return (
      <Card className="border-amber/30 bg-amber/5">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <Badge className="border-amber/40 bg-amber/15 text-pending">
              Menunggu Pembayaran
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              {pendaftar.kodeReferensi}
            </span>
          </div>
          <div className="space-y-2 text-sm text-ink">
            <p>
              Selesaikan pembayaran{" "}
              <strong className="font-mono">{formatIDR(pendaftar.totalBayar)}</strong>{" "}
              ke QRIS.
            </p>
            <p>
              Transfer PERSIS sampai 3 digit terakhir{" "}
              (<strong className="font-mono text-pending">{pendaftar.kodeUnik}</strong>).
              Verifikasi otomatis biasanya beberapa menit setelah transfer.
            </p>
            {!pendaftar.buktiTransfer && (
              <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Belum upload bukti transfer? Unggah di halaman Daftar dengan kode referensi kamu.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // rejected
  return (
    <Card className="border-rejected/30 bg-rejected/5">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Badge className="border-rejected/30 bg-rejected/15 text-rejected">
            Ditolak
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {pendaftar.kodeReferensi}
          </span>
        </div>
        <p className="text-sm text-ink">
          Maaf, pembayaranmu belum terverifikasi. Hubungi admin di Instagram{" "}
          <a
            href="https://instagram.com/saratrasaaa"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-pink-primary hover:underline"
          >
            @saratrasaaa
          </a>{" "}
          untuk bantuan.
        </p>
        {pendaftar.catatanAdmin && (
          <div className="rounded-lg border border-rejected/20 bg-card p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-rejected">
              Catatan dari admin
            </p>
            <p className="text-sm text-ink">{pendaftar.catatanAdmin}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CekStatus;
