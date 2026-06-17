/* ==========================================================================
   Sutra service worker — minimal, safe, offline-capable, no telemetry
   ==========================================================================
   Design constraints (see docs + CLAUDE.md):
     • Local-first: the SW only makes hosted use work offline. It NEVER runs
       under file:// (registration is protocol-gated in sw-register.js).
     • No telemetry, no tracking, no background sync.
     • Cross-origin requests (AI providers, Google Drive) are NEVER intercepted
       or cached — they pass straight through to the network.
     • Navigations are network-FIRST so a freshly deployed Sutra.html is never
       shadowed by a stale cached copy; the cache is only an offline fallback.
     • Sub-assets are versioned via ?v= query strings, so cache-first is safe:
       a new build is a new URL and bypasses the old cache entry.
     • User data exports (.sutra blobs) are downloads, not fetches — never cached.
   Bump CACHE_VERSION to invalidate old caches on the next activate.
   ========================================================================== */

const CACHE_VERSION = 'sutra-cache-v1-20260616';
const CORE_ASSETS = [
    './Sutra.html',
    './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(CORE_ASSETS).catch(() => undefined))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((key) => (key === CACHE_VERSION ? null : caches.delete(key)))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Only ever touch same-origin GET requests. Everything else — POST/PUT,
    // AI provider calls, Google Drive, opaque cross-origin — passes through
    // untouched so nothing user-sensitive is ever cached or proxied.
    if (req.method !== 'GET') return;
    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.origin !== self.location.origin) return;

    const isNavigation = req.mode === 'navigate'
        || (req.headers.get('accept') || '').includes('text/html');

    if (isNavigation) {
        // Network-first: always prefer the freshly deployed document; fall back
        // to the cached shell only when offline.
        event.respondWith(
            fetch(req)
                .then((res) => {
                    cachePut(req, res);
                    return res.clone();
                })
                .catch(() => caches.match(req).then((hit) => hit || caches.match('./Sutra.html')))
        );
        return;
    }

    // Static sub-assets (versioned by ?v=): cache-first, refresh in background.
    event.respondWith(
        caches.match(req).then((hit) => {
            const network = fetch(req)
                .then((res) => { cachePut(req, res); return res.clone(); })
                .catch(() => hit);
            return hit || network;
        })
    );
});

function cachePut(req, res) {
    // Cache only clean, same-origin, complete responses. Never cache opaque
    // (cross-origin) or partial/error responses.
    if (!res || res.status !== 200 || res.type !== 'basic') return;
    const copy = res.clone();
    caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
}
