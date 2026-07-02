"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Navbar } from "@/components/saratrasa/Navbar";
import { Hero } from "@/components/saratrasa/Hero";
import { ProfilSection } from "@/components/saratrasa/ProfilSection";
import { HistorySection } from "@/components/saratrasa/HistorySection";
import { DaftarWizard } from "@/components/saratrasa/DaftarWizard";
import { CekStatus } from "@/components/saratrasa/CekStatus";
import { AdminPanel } from "@/components/saratrasa/AdminPanel";
import { Footer } from "@/components/saratrasa/Footer";
import { CountdownTimer } from "@/components/saratrasa/CountdownTimer";
import { StatsDashboard } from "@/components/saratrasa/StatsDashboard";
import { LeaderboardSection } from "@/components/saratrasa/LeaderboardSection";
import { HowItWorks } from "@/components/saratrasa/HowItWorks";
import { TestimonialSection } from "@/components/saratrasa/TestimonialSection";
import { FAQ } from "@/components/saratrasa/FAQ";
import { UpcomingEvents } from "@/components/saratrasa/UpcomingEvents";
import { TimelineSection } from "@/components/saratrasa/TimelineSection";
import { GalleryView } from "@/components/saratrasa/GalleryView";
import { ScrollToTop } from "@/components/saratrasa/ScrollToTop";
import { SectionDivider } from "@/components/saratrasa/SectionDivider";
import type { ActiveEventSummary, HistoryEvent, View, GalleryItem } from "@/components/saratrasa/types";

/**
 * HomeClient — the actual Saratrasaa app.
 *
 * - Reads `?admin=<secret>` and `?kode=<ref>` from the URL via `useSearchParams`
 *   (Suspense-wrapped by the parent server page).
 * - If `admin` secret verifies server-side → render AdminPanel (layer 1 of admin auth).
 * - Otherwise → render the public app with 3 in-page views.
 */
export default function HomeClient({ initialActiveEvent = null, initialTestimonis = [] }: { initialActiveEvent?: ActiveEventSummary | null, initialTestimonis?: any[] }) {
  const searchParams = useSearchParams();
  const adminSecret = searchParams.get("admin") || undefined;
  const initialKode = searchParams.get("kode") || undefined;

  const [adminUrlOk, setAdminUrlOk] = useState<boolean | null>(
    adminSecret ? null : false,
  );

  // Verify the admin URL secret server-side (layer 1 — obscurity).
  // Layer 2 (the typed admin token) is enforced inside AdminPanel + every
  // /api/admin/* route via the X-Admin-Token header.
  useEffect(() => {
    if (!adminSecret) return; // adminUrlOk already false
    let cancelled = false;
    fetch(`/api/admin/url-check?secret=${encodeURIComponent(adminSecret)}`)
      .then((r) => {
        if (!cancelled) setAdminUrlOk(r.ok);
      })
      .catch(() => {
        if (!cancelled) setAdminUrlOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminSecret]);

  if (adminSecret && adminUrlOk === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="font-mono text-sm text-muted-foreground">Memeriksa akses…</p>
        </div>
      </div>
    );
  }

  if (adminSecret && adminUrlOk) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <main className="flex-1">
          <AdminPanel urlSecret={adminSecret} />
        </main>
      </div>
    );
  }

  return <PublicApp initialKode={initialKode} initialActiveEvent={initialActiveEvent} initialTestimonis={initialTestimonis} />;
}

/* -------------------------------------------------------------------------- */
/* Public app — Beranda / Daftar / Cek Status                                  */
/* -------------------------------------------------------------------------- */

