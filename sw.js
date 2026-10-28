/* Service worker: офлайн-оболочка сайта.
   Код сайта берём из сети (чтобы правки подхватывались сразу), а если сети нет —
   отдаём из кэша. Плитки спутника и панорамы не кэшируем: они и так грузятся с CDN. */
const VERSION = 'kng-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/vendor/leaflet.css',
  './assets/vendor/leaflet.js',
  './assets/js/config.js',
  './assets/js/geo.js',
  './assets/js/roads.js',
  './assets/js/signs-svg.js',
  './assets/js/render.js',
  './assets/js/editor.js',
  './assets/js/store.js',
  './assets/js/panorama.js',
  './assets/js/app.js',
  './data/roads.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // плитки, Supabase, Яндекс — мимо кэша

  // Навигация и код: сначала сеть, кэш — как запасной вариант.
  const fresh = req.mode === 'navigate' || /\.(js|css|webmanifest)$/.test(url.pathname);
  if (fresh) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Остальное (иконки, данные): кэш, потом сеть.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => null);
      return res;
    }))
  );
});
