/**
 * Saratrasaa Service Worker
 *
 * Strategy:
 *   - On install: precache the app shell (HTML, CSS, JS, fonts, manifest, icons).
 *   - On fetch:
 *       • Navigation requests (HTML pages):
 *           network-first → fall back to cached page → fall back to /offline.html
 *           when the network is down. This keeps users reading the app shell
 *           offline instead of seeing Chrome's "no internet" dinosaur.
 *       • Static assets (same-origin stylesheets, scripts, fonts, images,
 *         manifest, icons): cache-first → fall back to network. Cached assets
 *           are stamped with a `sw-cache-static` tag and get refreshed lazily
 *           via a background `fetchAndCache` whenever we hit the network.
 *       • API requests (anything under /api/): network-first with a short
 *           timeout, NO caching. The brief explicitly warns against caching
 *           API responses — pendaftar data, payment status, and event state
 *           change constantly and stale data would mislead both volunteers
 *           and admins. If the network fails, we just let the request fail
 *           so the UI can show its own error state.
 *       • Cross-origin requests (e.g. fonts loaded from Google Fonts):
 *           stale-while-revalidate into a separate `sw-cache-cross-origin`.
 *
 * The cache version is bumped whenever we ship a new app shell — the
 * `activate` event wipes any cache that doesn't match the current version
 * so users never get stuck on stale HTML.
 */

var CACHE_VERSION = "saratrasaa-v1";
var STATIC_CACHE = CACHE_VERSION + "-static";
var CROSS_ORIGIN_CACHE = CACHE_VERSION + "-cross-origin";

// App-shell URLs to precache on install. These are the bare minimum
// needed to render the home page offline. Other static chunks get
// cached on demand the first time they're requested.
var APP_SHELL = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.svg",
];

// Network timeout helper — resolves to a Response or rejects after `ms`.
// Used so the network-first path doesn't hang forever on a slow/flaky
// connection waiting for a response that may never come.
function fetchWithTimeout(request, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error("sw: network timeout"));
    }, ms);
    fetch(request).then(
      function (res) {
        clearTimeout(timer);
        resolve(res);
      },
      function (err) {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Persist a network Response into a named cache (only if cacheable).
function cacheResponse(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return;
  }
  try {
    var clone = response.clone();
    caches.open(cacheName).then(function (cache) {
      cache.put(request, clone);
    });
  } catch (e) {
    /* swallow — caching is best-effort */
  }
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    (function () {
      // Precache the app shell. Individual entries that 404 (e.g. an icon
      // we haven't shipped yet) are skipped silently so install never fails
      // because of a missing optional asset.
      return caches
        .open(STATIC_CACHE)
        .then(function (cache) {
          return Promise.all(
            APP_SHELL.map(function (url) {
              return cache
                .add(new Request(url, { cache: "reload" }))
                .catch(function () {
                  /* skip missing asset */
                });
            })
          );
        })
        .then(function () {
          return self.skipWaiting();
        });
    })()
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (function () {
      // Wipe any cache that doesn't match the current version.
      return caches
        .keys()
        .then(function (keys) {
          return Promise.all(
            keys
              .filter(function (key) {
                return key !== STATIC_CACHE && key !== CROSS_ORIGIN_CACHE;
              })
              .map(function (key) {
                return caches.delete(key);
              })
          );
        })
        .then(function () {
          return self.clients.claim();
        });
    })()
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Only handle GET — never intercept POST/PUT/DELETE (would break daftar,
  // admin actions, webhooks).
  if (request.method !== "GET") return;

  var url = new URL(request.url);

  // Skip non-http(s) schemes (chrome-extension://, data:, blob:).
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // ----- API requests: network-first, NO caching -----
  // Brief explicitly forbids aggressive API caching — pendaftar, payment,
  // and event data must always be fresh. Network failure → let the fetch
  // fail so the UI shows its own error state.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetchWithTimeout(request, 8000).catch(function () {
        // Return a synthetic 503 so the UI can show a clear "offline" error
        // instead of a generic TypeError.
        return new Response(
          JSON.stringify({ error: "Kamu sedang offline." }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // ----- Navigation requests: network-first → cache → offline page -----
  if (request.mode === "navigate") {
    event.respondWith(
      (function () {
        return fetchWithTimeout(request, 5000)
          .then(function (res) {
            // Cache a fresh copy of the page for next time.
            cacheResponse(STATIC_CACHE, request, res);
            return res;
          })
          .catch(function () {
            // Network failed — try the cache. If the exact URL isn't cached,
            // fall back to the root app shell, then to /offline.html.
            return caches
              .match(request)
              .then(function (cached) {
                if (cached) return cached;
                return caches.match("/");
              })
              .then(function (cached) {
                if (cached) return cached;
                return caches.match("/offline.html");
              })
              .then(function (cached) {
                if (cached) return cached;
                // Nothing cached at all — synthetic offline page.
                return new Response(
                  "<!doctype html><meta charset='utf-8'>" +
                    "<title>Saratrasaa — Offline</title>" +
                    "<body style='font-family:system-ui;padding:2rem;text-align:center'>" +
                    "<h1>Kamu sedang offline</h1>" +
                    "<p>Sambungkan ke internet lalu muat ulang halaman.</p>" +
                    "</body>",
                  {
                    status: 503,
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                  }
                );
              });
          });
      })()
    );
    return;
  }

  // ----- Cross-origin static assets (Google Fonts, etc.) -----
  // stale-while-revalidate so first paint isn't blocked on a font download
  // but the cache stays fresh.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CROSS_ORIGIN_CACHE).then(function (cache) {
        return cache.match(request).then(function (cached) {
          var networkFetch = fetch(request)
            .then(function (res) {
              if (res && res.status === 200) {
                cache.put(request, res.clone());
              }
              return res;
            })
            .catch(function () {
              return cached;
            });
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // ----- Same-origin static assets: cache-first → network -----
  // CSS/JS/fonts/images. Falls back to network on cache miss, and caches
  // the network response for next time.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        // Revalidate in the background (stale-while-revalidate).
        fetch(request)
          .then(function (res) {
            cacheResponse(STATIC_CACHE, request, res);
          })
          .catch(function () {
            /* offline — keep serving from cache */
          });
        return cached;
      }
      return fetch(request)
        .then(function (res) {
          cacheResponse(STATIC_CACHE, request, res);
          return res;
        })
        .catch(function () {
          // Last resort: nothing cached and offline. Return an empty 503.
          return new Response("", { status: 503 });
        });
    })
  );
});

// Allow the page to trigger immediate activation via postMessage.
self.addEventListener("message", function (event) {
  if (event.data === "sw:skipWaiting") {
    self.skipWaiting();
  }
});
