/* Capacity service worker.
   Keep VERSION equal to APP_VER in capacity-tracker.html. A new version number makes the
   browser fetch fresh files and replace the offline cache. Your data is never stored here:
   it lives in the page's localStorage and IndexedDB, which this file does not touch. */
const VERSION = '2.9';
const CACHE = 'capacity-' + VERSION;
const APP = './capacity-tracker.html';
const CORE = [APP, './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/icon-180.png', './icons/badge-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('capacity-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;            // Google, Anthropic, and Drive calls are never touched

  if (r.mode === 'navigate') {
    // Network first so updates arrive, with the cached copy as the offline fallback.
    const net = fetch(r).then(res => {
      if (res.ok && u.pathname.endsWith('/capacity-tracker.html')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(APP, copy));
      }
      return res;
    });
    e.respondWith(
      timeout(net, 4000)
        .then(res => (res.ok || !(u.pathname.endsWith('/') || u.pathname.endsWith('/capacity-tracker.html'))) ? res : caches.match(APP))
        .catch(() => caches.match(APP).then(hit => hit || new Response('Capacity is offline and has not been cached yet. Open it once while online.', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    );
    return;
  }

  // Everything else from this site: cache first, fill from the network.
  e.respondWith(
    caches.match(r).then(hit => hit || fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || APP;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
