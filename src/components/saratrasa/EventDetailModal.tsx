'use client';

import { useEffect, useState } from "react";
import { Calendar, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EventDetailModalProps {
  id: string;
  onClose: () => void;
}

type EventStatus = "upcoming" | "active" | "closed";

interface EventDetail {
  id: string;
  judul: string;
  deskripsi: string;
  tanggal: string;
  lokasi: string;
  fotoCover: string | null;
  harga: number;
  kuotaMax: number;
  status: EventStatus;
  recap: string | null;
  fotoDok: string[];
  createdAt: string;
}

/** Format ISO date → "12 Maret 2025" (id-ID locale). */
function formatTanggal(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Format price → "Rp 75.000 / orang" or "Gratis" if 0. */
function formatHarga(harga: number): string {
  if (!harga || harga === 0) return "Gratis";
  return `Rp ${harga.toLocaleString("id-ID")} / orang`;
}

/** Status badge label + palette. */
function statusBadge(status: EventStatus): { label: string; className: string } {
  switch (status) {
    case "active":
      return {
        label: "Pendaftaran Dibuka",
        className: "bg-[var(--success)]/15 text-[var(--success)]",
      };
    case "upcoming":
      return {
        label: "Coming Soon",
        className: "bg-[var(--amber)]/15 text-[var(--amber)]",
      };
    case "closed":
      return {
        label: "Selesai",
        className: "bg-secondary text-muted-foreground",
      };
  }
}

export function EventDetailModal({ id, onClose }: EventDetailModalProps) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setEvent(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/event/detail?id=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (!cancelled) setEvent(data.event ?? null);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Dialog
      open={true}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Memuat detail event…
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center gap-4 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Gagal memuat detail. Coba lagi.
            </p>
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && event && (
          <>
            {/* Cover */}
            {event.fotoCover ? (
              <img
                src={event.fotoCover}
                alt={event.judul}
                className="aspect-[21/9] w-full rounded-t-lg object-cover"
              />
            ) : (
              <div className="flex aspect-[21/9] w-full items-center justify-center bg-gradient-to-br from-secondary to-background">
                <Calendar className="size-20 text-primary/30" />
              </div>
            )}

            {/* Header */}
            <DialogHeader className="p-6">
              {(() => {
                const badge = statusBadge(event.status);
                return (
                  <span
                    className={`mb-2 inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                );
              })()}
              <DialogTitle className="font-display text-2xl font-bold">
                {event.judul}
              </DialogTitle>
              <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formatTanggal(event.tanggal)}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {event.lokasi}
                </span>
              </div>
            </DialogHeader>

            {/* Body */}
            <div className="space-y-4 px-6 pb-6">
              <p className="text-sm leading-relaxed text-ink">
                {event.deskripsi}
              </p>

              {/* Map embed */}
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                  Lokasi
                </p>
                <iframe
                  src={`https://www.google.com/maps?q=${encodeURIComponent(event.lokasi)}&output=embed`}
                  width="100%"
                  height="200"
                  style={{ border: 0, borderRadius: "0.5rem" }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Peta ${event.lokasi}`}
                />
              </div>

              {/* Price */}
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Kontribusi
                </p>
                <p className="font-mono font-bold text-primary">
                  {formatHarga(event.harga)}
                </p>
              </div>

              {/* Recap (closed only) */}
              {event.status === "closed" && event.recap && (
                <div className="space-y-3">
                  <h4 className="font-display text-lg font-bold">Cerita Event</h4>
                  <p className="rounded-lg bg-secondary/20 p-4 text-sm leading-relaxed text-ink">
                    {event.recap}
                  </p>
                  {event.fotoDok.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {event.fotoDok.map((foto, idx) => (
                        <a
                          key={`${event.id}-${idx}`}
                          href={foto}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="overflow-hidden rounded-lg"
                        >
                          <img
                            src={foto}
                            alt={`Dokumentasi ${event.judul} ${idx + 1}`}
                            loading="lazy"
                            className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Active CTA */}
              {event.status === "active" && (
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("saratrasa:goto", {
                          detail: "daftar",
                        }),
                      );
                      onClose();
                    }}
                    className="rounded-full bg-primary px-6 py-2.5 text-primary-foreground hover:bg-primary/90"
                  >
                    Daftar Sekarang
                  </Button>
                </div>
              )}

              {/* Upcoming note */}
              {event.status === "upcoming" && (
                <p className="rounded-lg bg-secondary/20 p-3 text-sm text-muted-foreground">
                  Pendaftaran belum dibuka. Pantau Instagram{" "}
                  <a
                    href="https://instagram.com/saratrasaaa"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    @saratrasaaa
                  </a>{" "}
                  untuk update.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EventDetailModal;
