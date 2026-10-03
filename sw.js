// FieldShift service worker: app shell offline, NASA/soil data network-first with cache fallback.
const APP_V = '1.13.0';
const VER = 'fieldshift-' + APP_V;
// versioned files (?v=APP_V) never change: they are cached exactly and never swapped for another version
const V = (u) => `${u}?v=${APP_V}`;
const PLAIN = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png', 'icons/apple-touch-icon.png'];
const VERSIONED = ['css/app.css', 'js/app.js', 'js/boot.js', 'js/data.js', 'js/engine.js', 'js/crops.js', 'js/charts.js', 'js/i18n.js', 'js/worker.js'].map(V);
const LANG_FILES = ['zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur', 'id', 'de', 'ja', 'sw', 'mr', 'te', 'tr', 'ta', 'vi', 'fa', 'ha', 'pa', 'it', 'yo', 'ig', 'am', 'el', 'ko', 'th', 'uk', 'pl', 'nl', 'tl', 'ms', 'ne', 'so', 'zu', 'om'].map((l) => V(`js/lang/${l}.js`));
// offline pack: every demo farm (fetched in the background after install)
const DEMOS = ["addis", "bangladesh", "cordoba", "france", "free_state", "fresno", "heilongjiang", "iowa", "java", "kano", "lilongwe", "matogrosso", "mekong", "nakuru", "nile", "pampas", "peru", "punjab", "saskatoon", "sinaloa", "tamale", "ukraine", "wagga"].map((d) => `data/demo/${d}.json`);
const DEMO_CACHE = 'fs-demos-' + APP_V; // demo data is refreshed with each release
const DATA_MAX = 80; // NASA/soil responses kept for offline use
// bypass the HTTP cache so a fresh release never stores yesterday's copy
const fresh = (u) => new Request(u, { cache: 'reload' });

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER)
    .then((c) => c.addAll([...PLAIN, ...VERSIONED].map(fresh)).then(() => Promise.all(LANG_FILES.map((u) => c.add(fresh(u)).catch(() => {})))))
    .then(() => self.skipWaiting()));
});
// Everything needed to run with no connection: app files, every language, every demo farm
const OFFLINE_SET = () => [...PLAIN, ...VERSIONED, ...LANG_FILES, ...DEMOS];
async function offlineStatus() {
  let n = 0;
  const app = await caches.open(VER), demos = await caches.open(DEMO_CACHE);
  for (const u of OFFLINE_SET()) if (await (DEMOS.includes(u) ? demos : app).match(u)) n++;
  return { type: 'offline-status', n, total: OFFLINE_SET().length, busy: !!packing };
}
async function broadcast(msg) { (await self.clients.matchAll({ includeUncontrolled: true })).forEach((cl) => cl.postMessage(msg)); }
// one offline download at a time: concurrent requests (several tabs, auto start + button) share it
let packing = null;
function offlinePack() {
  packing = packing || (async () => {
    const app = await caches.open(VER), demos = await caches.open(DEMO_CACHE);
    const all = OFFLINE_SET();
    const missing = [];
    for (const u of all) if (!(await (DEMOS.includes(u) ? demos : app).match(u))) missing.push(u);
    let done = all.length - missing.length;
    for (const u of missing) {
      try { await (DEMOS.includes(u) ? demos : app).add(fresh(u)); done++; } catch { /* retried next time */ }
      await broadcast({ type: 'offline-status', n: done, total: all.length, busy: true });
    }
    // older demo copies go only once this release's set is complete
    if ((await demos.keys()).length >= DEMOS.length) for (const k of await caches.keys()) if (k.startsWith('fs-demos') && k !== DEMO_CACHE) await caches.delete(k);
    await broadcast({ ...(await offlineStatus()), busy: false });
  })().finally(() => { packing = null; });
  return packing;
}
self.addEventListener('message', (e) => {
  if (e.data === 'offline-status') e.waitUntil(offlineStatus().then(broadcast));
  if (e.data === 'offline-pack') e.waitUntil(offlinePack());
  if (e.data === 'version') e.waitUntil(broadcast({ type: 'version', v: APP_V }));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER && k !== 'fs-data' && !k.startsWith('fs-demos')).map((k) => caches.delete(k))))
    .then(() => pruneData())
    .then(() => self.clients.claim()));
});
async function pruneData() {
  const c = await caches.open('fs-data');
  const ks = await c.keys(); // insertion order: oldest first
  for (const k of ks.slice(0, Math.max(0, ks.length - DATA_MAX))) await c.delete(k);
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const api = /power\.larc\.nasa\.gov|rest\.isric\.org|modis\.ornl\.gov|geocoding-api|nominatim/.test(url.host);
  const tiles = /gibs\.earthdata|tile\.openstreetmap/.test(url.host);
  if (api) {
    // network first, fall back to the last good response; the daily feed changes every day and is already
    // cached by the page itself, so it is not stored here
    const keep = !/\/temporal\/daily\//.test(url.pathname);
    e.respondWith(fetch(req).then((r) => { if (r.ok && keep) { const cl = r.clone(); caches.open('fs-data').then((c) => c.put(req, cl)).then(() => pruneData()); } return r; }).catch(() => caches.match(req)));
    return;
  }
  if (tiles) return; // map tiles: let the browser cache handle them
  if (url.origin === location.origin) {
    // versioned app files: exact match from cache, else network (never another version)
    if (url.searchParams.has('v')) {
      const mine = url.searchParams.get('v') === APP_V; // never store content under another release's version
      e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok && mine) { const cl = r.clone(); caches.open(VER).then((c) => c.put(req, cl)); } return r; })));
      return;
    }
    // pages and other files: network first (fresh after every deploy), 3 s fallback to the cached copy
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const fromCache = () => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => { if (!done && hit) { done = true; resolve(hit); } return hit; });
      const timer = setTimeout(fromCache, 3000);
      fetch(req).then((r) => {
        clearTimeout(timer);
        if (r.ok) { const cl = r.clone(); caches.open(VER).then((c) => c.put(req, cl)); }
        else if (req.mode === 'navigate') { fromCache().then((hit) => { if (!done) { done = true; resolve(hit || r); } }); return; }
        if (!done) { done = true; resolve(r); }
      }).catch(() => { clearTimeout(timer); fromCache().then((hit) => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
    }));
    return;
  }
  if (/unpkg\.com/.test(url.host)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const cl = r.clone(); caches.open(VER).then((c) => c.put(req, cl)); } return r; })));
  }
});
