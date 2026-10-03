// FieldShift boot guard (classic script, runs before the app module).
(function () {
  // refuse to run inside another site's frame (clickjacking protection)
  if (window.top !== window.self) {
    try { window.top.location.href = window.self.location.href; } catch (e) { document.documentElement.style.display = 'none'; }
  }
  // very old browsers without ES modules
  if (!('noModule' in HTMLScriptElement.prototype)) {
    document.addEventListener('DOMContentLoaded', function () { document.getElementById('app').innerHTML = '<p style="padding:2rem;font-family:sans-serif">Please update your browser to use FieldShift.</p>'; });
  }
})();
// Diagnostics: collect errors from the very first moment (shown via the ⚠️ badge).
window.__fsErr = [];
window.addEventListener('error', function (e) { window.__fsErr.push((e.message || 'error') + (e.filename ? ' @' + e.filename.replace(/^.*\//, '') + ':' + e.lineno : '')); if (window.__fsShowErr) window.__fsShowErr(); }, true);
window.addEventListener('unhandledrejection', function (e) { window.__fsErr.push('promise: ' + (e.reason && (e.reason.message || e.reason))); if (window.__fsShowErr) window.__fsShowErr(); });
// Clean start: open …/fieldshift/?reset to wipe this app's storage, caches and service worker, then reload fresh.
if (/[?&]reset\b/.test(location.search)) {
  try { Object.keys(localStorage).forEach(function (k) { if (/^fs-/.test(k)) localStorage.removeItem(k); }); sessionStorage.clear(); } catch (e) {}
  var go = function () { location.replace(location.pathname); };
  var jobs = [];
  if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
  if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
  Promise.all(jobs).then(go, go);
  document.write('<p style="font:16px sans-serif;padding:2rem">Resetting FieldShift…</p>');
}
// Self-heal: if the app has not started after 10 s (e.g. stale or mismatched cached files), clear caches once and reload.
setTimeout(function () {
  if (window.__fsBooted) return;
  try { if (sessionStorage.getItem('fs-healed')) return; sessionStorage.setItem('fs-healed', '1'); } catch (e) {}
  var done = function () { location.reload(); };
  var p = [];
  if (window.caches) p.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== 'fs-data' && k !== 'fs-demos'; }).map(function (k) { return caches.delete(k); })); }));
  if (navigator.serviceWorker) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
  Promise.all(p).then(done, done);
}, 10000);
