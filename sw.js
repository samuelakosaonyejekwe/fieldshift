// FieldShift service worker: app shell offline, NASA/soil data network-first with cache fallback.
const VER = 'fieldshift-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/data.js', 'js/engine.js', 'js/crops.js', 'js/charts.js', 'js/i18n.js', 'js/worker.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER && k !== 'fs-data').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
  // app shell, demo data, translations, Leaflet: stale-while-revalidate
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok && (url.origin === location.origin || /unpkg\.com/.test(url.host))) { const cl = r.clone(); caches.open(VER).then((c) => c.put(req, cl)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
