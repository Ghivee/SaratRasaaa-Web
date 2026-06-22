'use client';

/**
 * QRScanner — Saratrasaa (Task 10-A)
 *
 * Live camera QR scanner used by admins at event check-in.
 *
 * Features:
 *   - Camera preview using getUserMedia + @zxing/browser decoder
 *   - "Mulai Scan" / "Stop" buttons
 *   - Pink scanning frame overlay with animated scan line
 *   - Result overlay: green (verified), amber (pending), red (rejected),
 *     blue/gray (already checked in)
 *   - Beep on successful scan (Web Audio API)
 *   - Vibrate on mobile (navigator.vibrate)
 *   - Manual kode entry fallback when camera not available
 *   - "Scan Lagi" button to continue scanning
 *   - prefers-reduced-motion respected (scan-line animation halts)
 *
 * Camera selection:
 *   - Prefers back camera (facingMode: 'environment') on mobile
 *   - Falls back to default camera on desktop
 *   - If multiple cameras and ZXing exposes them, lets admin pick
 *
 * Security:
 *   - The admin token is forwarded as `X-Admin-Token` on every fetch.
 *   - Server rejects with 401 if missing/wrong.
 *
 * Error handling:
 *   - Camera permission denied → manual entry fallback
 *   - Camera not available (no getUserMedia) → manual entry fallback
 *   - Network error during check-in → toast + result stays
 */

import * as React from "react";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Keyboard,
  Send,
  RotateCcw,
  AlertCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/* zxing is browser-only — we dynamic-import inside the component so the
 * module never runs on the server (it references `navigator` at top level).
 * Type-only imports are erased at compile time, so they're SSR-safe. */
import type {
  BrowserMultiFormatReader as BrowserMultiFormatReaderType,
  IScannerControls,
} from "@zxing/browser";
import type { Result as ZXingResult } from "@zxing/library";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type PendaftarStatus = "pending_payment" | "verified" | "rejected";

interface CheckInResponse {
  ok: boolean;
  pendaftar?: {
    kodeReferensi: string;
    nama: string;
    jumlahOrang: number;
    status: PendaftarStatus;
    event: { judul: string; tanggal: string; lokasi: string };
  };
  alreadyCheckedIn?: boolean;
  lastCheckedInAt?: string | null;
  error?: string;
}

interface QRScannerProps {
  /** Admin token — forwarded as X-Admin-Token on check-in fetch. */
  token: string;
  /** Called whenever a check-in is recorded (so the parent can refresh
   * its recent-check-ins list). */
  onCheckIn?: () => void;
}

type ScannerState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "stopped" }
  | { kind: "error"; message: string };

type ResultKind =
  | "verified"
  | "pending"
  | "rejected"
  | "already"
  | "not-found"
  | "error";

interface ScanResult {
  kind: ResultKind;
  title: string;
  message?: string;
  pendaftar?: CheckInResponse["pendaftar"];
  alreadyCheckedIn?: boolean;
  lastCheckedInAt?: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Format ISO date for display in id-ID, short form. */
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Generate a beep using the Web Audio API. No external assets.
 * - success: short high beep (880 Hz, 120 ms)
 * - warn:    two short medium beeps (440 Hz)
 * - error:   long low buzz (220 Hz, 300 ms)
 */
function playBeep(kind: "success" | "warn" | "error"): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const now = ctx.currentTime;
    const tones =
      kind === "success"
        ? [{ freq: 880, start: 0, dur: 0.12 }]
        : kind === "warn"
          ? [
              { freq: 440, start: 0, dur: 0.1 },
              { freq: 440, start: 0.14, dur: 0.1 },
            ]
          : [{ freq: 220, start: 0, dur: 0.3 }];

    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = t.freq;
      gain.gain.setValueAtTime(0.0001, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
    }

    // Close the context after the last tone finishes to free the audio thread.
    const totalMs = (tones[tones.length - 1].start + tones[tones.length - 1].dur + 0.1) * 1000;
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, totalMs);
  } catch {
    // Audio is a nice-to-have — never let it break the scan flow.
  }
}

