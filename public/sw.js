/**
 * Service worker.
 *
 * Two reasons this exists:
 *
 *  1. Offline use. A pantry is often the far corner of a house with the worst
 *     wifi, and all the data is local anyway -- there is no good reason for
 *     the app to need the network to open.
 *  2. Installability. Chrome will not offer to install a site without a
 *     service worker that handles fetches, and installing is what reliably
 *     earns persistent storage.
 *
 * Deliberately not a generated precache manifest: Vite already fingerprints
 * asset filenames, so caching on demand is safe and there is no build step to
 * keep in step.
 */

const CACHE = 'pantry-tracker-v1';

self.addEventListener('install', () => {
  // A new build should take over rather than wait for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a redeploy is picked up immediately, with
  // the cached shell as the offline fallback. Every route is served by
  // index.html because the app uses hash routing.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put('/index.html', fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match('/index.html');
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else -- fingerprinted JS/CSS, icons, the manifest -- is safe to
  // serve from cache first and refresh in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return Response.error();
      }
    })(),
  );
});
