/* Scribbler service worker
   Shell = cache-first (installable / offline).
   Data (data/*.json, version.json) = network-first so new inbox items always appear. */

const APP_VERSION = '1.0.1';
const SHELL_CACHE = 'scribbler-shell-v' + APP_VERSION;
const DATA_CACHE  = 'scribbler-data-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.map((n) => {
        if (n !== SHELL_CACHE && n !== DATA_CACHE) return caches.delete(n);
        return null;
      })
    )).then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return url.pathname.startsWith('/data/') || url.pathname === '/version.json';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through

  // Data: network-first, fall back to cache.
  if (isDataRequest(url)) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(DATA_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Navigations: stale-while-revalidate the shell so app-code updates self-heal.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        const net = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Everything else (shell assets): cache-first, then network.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