function PublicApp({ initialKode, initialActiveEvent, initialTestimonis }: { initialKode?: string; initialActiveEvent: ActiveEventSummary | null; initialTestimonis: any[] }) {
  const [view, setView] = useState<View>(() => {
    if (initialKode) return "cek-status";
    return "beranda";
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (!initialKode) {
      const path = window.location.pathname.replace("/", "");
      if (path === "daftar" || path === "cek-status" || path === "galeri") {
        setView(path as View);
      }
    }
  }, [initialKode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const expectedPath = view === "beranda" ? "/" : `/${view}`;
      if (url.pathname !== expectedPath) {
        window.history.pushState(null, "", expectedPath);
      }
    }
  }, [view]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace("/", "");
      if (path === "beranda" || path === "daftar" || path === "cek-status" || path === "galeri") {
        setView(path as View);
      } else {
        setView("beranda");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [activeEvent, setActiveEvent] = useState<ActiveEventSummary | null>(initialActiveEvent);
  const [activeLoading, setActiveLoading] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  // Respect prefers-reduced-motion — when set, skip the page transition
  // entirely (no AnimatePresence, no motion.div) so the view swap is
  // instant and doesn't trigger any motion-induced discomfort.
  const reduceMotion = useReducedMotion();

  const fetchActive = useCallback(async (background = false) => {
    if (!background) setActiveLoading(true);
    try {
      const res = await fetch("/api/event/active", { cache: "no-store" });
      const data = await res.json();
      setActiveEvent(data.event ?? null);
    } catch {
      setActiveEvent(null);
    } finally {
      if (!background) setActiveLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/event/history", { cache: "no-store" });
      const data = await res.json();
      setHistoryEvents(data.events ?? []);
    } catch {
      setHistoryEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchGallery = useCallback(async (background = false) => {
    if (!background) setGalleryLoading(true);
    try {
      const res = await fetch("/api/gallery", { cache: "no-store" });
      const data = await res.json();
      setGalleryItems(data.events ?? []);
    } catch {
      setGalleryItems([]);
    } finally {
      if (!background) setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch active if it's the first time or we don't have initial data.
    // By passing `true` for background when we have initialData, we avoid the loading glitch.
    fetchActive(!!initialActiveEvent);
    fetchHistory();
    fetchGallery();
  }, [fetchActive, fetchHistory, fetchGallery, initialActiveEvent]);

  // Listen for the saratrasa:goto custom event (emitted by DaftarWizard's
  // "Cek Status Pembayaran" button so the user lands on cek-status view).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<View>).detail;
      if (
        detail === "beranda" ||
        detail === "daftar" ||
        detail === "cek-status" ||
        detail === "galeri"
      ) {
        setView(detail);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("saratrasa:goto", handler);
    return () => window.removeEventListener("saratrasa:goto", handler);
  }, []);

  const handleViewChange = useCallback((v: View) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // When user goes to daftar, refetch active event in case quota changed.
  // We do it in the background so it doesn't trigger the skeleton loading again.
  useEffect(() => {
    if (view === "daftar") fetchActive(true);
    if (view === "galeri") fetchGallery(true);
  }, [view, fetchActive, fetchGallery]);

  const memoNavbar = useMemo(
    () => (
      <Navbar
        view={view}
        onViewChange={handleViewChange}
        activeEvent={activeEvent}
      />
    ),
    [view, handleViewChange, activeEvent, activeLoading],
  );

  // Render the active view's content. Extracted so AnimatePresence can wrap
  // the same expression with a motion.div in the animated branch.
  const viewContent = (
    <>
      {view === "beranda" && (
        <>
          <Hero
            activeEvent={activeLoading ? null : activeEvent}
            onDaftar={() => handleViewChange("daftar")}
          />
          {/* Countdown timer for the active event — creates urgency */}
          {!activeLoading && activeEvent && (
            <section className="container mx-auto px-4 py-8 md:py-12">
              <div className="mx-auto max-w-2xl">
                <CountdownTimer
                  targetDate={activeEvent.tanggal}
                  label={`Menuju ${activeEvent.judul}`}
                />
              </div>
            </section>
          )}

          {/* How it works — 3-step guide */}
          <HowItWorks />
          <SectionDivider variant="dots" />
          <TestimonialSection testimonis={initialTestimonis} />
          <SectionDivider variant="dots" />
          <ProfilSection />
          <SectionDivider variant="wave" />
          <HistorySection events={historyEvents} loading={historyLoading} />
          <SectionDivider variant="wave" />
          {/* Unified timeline — past + current + upcoming on one rail */}
          <TimelineSection />
          <SectionDivider variant="wave" />
          {/* Upcoming events — preview of what's next */}
          <UpcomingEvents />
          <SectionDivider variant="dots" />
          {/* FAQ — reduces support questions */}
          <FAQ />
        </>
      )}

      {view === "daftar" && (
        <section className="container mx-auto px-4 py-8 md:py-12">
          <DaftarWizard
            activeEvent={activeLoading ? null : activeEvent}
            loading={activeLoading}
            onBack={() => handleViewChange("beranda")}
          />
        </section>
      )}

      {view === "cek-status" && (
        <section className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
          <CekStatus initialKode={initialKode} />
        </section>
      )}

      {view === "galeri" && (
        <GalleryView items={galleryItems} loading={galleryLoading} />
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {memoNavbar}

      <main className="flex-1 w-full flex flex-col overflow-x-hidden">
        {reduceMotion ? (
          // Reduced-motion branch: render the view content directly, no
          // AnimatePresence, no motion.div. The view still swaps instantly
          // (driven by the `view` state), just without any fade/slide.
          viewContent
        ) : (
          // Animated branch: wrap the view content in AnimatePresence with
          // mode="wait" so the outgoing view finishes its exit animation
          // before the incoming view mounts. Each view gets a fade-in +
          // 8px slide-up on enter, fade-out + 8px slide-up on exit. The
          // 200ms duration is short enough to feel snappy but long enough
          // to register as a deliberate transition.
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {viewContent}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <Footer onNavigate={handleViewChange} />

      {/* Floating scroll-to-top button — self-managing, renders on all public views */}
      <ScrollToTop />
    </div>
  );
}