/** Vibrate the device (mobile only). No-op on desktop browsers. */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function QRScanner({ token, onCheckIn }: QRScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const readerRef = React.useRef<BrowserMultiFormatReaderType | null>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const lastScanRef = React.useRef<{ text: string; at: number } | null>(null);

  const [state, setState] = React.useState<ScannerState>({ kind: "idle" });
  const [result, setResult] = React.useState<ScanResult | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [manualKode, setManualKode] = React.useState("");
  const [showManual, setShowManual] = React.useState(false);
  const [supportsCamera, setSupportsCamera] = React.useState<boolean | null>(
    null,
  );

  // Detect camera support on mount.
  React.useEffect(() => {
    if (typeof navigator === "undefined") return;
    const hasGetUserMedia = !!(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    );
    setSupportsCamera(hasGetUserMedia);
    if (!hasGetUserMedia) {
      setShowManual(true);
    }
  }, []);

  // Cleanup camera on unmount.
  React.useEffect(() => {
    return () => {
      try {
        controlsRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Check-in call — shared by scan + manual entry                     */
  /* ---------------------------------------------------------------- */
  const performCheckIn = React.useCallback(
    async (rawKode: string) => {
      if (!rawKode.trim()) return;
      if (!token) {
        toast.error("Token admin hilang. Silakan login ulang.");
        return;
      }
      setProcessing(true);
      try {
        const res = await fetch("/api/admin/check-in", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Token": token,
          },
          body: JSON.stringify({ kode: rawKode }),
        });

        if (res.status === 401) {
          toast.error("Token admin tidak valid.");
          setResult({
            kind: "error",
            title: "Token tidak valid",
            message: "Silakan login ulang ke panel admin.",
          });
          return;
        }

        if (res.status === 429) {
          const data = (await res.json().catch(() => ({}))) as CheckInResponse;
          toast.error(data.error || "Terlalu banyak scan. Tunggu sebentar.");
          setResult({
            kind: "error",
            title: "Batas scan tercapai",
            message: data.error,
          });
          playBeep("error");
          vibrate([200, 100, 200]);
          return;
        }

        const data = (await res.json().catch(() => ({}))) as CheckInResponse;

        if (res.status === 404) {
          setResult({
            kind: "not-found",
            title: "Pendaftar tidak ditemukan",
            message: data.error || "Kode tidak terdaftar.",
          });
          playBeep("error");
          vibrate([200, 100, 200]);
          return;
        }

        if (res.status === 400 || !data.ok || !data.pendaftar) {
          setResult({
            kind: "error",
            title: "Kode tidak valid",
            message: data.error,
          });
          playBeep("error");
          vibrate([200, 100, 200]);
          return;
        }

        // Success — pick overlay color by status.
        const p = data.pendaftar;
        if (p.status === "verified") {
          if (data.alreadyCheckedIn) {
            setResult({
              kind: "already",
              title: "Sudah pernah check-in",
              message: "Tiket ini sudah pernah discan sebelumnya.",
              pendaftar: p,
              alreadyCheckedIn: true,
              lastCheckedInAt: data.lastCheckedInAt ?? null,
            });
            playBeep("warn");
            vibrate([100, 50, 100]);
          } else {
            setResult({
              kind: "verified",
              title: "Check-in berhasil",
              pendaftar: p,
              alreadyCheckedIn: false,
            });
            playBeep("success");
            vibrate(150);
          }
        } else if (p.status === "pending_payment") {
          setResult({
            kind: "pending",
            title: "Pembayaran belum terverifikasi",
            message:
              "Pendaftar ini berstatus pending. Periksa bukti transfer sebelum mengizinkan masuk.",
            pendaftar: p,
            alreadyCheckedIn: data.alreadyCheckedIn,
          });
          playBeep("warn");
          vibrate([100, 50, 100]);
        } else {
          // rejected
          setResult({
            kind: "rejected",
            title: "Pendaftar ditolak",
            message:
              "Tiket ini berstatus rejected. Jangan izinkan masuk tanpa klarifikasi admin.",
            pendaftar: p,
            alreadyCheckedIn: data.alreadyCheckedIn,
          });
          playBeep("error");
          vibrate([200, 100, 200]);
        }

        onCheckIn?.();
      } catch (err) {
        console.error("[QRScanner] check-in failed", err);
        setResult({
          kind: "error",
          title: "Gagal terhubung ke server",
          message: (err as Error).message,
        });
        playBeep("error");
        vibrate([200, 100, 200]);
      } finally {
        setProcessing(false);
      }
    },
    [token, onCheckIn],
  );

  /* ---------------------------------------------------------------- */
  /* Scan lifecycle                                                   */
  /* ---------------------------------------------------------------- */
  const startScan = React.useCallback(async () => {
    if (state.kind === "scanning" || state.kind === "starting") return;
    setResult(null);
    setState({ kind: "starting" });

    try {
      // Dynamic-import zxing inside the browser only.
      const [zxingBrowser, zxingLibrary] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);

      const BrowserMultiFormatReader = zxingBrowser.BrowserMultiFormatReader;
      if (!BrowserMultiFormatReader) {
        throw new Error("ZXing browser reader tidak tersedia.");
      }

      // Hint the decoder to focus on QR codes (faster, fewer false hits).
      // ZXing's hint map is a plain Map<DecodeHintType, unknown>.
      let reader: BrowserMultiFormatReaderType;
      try {
        const hints = new Map();
        hints.set(zxingLibrary.DecodeHintType.POSSIBLE_FORMATS, [
          zxingLibrary.BarcodeFormat.QR_CODE,
        ]);
        reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 200,
          delayBetweenScanSuccess: 800,
        });
      } catch {
        // Fall back to no-hints constructor if the hint setup fails.
        reader = new BrowserMultiFormatReader();
      }
      readerRef.current = reader;

      // Choose device — prefer back camera via facingMode constraint.
      // ZXing's listVideoInputDevices gives us deviceId list; we then let
      // the browser pick by passing `undefined` (default device) which
      // honors our earlier getUserMedia `facingMode` constraint preference.
      // Simpler & more reliable than guessing which label is "back".
      let chosenDeviceId: string | undefined;
      try {
        const devices =
          await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices.length === 0) {
          throw new Error("Tidak ada kamera terdeteksi.");
        }
        // Heuristic: pick a device whose label contains "back" or "rear"
        // or "environment" (case-insensitive). Otherwise pick the last
        // one (often the back camera on phones that list front first).
        const back = devices.find((d) =>
          /back|rear|environment/i.test(d.label),
        );
        chosenDeviceId = back?.deviceId ?? devices[devices.length - 1].deviceId;
      } catch {
        chosenDeviceId = undefined;
      }

      const video = videoRef.current;
      if (!video) {
        throw new Error("Elemen video tidak siap.");
      }

      // Start decoding. The callback fires per frame; we filter for
      // successful decodes and ignore the per-frame NotFound errors.
      const controls = await reader.decodeFromVideoDevice(
        chosenDeviceId,
        video,
        (result: ZXingResult | undefined, err) => {
          if (result) {
            const text = result.getText();
            if (!text) return;
            // Debounce — ZXing can fire several times per second on the
            // same code. Only accept a new code if it differs from the
            // last, or 1.5s have passed since the last acceptance.
            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.text === text && now - last.at < 1500) {
              return;
            }
            lastScanRef.current = { text, at: now };
            void performCheckIn(text);
          }
          // err is a ZXing NotFoundException per frame — that's normal,
          // we just ignore it.
          void err;
        },
      );
      controlsRef.current = controls;
      setState({ kind: "scanning" });
    } catch (err) {
      console.error("[QRScanner] startScan failed", err);
      const msg = (err as Error).message || "Tidak bisa mengakses kamera.";
      // DOMException names we want to handle gracefully.
      const errName = (err as { name?: string }).name;
      if (
        errName === "NotAllowedError" ||
        errName === "SecurityError" ||
        errName === "PermissionDeniedError"
      ) {
        setState({
          kind: "error",
          message:
            "Izin kamera ditolak. Aktifkan izin kamera di browser atau gunakan input manual di bawah.",
        });
      } else if (
        errName === "NotFoundError" ||
        errName === "OverconstrainedError" ||
        errName === "DevicesNotFoundError"
      ) {
        setState({
          kind: "error",
          message:
            "Tidak ada kamera terdeteksi pada perangkat ini. Silakan gunakan input manual.",
        });
        setSupportsCamera(false);
      } else {
        setState({ kind: "error", message: msg });
      }
      setShowManual(true);
    }
  }, [state.kind, performCheckIn]);

  const stopScan = React.useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore
    }
    controlsRef.current = null;
    setState({ kind: "stopped" });
  }, []);

  const scanAgain = React.useCallback(() => {
    setResult(null);
    lastScanRef.current = null;
    // If we were scanning before, resume. Otherwise go back to idle so
    // the admin can press "Mulai Scan" again.
    if (state.kind === "stopped") {
      void startScan();
    } else {
      setState({ kind: "idle" });
    }
  }, [state.kind, startScan]);

  const handleManualSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const v = manualKode.trim();
      if (!v) return;
      void performCheckIn(v);
      setManualKode("");
    },
    [manualKode, performCheckIn],
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const isLive = state.kind === "scanning" || state.kind === "starting";

  return (
    <div className="flex flex-col gap-4">
      {/* ----------------------- Camera area ----------------------- */}
      <div className="relative overflow-hidden rounded-2xl bg-black/90 ring-1 ring-pink-soft/30">
        {/* Video element — always mounted so the ref is stable; we just
            hide it when we're not scanning. */}
        <div className="relative aspect-[4/3] sm:aspect-video w-full bg-black">
          <video
            ref={videoRef}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity",
              isLive ? "opacity-100" : "opacity-0",
            )}
            autoPlay
            playsInline
            muted
          />

          {/* Idle / stopped / error overlay — covers the video when not
              actively scanning. */}
          {!isLive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center">
              {state.kind === "error" ? (
                <>
                  <div className="flex size-14 items-center justify-center rounded-full bg-rejected/15">
                    <CameraOff className="size-7 text-rejected" />
                  </div>
                  <p className="max-w-sm text-sm text-pink-soft/90">
                    {state.message}
                  </p>
                </>
              ) : state.kind === "stopped" ? (
                <>
                  <div className="flex size-14 items-center justify-center rounded-full bg-pink-soft/15">
                    <Camera className="size-7 text-pink-soft" />
                  </div>
                  <p className="text-sm text-pink-soft/90">
                    Scan dijeda. Tekan &quot;Mulai Scan&quot; untuk lanjut.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex size-16 items-center justify-center rounded-full bg-pink-soft/15">
                    <QrCode className="size-8 text-pink-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-display text-lg text-white">
                      Scan QR Tiket
                    </p>
                    <p className="max-w-sm text-sm text-pink-soft/80">
                      Arahkan kamera ke QR code pada tiket relawan untuk
                      melakukan check-in.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Scanning frame overlay — only shown while live. */}
          {isLive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={cn(
                  "relative h-[70%] w-[70%] max-w-[320px] max-h-[320px] rounded-xl border-2 border-pink-primary/80",
                  state.kind === "scanning" && "animate-qr-frame-pulse",
                )}
              >
                {/* Corner brackets */}
                <span className="absolute -top-1 -left-1 size-5 border-t-4 border-l-4 border-pink-primary rounded-tl-md" />
                <span className="absolute -top-1 -right-1 size-5 border-t-4 border-r-4 border-pink-primary rounded-tr-md" />
                <span className="absolute -bottom-1 -left-1 size-5 border-b-4 border-l-4 border-pink-primary rounded-bl-md" />
                <span className="absolute -bottom-1 -right-1 size-5 border-b-4 border-r-4 border-pink-primary rounded-br-md" />

                {/* Scan line — animated up/down. */}
                {state.kind === "scanning" && (
                  <div className="absolute inset-x-2 top-0 h-[2px] overflow-hidden rounded-full bg-gradient-to-r from-transparent via-pink-primary to-transparent animate-qr-scan-line">
                    <div className="h-full w-full bg-pink-primary shadow-[0_0_8px_2px_rgba(255,45,120,0.6)]" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Starting spinner */}
          {state.kind === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="size-8 animate-spin text-pink-primary" />
            </div>
          )}

          {/* Processing overlay — when a check-in is in-flight */}
          {processing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm">
              <Loader2 className="size-8 animate-spin text-pink-primary" />
              <p className="text-sm text-white">Memproses check-in…</p>
            </div>
          )}
        </div>

        {/* Top status bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/80 text-xs">
          <div className="flex items-center gap-1.5 text-pink-soft/90">
            <span
              className={cn(
                "size-2 rounded-full",
                state.kind === "scanning"
                  ? "bg-success animate-pulse"
                  : state.kind === "error"
                    ? "bg-rejected"
                    : "bg-muted-foreground",
              )}
            />
            <span>
              {state.kind === "scanning"
                ? "Memindai…"
                : state.kind === "starting"
                  ? "Menyiapkan kamera…"
                  : state.kind === "error"
                    ? "Kamera error"
                    : state.kind === "stopped"
                      ? "Dijeda"
                      : "Siap"}
            </span>
          </div>
          {supportsCamera === false && (
            <Badge className="bg-amber/20 text-amber border-amber/30">
              Kamera tidak tersedia
            </Badge>
          )}
        </div>
      </div>

      {/* ----------------------- Controls ----------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {state.kind !== "scanning" && state.kind !== "starting" ? (
          <Button
            type="button"
            onClick={() => void startScan()}
            disabled={supportsCamera === false}
            className="bg-pink-primary hover:bg-pink-primary/90"
          >
            <Camera className="size-4" />
            {state.kind === "stopped" ? "Lanjut Scan" : "Mulai Scan"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={stopScan}
            className="border-rejected/40 text-rejected hover:bg-rejected/10"
          >
            <CameraOff className="size-4" />
            Stop
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowManual((s) => !s)}
        >
          <Keyboard className="size-4" />
          {showManual ? "Sembunyikan Manual" : "Input Manual"}
        </Button>

        {result && (
          <Button
            type="button"
            variant="outline"
            onClick={scanAgain}
            disabled={processing}
          >
            <RotateCcw className="size-4" />
            Scan Lagi
          </Button>
        )}
      </div>

      {/* ----------------------- Manual entry ----------------------- */}
      {showManual && (
        <form
          onSubmit={handleManualSubmit}
          className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-2"
        >
          <Label htmlFor="qr-manual-kode" className="flex items-center gap-1.5">
            <Keyboard className="size-3.5 text-muted-foreground" />
            Input kode manual
          </Label>
          <div className="flex gap-2">
            <Input
              id="qr-manual-kode"
              value={manualKode}
              onChange={(e) => setManualKode(e.target.value)}
              placeholder="SRT-XXXXXX atau payload QR lengkap"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="font-mono"
              disabled={processing}
            />
            <Button
              type="submit"
              disabled={processing || !manualKode.trim()}
              className="bg-pink-primary hover:bg-pink-primary/90 shrink-0"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Cek
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Bisa dipakai jika kamera tidak tersedia atau QR rusak. Tempel kode
            referensi (SRT-XXXXXX) atau seluruh payload QR.
          </p>
        </form>
      )}

      {/* ----------------------- Result card ----------------------- */}
      {result && <ResultCard result={result} />}

      {/* ----------------------- Camera not supported hint ----------------------- */}
      {supportsCamera === false && !showManual && (
        <div className="flex items-start gap-2 rounded-lg bg-amber/10 border border-amber/30 p-3 text-sm">
          <AlertCircle className="size-4 text-amber shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-ink">Kamera tidak didukung</p>
            <p className="text-muted-foreground">
              Browser ini tidak mendukung akses kamera. Gunakan tombol
              &quot;Input Manual&quot; di atas untuk mengetik kode tiket.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result card — colored by scan result kind                            */
/* ------------------------------------------------------------------ */

function ResultCard({ result }: { result: ScanResult }) {
  const config: Record<
    ResultKind,
    {
      icon: React.ComponentType<{ className?: string }>;
      bg: string;
      border: string;
      iconBg: string;
      iconColor: string;
      titleColor: string;
    }
  > = {
    verified: {
      icon: CheckCircle2,
      bg: "bg-success/8",
      border: "border-success/40",
      iconBg: "bg-success/15",
      iconColor: "text-success",
      titleColor: "text-success",
    },
    pending: {
      icon: AlertTriangle,
      bg: "bg-amber/8",
      border: "border-amber/40",
      iconBg: "bg-amber/15",
      iconColor: "text-amber",
      titleColor: "text-amber",
    },
    rejected: {
      icon: XCircle,
      bg: "bg-rejected/8",
      border: "border-rejected/40",
      iconBg: "bg-rejected/15",
      iconColor: "text-rejected",
      titleColor: "text-rejected",
    },
    already: {
      icon: Info,
      bg: "bg-pending/8",
      border: "border-pending/40",
      iconBg: "bg-pending/15",
      iconColor: "text-pending",
      titleColor: "text-pending",
    },
    "not-found": {
      icon: AlertCircle,
      bg: "bg-rejected/8",
      border: "border-rejected/40",
      iconBg: "bg-rejected/15",
      iconColor: "text-rejected",
      titleColor: "text-rejected",
    },
    error: {
      icon: AlertCircle,
      bg: "bg-rejected/8",
      border: "border-rejected/40",
      iconBg: "bg-rejected/15",
      iconColor: "text-rejected",
      titleColor: "text-rejected",
    },
  };

  const c = config[result.kind];
  const Icon = c.icon;
  const statusLabel = result.pendaftar
    ? result.pendaftar.status === "verified"
      ? "Verified"
      : result.pendaftar.status === "pending_payment"
        ? "Pending"
        : "Rejected"
    : null;

  return (
    <div
      className={cn(
        "animate-qr-result-pop rounded-xl border p-4 sm:p-5 space-y-3",
        c.bg,
        c.border,
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            c.iconBg,
          )}
        >
          <Icon className={cn("size-6", c.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn("font-display text-lg leading-tight", c.titleColor)}>
            {result.title}
          </h3>
          {result.message && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {result.message}
            </p>
          )}
        </div>
        {statusLabel && (
          <Badge
            className={cn(
              "border-transparent shrink-0",
              result.pendaftar?.status === "verified" &&
                "bg-success text-white hover:bg-success",
              result.pendaftar?.status === "pending_payment" &&
                "bg-amber text-ink hover:bg-amber",
              result.pendaftar?.status === "rejected" &&
                "bg-rejected text-white hover:bg-rejected",
            )}
          >
            {statusLabel}
          </Badge>
        )}
      </div>

      {/* Pendaftar info */}
      {result.pendaftar && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <InfoRow label="Nama" value={result.pendaftar.nama} />
          <InfoRow
            label="Kode"
            value={result.pendaftar.kodeReferensi}
            mono
            accent
          />
          <InfoRow
            label="Jumlah Orang"
            value={String(result.pendaftar.jumlahOrang)}
            mono
          />
          <InfoRow
            label="Event"
            value={result.pendaftar.event.judul}
            span2
          />
          <InfoRow
            label="Tanggal Event"
            value={result.pendaftar.event.tanggal}
            mono
          />
          <InfoRow label="Lokasi" value={result.pendaftar.event.lokasi} />
        </div>
      )}

      {/* Already checked-in footer */}
      {result.alreadyCheckedIn && result.lastCheckedInAt && (
        <div className="flex items-center gap-1.5 text-xs text-pending bg-pending/10 rounded-md px-2 py-1.5">
          <Info className="size-3.5" />
          Check-in sebelumnya: {formatDateTime(result.lastCheckedInAt)}
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  accent,
  span2,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  span2?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2 rounded-md bg-card/60 px-2.5 py-1.5",
        span2 && "sm:col-span-2",
      )}
    >
      <span className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "text-right text-sm font-medium text-ink truncate",
          mono && "font-mono",
          accent && "text-pink-primary",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

QRScanner.displayName = "QRScanner";
export default QRScanner;
