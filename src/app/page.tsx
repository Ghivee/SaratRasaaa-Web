import { Suspense } from "react";
import HomeClient from "./home-client";

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
export default function Home() {
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
      <HomeClient />
    </Suspense>
  );
}
