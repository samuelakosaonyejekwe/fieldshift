// FieldShift service worker: app shell offline, NASA/soil data network-first with cache fallback.
const VER = 'fieldshift-v7';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/data.js', 'js/engine.js', 'js/crops.js', 'js/charts.js', 'js/i18n.js', 'js/worker.js',
];
const LANG_FILES = ['es', 'fr', 'pt', 'sw', 'hi', 'ar', 'zh', 'bn', 'ru', 'ur', 'id', 'de', 'ja', 'tr', 'vi', 'fa', 'it', 'ha', 'yo', 'ig', 'am', 'ta', 'te', 'mr', 'pa', 'el', 'ko', 'th', 'uk', 'pl', 'nl', 'tl', 'ms', 'ne', 'so', 'zu', 'om'].map((l) => `js/lang/${l}.js`);
// offline pack: every demo farm (fetched in the background after install)
const DEMOS = ["addis", "bangladesh", "cordoba", "france", "free_state", "fresno", "heilongjiang", "iowa", "java", "kano", "lilongwe", "matogrosso", "mekong", "nakuru", "nile", "pampas", "peru", "punjab", "saskatoon", "sinaloa", "tamale", "ukraine", "wagga"].map((d) => `data/demo/${d}.json`);
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL).then(() => Promise.all(LANG_FILES.map((u) => c.add(u).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('message', (e) => {
  if (e.data === 'offline-pack') {
    caches.open('fs-demos').then(async (c) => {
      for (const u of DEMOS) { if (!(await c.match(u))) { try { await c.add(u); } catch { /* retry next visit */ } } }
      const n = (await c.keys()).length;
      (await self.clients.matchAll()).forEach((cl) => cl.postMessage({ type: 'pack', n, total: DEMOS.length }));
    });
  }
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER && k !== 'fs-data' && k !== 'fs-demos').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const api = /power\.larc\.nasa\.gov|rest\.isric\.org|modis\.ornl\.gov|geocoding-api|nominatim/.test(url.host);
  const tiles = /gibs\.earthdata|tile\.openstreetmap/.test(url.host);
  if (api) {
    // network first, fall back to the last good response
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const cl = r.clone(); caches.open('fs-data').then((c) => c.put(req, cl)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  if (tiles) return; // map tiles: let the browser cache handle them
  // same-origin app files: network first (fresh after every deploy) with a 3 s fallback to cache;
  // Leaflet from the CDN: cache first
  if (url.origin === location.origin) {
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const fromCache = () => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true }).then((hit) => { if (!done && hit) { done = true; resolve(hit); } return hit; });
      const timer = setTimeout(fromCache, 3000);
      fetch(req).then((r) => {
        clearTimeout(timer);
        if (r.ok) { const cl = r.clone(); caches.open(VER).then((c) => c.put(req, cl)); }
        if (!done) { done = true; resolve(r); }
      }).catch(() => { clearTimeout(timer); fromCache().then((hit) => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
    }));
    return;
  }
  if (/unpkg\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const cl = r.clone(); caches.open(VER).then((c) => c.put(req, cl)); } return r; })));
  }
});
