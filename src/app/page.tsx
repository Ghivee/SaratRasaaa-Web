import { Suspense } from "react";
import HomeClient from "./home-client";
import { db } from "@/lib/db";
import type { ActiveEventSummary } from "@/components/saratrasa/types";

export const dynamic = "force-dynamic";

/**
 * Saratrasaa — single public route (`/`).
 *
 * The page is a thin server wrapper that mounts the client app inside a
 * Suspense boundary (required by Next.js 16 when the client uses
 * `useSearchParams`). See `home-client.tsx` for the actual app.
 *
 * Architecture (brief §3 + §9):
 *  - Public app: 3 views (beranda | daftar | cek-status) as in-page state, NOT routes.
 *  - Admin: reachable ONLY via `/?admin=<ADMIN_URL_SECRET>` — verified server-side
 *    via /api/admin/url-check (layer 1: obscurity). Layer 2: operator types the
 *    admin token into the AdminPanel (never hardcoded in the bundle).
 */
export default async function Home() {
  let activeEvent: ActiveEventSummary | null = null;
  let testimonis: any[] = [];
  let dbStatus: "ok" | "error" = "ok";

  try {
    const event = await db.event.findFirst({
      where: { status: "active" },
    });

    if (event) {
    const agg = await db.pendaftar.aggregate({
      _sum: { jumlahOrang: true },
      where: {
        idEvent: event.id,
        status: { in: ["pending_payment", "verified"] },
      },
    });
    const terpakai = agg._sum.jumlahOrang ?? 0;
    const sisaKuota = Math.max(0, event.kuotaMax - terpakai);

    activeEvent = {
      id: event.id,
      judul: event.judul,
      deskripsi: event.deskripsi,
      tanggal: event.tanggal,
      lokasi: event.lokasi,
      fotoCover: event.fotoCover,
      harga: event.harga,
      kuotaMax: event.kuotaMax,
      terpakai,
      sisaKuota,
    };
  }

    const testimonisRaw = await db.testimoni.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    
    testimonis = testimonisRaw.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("Database connection error (likely Supabase paused):", error);
    dbStatus = "error";
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="font-mono text-sm text-muted-foreground">Memuat…</p>
          </div>
        </div>
      }
    >
      <HomeClient 
        initialActiveEvent={activeEvent} 
        initialTestimonis={testimonis} 
        dbStatus={dbStatus} 
      />
    </Suspense>
  );
}
