// =====================
// Master Control - Service Worker
// =====================
// Caches the app shell on install so the app opens offline.
// Caches images/pages on first view (runtime caching) so books
// read once while online become available offline afterwards.

const CACHE_VERSION = 'mc-cache-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Core files needed for the app to boot offline.
// Keep this list small and update CACHE_VERSION when you change index.html
// so old caches get cleared automatically.
const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './images/logo-0ab19f16.png'
];

// ---- INSTALL: pre-cache the app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .catch((err) => {
        // Don't let one missing file (e.g. icon not uploaded yet) block install
        console.warn('SW precache warning:', err);
      })
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: clean up old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('mc-cache-') && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH: serve from cache, fall back to network, runtime-cache the rest ----
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Ignore cross-origin requests (fonts CDN etc.) — let the browser handle those normally
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache immediately, but refresh in background for HTML
        if (req.mode === 'navigate' || req.destination === 'document') {
          event.waitUntil(
            fetch(req).then((freshResponse) => {
              return caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, freshResponse));
            }).catch(() => {})
          );
        }
        return cachedResponse;
      }

      // Not cached yet — fetch from network and store for offline use
      return fetch(req)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, responseClone));
          return networkResponse;
        })
        .catch(() => {
          // Offline and not cached — fall back to the app shell for navigations
          if (req.mode === 'navigate' || req.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'Offline and not cached' });
        });
    })
  );
});
