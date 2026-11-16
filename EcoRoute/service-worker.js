/* ==========================================================================
   EcoRoute - service-worker.js
   Offline-first app shell. Everything the app itself needs is local (no CDNs),
   so once installed it opens offline and runs on its sample data.

   Strategy: stale-while-revalidate for same-origin GETs of the app shell. Cached
   copy is served instantly, then refreshed in the background. Requests to the
   backend API (/api/...) are NEVER cached or answered by the worker: the app
   must always see the live database (a stale /api/bootstrap would show old data).
   Bump VERSION to ship an update.
   ========================================================================== */
'use strict';

const VERSION = 'ecoroute-v1.1.0';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/responsive.css',
  './css/animations.css',
  './js/icons.js',
  './js/data.js',
  './js/ui.js',
  './js/app.js',
  './js/api.js',
  './js/location.js',
  './js/map.js',
  './js/navigation.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/vehicles.js',
  './js/routes.js',
  './js/tracking.js',
  './js/charging.js',
  './js/analytics.js',
  './js/profile.js',
  './assets/fonts/inter-latin-wght-normal.woff2',
  './assets/logo/logo.svg',
  './assets/logo/logo-mark.svg',
  './assets/icons/favicon.svg',
  './assets/icons/icon-96.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ecoroute-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // never intercept third-party requests
  if (url.pathname.indexOf('/api/') !== -1) return;         // backend calls always go straight to the network

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
      return cached || network;
    })
  );
});
