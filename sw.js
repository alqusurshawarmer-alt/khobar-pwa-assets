/* Shawarmer PulseOps — service worker (khobar)
   SAFETY RULES
   • Never touches data: Firebase, saves, uploads, e-mail and AI requests are not intercepted at all.
   • The dashboard page itself is always fetched fresh from the server when online
     (the saved copy is used ONLY when there is no connection), so a new upload shows immediately.
   • Only fixed-version library files, fonts and icons are served from the device. */
const VERSION = 'pulseops-khobar-v1';
const PAGE_CACHE = VERSION + '-page';
const LIB_CACHE  = VERSION + '-libs';
const LIB_HOSTS  = ['cdnjs.cloudflare.com', 'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('pulseops-khobar-') && !n.startsWith(VERSION)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // saves/uploads: never intercepted
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // 1) The dashboard page: network first, saved copy only when offline
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-cache' });
        if (fresh && fresh.ok) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put('./', fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (err) {
        const cache = await caches.open(PAGE_CACHE);
        const saved = await cache.match('./');
        if (saved) return saved;
        throw err;
      }
    })());
    return;
  }

  // 2) Fixed-version libraries and fonts: from the device, fetched once
  if (LIB_HOSTS.indexOf(url.hostname) >= 0) {
    event.respondWith((async () => {
      const cache = await caches.open(LIB_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  // 3) Same-site icons / manifest: device copy first, refreshed in the background
  if (url.origin === self.location.origin && /\.(png|webmanifest|ico|svg)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(LIB_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }
  // Everything else (Firebase, APIs…) goes straight to the network, untouched.
});
