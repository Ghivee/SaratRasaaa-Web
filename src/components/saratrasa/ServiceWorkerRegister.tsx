'use client';

/**
 * ServiceWorkerRegister — Saratrasaa (Task 9-C)
 *
 * Mounts once at the root layout and registers /sw.js in PRODUCTION ONLY.
 *
 * Why production-only?
 *   The Next.js dev server (Turbopack) rewrites asset URLs on every hot
 *   reload and emits source-mapped chunks with non-deterministic names.
 *   A service worker caching those URLs in dev would freeze the page on
 *   stale CSS/JS and break HMR — exactly the opposite of what we want.
 *   In production the asset graph is stable, so caching is safe.
 *
 * The component renders nothing — it's a side-effect-only leaf. Mount it
 * once near the bottom of <body> in the root layout.
 *
 * Skips registration entirely when:
 *   - `serviceWorker` isn't supported (older Safari / non-secure context)
 *   - NODE_ENV !== 'production' (dev server)
 *   - The user has `prefers-reduced-data` set (mobile data saver)
 *
 * On successful registration we fire a one-shot `skipWaiting` via postMessage
 * so a freshly-installed worker takes over from the previous one without
 * requiring all tabs to be closed. Failures are swallowed — a SW error
 * should never break the page.
 */

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    // Only register in production to avoid dev server issues.
    if (process.env.NODE_ENV !== "production") return;

    // Respect users on metered/data-saving connections.
    const conn =
      (navigator as Navigator & {
        connection?: { saveData?: boolean };
      }).connection ?? undefined;
    if (conn?.saveData) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // If a new version is waiting, ask it to skip waiting so it
          // activates immediately on the next navigation.
          if (reg.waiting) {
            reg.waiting.postMessage("sw:skipWaiting");
          }
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                installing.postMessage("sw:skipWaiting");
              }
            });
          });
        })
        .catch(() => {
          /* swallow — SW registration failure is non-fatal */
        });
    };

    // Defer registration until after the page is idle so it doesn't
    // compete with first paint for CPU/network. Fall back to a 1.5s
    // timeout on browsers without requestIdleCallback (older Safari).
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      ric(register);
    } else {
      window.setTimeout(register, 1500);
    }
  }, []);

  return null;
}

export default ServiceWorkerRegister;
