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

// Independent tab switcher: works even if the main app module crashes, freezes or never loads.
(function () {
  var TABS = ['farm', 'climate', 'goals', 'plans', 'lab', 'about'];
  function sync() {
    var h = (location.hash || '').slice(1);
    if (TABS.indexOf(h) < 0) return;
    var target = document.getElementById('v-' + h);
    if (!target) return;
    var views = document.querySelectorAll('main > .view');
    for (var i = 0; i < views.length; i++) views[i].hidden = views[i] !== target;
    var links = document.querySelectorAll('#tabs a');
    for (var j = 0; j < links.length; j++) links[j].setAttribute('aria-current', links[j].getAttribute('data-go') === h ? 'page' : 'false');
    var sh = document.getElementById('sheet');
    if (sh && !sh.hidden) { sh.hidden = true; document.body.classList.remove('noscroll'); }
    var busy = document.getElementById('busy');
    if (busy) busy.hidden = true;
  }
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  // a direct listener on the tab bar too (runs even if the app's own click handling is broken)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('#tabs a[href^="#"]');
    if (a) setTimeout(sync, 0);
  }, true);
  window.__fsSync = sync;

  // last resort: the app could not start even after self-repair -> clear message + clean start
  setTimeout(function () {
    if (window.__fsBooted) return;
    var healed = false; try { healed = !!sessionStorage.getItem('fs-healed'); } catch (e) {}
    if (!healed) return; // the self-heal above gets the first chance
    var app = document.getElementById('app');
    if (app) app.innerHTML = '<div style="max-width:480px;margin:15vh auto;padding:1.5rem;font-family:system-ui,sans-serif;text-align:center">' +
      '<h1 style="font-size:1.4rem">FieldShift could not start</h1><p>Your browser kept an old or damaged copy. One tap fixes it.</p>' +
      '<p><a href="?reset" style="display:inline-block;padding:.8rem 1.4rem;border-radius:12px;background:#1f6f4a;color:#fff;text-decoration:none;font-weight:700">Clean start</a></p>' +
      '<p style="color:#777;font-size:.85rem">If this keeps happening, update your browser or try another one.</p></div>';
  }, 20000);
})();
