// FieldShift — interface controller
import { CROPS, CROP, MAIN_CROPS, COVER_CROPS, FAMILIES, famColor } from './crops.js?v=1.9.3';
import { t, setLang, lang, LANGS, RTL, cropName, monthName, guessLang } from './i18n.js?v=1.9.3';
import { DEMOS, loadDemo, monthsIn, fetchFarmData, fetchSoil, buildClimate, climateInsights, parseSoil, DEFAULT_SOIL, textureClass, fetchNDVI, fetchRecent, recentAnomaly, geocode, reverseGeocode } from './data.js?v=1.9.3';
import * as CH from './charts.js?v=1.9.3';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------- State ----------------
const DEF = {
  v: 2, lang: null, units: 'metric', theme: 'auto', fs: 1, tab: 'farm',
  farm: null, soil: null, soilEdited: false,
  practice: { irrigation: 'none', tillage: 'conventional', residue: 'retained', drainage: 'moderate', slope: 2, salinity: 'none', manure: 0, conservation: false, current: [], currentSec: [], currentCover: false },
  prio: { soil: 3, water: 3, profit: 3, resil: 3, simple: 2 },
  cons: { len: 'auto', covers: true, double: true, hort: false, forage: false, include: [], exclude: [] },
  scen: { mode: 'base', dT: 1.5, dP: -10 },
  prices: { n: 1.1, irr: 0.15 }, overrides: {}, saved: [],
  builder: { seq: [], sec: [] },
};
export const APP_VERSION = '1.9.3';
const clone = (o) => JSON.parse(JSON.stringify(o));
let S = load();
let raw = null, base = null, ins = null, res = null, shift = null, ndvi = null, custom = null, openPlan = null, recent = null;

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('fs-state')); } catch { /* private mode */ }
  const merged = s && s.v === DEF.v ? deepMerge(clone(DEF), sanitize(s)) : clone(DEF);
  // shared link state wins
  const m = location.hash.match(/s=([^&]+)/);
  if (m) {
    try {
      const sh = sanitize(JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))));
      deepMerge(merged, sh);
      merged.tab = 'plans';
    } catch { /* bad link */ }
    history.replaceState(null, '', location.pathname);
  }
  return merged;
}
// Untrusted state (shared links, old storage) is rebuilt field by field: numbers clamped,
// enums whitelisted, crop ids checked — nothing else gets through.
function sanitize(x) {
  if (!x || typeof x !== 'object') return {};
  const o = {};
  const num = (v, a, b, d) => { const n = +v; return Number.isFinite(n) ? clamp(n, a, b) : d; };
  const one = (v, list, d) => (list.includes(v) ? v : d);
  const crops = (a, main = true) => (Array.isArray(a) ? a.filter((id) => typeof id === 'string' && CROP[id] && (!main || !CROP[id].cover)).slice(0, 5) : []);
  if (x.farm && typeof x.farm === 'object') {
    const lat = +x.farm.lat, lon = +x.farm.lon;
    if (Number.isFinite(lat) && Number.isFinite(lon)) o.farm = { name: typeof x.farm.name === 'string' ? x.farm.name.slice(0, 120) : null, lat: clamp(lat, -90, 90), lon: clamp(lon, -180, 180), demo: DEMOS.some((d) => d[0] === x.farm.demo) ? x.farm.demo : null };
  }
  if (x.soil && typeof x.soil === 'object') {
    const R = { clay: [0, 100], sand: [0, 100], silt: [0, 100], soc: [1, 150], ph: [3.5, 10], bd: [0.8, 1.9], cec: [0, 200], n: [0, 50] };
    o.soil = {}; for (const k in R) o.soil[k] = num(x.soil[k], R[k][0], R[k][1], DEFAULT_SOIL[k]);
  }
  if (x.soilAuto && typeof x.soilAuto === 'object') o.soilAuto = sanitize({ soil: x.soilAuto }).soil;
  o.soilEdited = !!x.soilEdited;
  if (x.practice && typeof x.practice === 'object') {
    const P = x.practice;
    o.practice = {
      irrigation: one(P.irrigation, ['none', 'supplemental', 'full'], 'none'), tillage: one(P.tillage, ['conventional', 'reduced', 'notill'], 'conventional'),
      residue: one(P.residue, ['retained', 'partial', 'removed'], 'retained'), drainage: one(P.drainage, ['good', 'moderate', 'poor'], 'moderate'),
      salinity: one(P.salinity, ['none', 'moderate', 'high'], 'none'), slope: num(P.slope, 0, 30, 2), manure: num(P.manure, 0, 20, 0),
      conservation: !!P.conservation, currentCover: !!P.currentCover, current: crops(P.current),
      currentSec: Array.isArray(P.currentSec) ? P.currentSec.slice(0, 5).map((id) => (typeof id === 'string' && CROP[id] ? id : undefined)) : [],
    };
  }
  if (x.prio && typeof x.prio === 'object') { o.prio = {}; for (const k of ['soil', 'water', 'profit', 'resil', 'simple']) o.prio[k] = Math.round(num(x.prio[k], 0, 5, 3)); }
  if (x.cons && typeof x.cons === 'object') {
    const c = x.cons;
    o.cons = { len: c.len === 'auto' ? 'auto' : Math.round(num(c.len, 2, 5, 3)), covers: c.covers !== false, double: c.double !== false, hort: !!c.hort, forage: !!c.forage, include: crops(c.include).slice(0, 3), exclude: crops(c.exclude, true).slice(0, 40) };
  }
  if (x.scen && typeof x.scen === 'object') o.scen = { mode: one(x.scen.mode, ['base', 'recent', 'y2040', 'y2050', 'hotdry', 'custom'], 'base'), dT: num(x.scen.dT, -1, 5, 1.5), dP: num(x.scen.dP, -40, 30, -10) };
  if (x.prices && typeof x.prices === 'object') o.prices = { n: num(x.prices.n, 0, 20, 1.1), irr: num(x.prices.irr, 0, 5, 0.15) };
  if (x.overrides && typeof x.overrides === 'object') { o.overrides = {}; for (const id in x.overrides) if (CROP[id]) o.overrides[id] = { ...(x.overrides[id]?.yld != null ? { yld: num(x.overrides[id].yld, 0, 200, CROP[id].yld) } : {}), ...(x.overrides[id]?.gm != null ? { gm: num(x.overrides[id].gm, -5000, 50000, CROP[id].gm) } : {}) }; }
  if (Array.isArray(x.saved)) o.saved = x.saved.map((f) => sanitize({ farm: f }).farm).filter(Boolean).slice(0, 12);
  if (x.builder && typeof x.builder === 'object') { const sq = crops(x.builder.seq); o.builder = { seq: sq, sec: sq.map((_, i) => (typeof x.builder.sec?.[i] === 'string' && (x.builder.sec[i] === 'auto' || x.builder.sec[i] === 'fallow' || CROP[x.builder.sec[i]]) ? x.builder.sec[i] : 'auto')) }; }
  if (typeof x.lang === 'string' && LANGS.some(([k]) => k === x.lang)) o.lang = x.lang;
  o.units = one(x.units, ['metric', 'imperial'], 'metric');
  o.theme = one(x.theme, ['auto', 'light', 'dark'], 'auto');
  o.fs = num(x.fs, 0.8, 1.4, 1);
  o.tab = one(x.tab, ['farm', 'climate', 'goals', 'plans', 'lab', 'about'], 'farm');
  if (x.v != null) o.v = x.v;
  return o;
}
function deepMerge(a, b) {
  for (const k of Object.keys(b)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else a[k] = b[k];
  }
  return a;
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('fs-state', JSON.stringify(S)); } catch { /* ignore */ } }, 200); }

// ---------------- Units ----------------
function units() {
  const imp = S.units === 'imperial';
  const nf = (d) => new Intl.NumberFormat(lang(), { maximumFractionDigits: d, minimumFractionDigits: 0 });
  return {
    imp,
    temp: (c) => (imp ? c * 1.8 + 32 : c), tempL: imp ? '°F' : '°C', dTemp: (c) => (imp ? c * 1.8 : c),
    mm: (v) => (imp ? v / 25.4 : v), mmL: imp ? 'in' : 'mm',
    money: (v) => (imp ? v / 2.471 : v), moneyL: imp ? 'USD/ac' : 'USD/ha',
    moneyFmt: (v) => `${nf(0).format(imp ? v / 2.471 : v)} ${imp ? 'USD/ac' : 'USD/ha'}`,
    tha: (v) => (imp ? v / 2.471 : v), thaL: imp ? 't/ac' : 't/ha',
    kg: (v) => (imp ? v * 0.892 : v), kgL: imp ? 'lb N/ac' : 'kg N/ha',
    n: (v, d = 0) => nf(d).format(v),
  };
}
let U = units();

// ---------------- Worker ----------------
let worker = null, wid = 0;
const pending = new Map();
let engineMod = null;
function startWorker() {
  try {
    worker = new Worker(new URL('./worker.js?v=1.9.3', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); e.data.ok ? p.res(e.data.res) : p.rej(new Error(e.data.err)); } };
    worker.onerror = () => { worker = null; for (const [, p] of pending) p.retry(); pending.clear(); };
  } catch { worker = null; }
}
async function call(type, extra = {}) {
  const msg = { type, raw, inp: inputs(), ...extra };
  if (worker) {
    return new Promise((res, rej) => {
      const id = ++wid;
      pending.set(id, { res, rej, retry: () => callLocal(msg).then(res, rej) });
      worker.postMessage({ id, ...msg });
    });
  }
  return callLocal(msg);
}
async function callLocal(msg) {
  engineMod = engineMod || await import('./engine.js?v=1.9.3');
  const b = base;
  if (msg.type === 'recommend') return engineMod.recommend(b, msg.inp);
  if (msg.type === 'shift') return engineMod.cropShift(b, msg.inp);
  const { r } = engineMod.evaluateCustom(b, msg.inp, msg.seq, msg.sec);
  if (r) engineMod.finalize([r], engineMod.weights(msg.inp.prio), msg.refGM || r.gm);
  return r;
}
function inputs() {
  return { soil: S.soil || DEFAULT_SOIL, practice: S.practice, prio: S.prio, cons: S.cons, scen: S.scen, prices: S.prices, overrides: S.overrides };
}

// ---------------- Boot ----------------
async function boot() {
  window.__fsBooted = true;
  if (window.__fsErr?.length) setTimeout(() => window.__fsShowErr(), 500);
  if (!S.lang) S.lang = guessLang();
  await setLang(S.lang);
  applyPrefs();
  startWorker();
  renderShell();
  CH.bindTips(document.body);
  bindGlobal();
  const h0 = location.hash.slice(1);
  if (TABS.some(([k]) => k === h0)) S.tab = h0;
  if (S.farm) openFarm(S.farm, true);
  else go(S.tab === 'about' ? 'about' : 'farm');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // when a new version takes over, reload once so every user always runs the latest code
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => { reg.update().catch(() => {}); setInterval(() => reg.update().catch(() => {}), 30 * 60e3); return reg; }).then(() => navigator.serviceWorker.ready).then((reg) => {
      // download the offline pack (all demo farms) once the app is idle
      const go2 = () => reg.active?.postMessage('offline-pack');
      'requestIdleCallback' in window ? requestIdleCallback(go2, { timeout: 8000 }) : setTimeout(go2, 4000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'pack' && e.data.n >= e.data.total) { try { if (!localStorage.getItem('fs-pack')) { localStorage.setItem('fs-pack', '1'); toast(t('offline_ready', { n: e.data.n })); } } catch { /* */ } }
    });
  }
  const net = () => document.body.classList.toggle('is-offline', !navigator.onLine);
  window.addEventListener('offline', () => { net(); toast(t('offline_now')); });
  window.addEventListener('online', net); net();
}

function applyPrefs() {
  const r = document.documentElement;
  r.lang = S.lang;
  r.dir = RTL.has(S.lang) ? 'rtl' : 'ltr';
  if (S.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.theme);
  r.style.fontSize = `${S.fs * 100}%`;
  U = units();
}

const TABS = [
  ['farm', '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>'],
  ['climate', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
  ['goals', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
  ['plans', '<path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>'],
  ['lab', '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9"/>'],
];
const ico = (p, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

function renderShell() {
  $('#app').innerHTML = `
  <header class="top">
    <button class="brand" data-go="farm" aria-label="FieldShift">${logo()}<span>Field<b>Shift</b></span></button>
    <button class="farmchip" data-go="farm" id="farmchip" hidden></button>
    <div class="top-r">
      <label class="sel-lang">${ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>', 18)}
        <select id="langSel" aria-label="${esc(t('language'))}">${LANGS.map(([k, n]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
 <button class="btn sm primary install-btn" id="installBtn" data-act="install" hidden>⬇ <span>${esc(t('install'))}</span></button>
      <button class="icon-btn" data-act="guide" aria-label="${esc(t('guide'))}" title="${esc(t('guide'))}">${ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>', 20)}</button>
      <button class="icon-btn" data-act="settings" aria-label="${esc(t('settings'))}">${ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>', 20)}</button>
    </div>
  </header>
  <nav class="tabs" id="tabs" aria-label="Sections">${TABS.map(([k, p], i) => `<a href="#${k}" data-go="${k}" id="tab-${k}"><span class="tab-n">${i + 1}</span>${ico(p)}<span>${esc(t('tab_' + k))}</span></a>`).join('')}</nav>
  <main id="main">${TABS.map(([k]) => `<section id="v-${k}" class="view" hidden></section>`).join('')}<section id="v-about" class="view" hidden></section></main>
  <div id="busy" class="busy" hidden><div class="spin"></div><span id="busyMsg"></span></div>`;
  $('#langSel').onchange = async (e) => { S.lang = e.target.value; await setLang(S.lang); applyPrefs(); save(); renderShell(); go(S.tab); updateChip(); };
  updateChip();
  updateInstall();
}
const logo = () => `<svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="var(--brand)"/><path d="M6 27c6-3 10-3 14 0s9 3 14 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M6 21c6-3 10-3 14 0s9 3 14 0" stroke="#ffd36e" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M20 19V8m0 4c-3-3-6-2-7 0 3 2 5 2 7 0zm0 2c3-3 6-2 7 0-3 2-5 2-7 0z" stroke="#fff" stroke-width="2" fill="#fff" stroke-linejoin="round"/></svg>`;

function updateChip() {
  const c = $('#farmchip');
  if (!c) return;
  c.hidden = !S.farm;
  if (S.farm) c.innerHTML = `${ico('<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', 16)}<span>${esc(S.farm.name || `${S.farm.lat.toFixed(2)}, ${S.farm.lon.toFixed(2)}`)}</span>`;
}

function sizeCharts() {
  const vw = Math.min(document.documentElement.clientWidth, 1120);
  CH.setWidth(vw >= 760 ? (vw - (vw >= 900 ? 48 : 24) - 14) / 2 - 34 : vw - 24 - 34);
}
window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(() => { const w = document.documentElement.clientWidth; if (Math.abs(w - (window._lw || 0)) > 40) { window._lw = w; sizeCharts(); if (['climate'].includes(S.tab)) go(S.tab); } }, 250); });

function go(tab, fromHistory = false) {
  if (!S.farm && tab !== 'farm' && tab !== 'about') tab = 'farm';
  S.tab = tab; save();
  // switch the page first, so navigation can never get stuck on a rendering problem
  $$('.view').forEach((v) => (v.hidden = v.id !== 'v-' + tab));
  $$('#tabs a').forEach((b) => b.setAttribute('aria-current', b.dataset.go === tab ? 'page' : 'false'));
  // keep the address bar in step: back/forward move between tabs, and the link itself works without JS click handling
  if (location.hash !== '#' + tab) { try { history[fromHistory ? 'replaceState' : 'pushState'](null, '', '#' + tab); } catch { /* */ } }
  window.scrollTo({ top: 0 });
  try {
    sizeCharts();
    ({ farm: renderFarm, climate: renderClimate, goals: renderGoals, plans: renderPlans, lab: renderLab, about: renderAbout })[tab]?.();
  } catch (err) {
    console.error(err);
    window.__fsErr?.push('render ' + tab + ': ' + String(err?.stack || err).split('\n').slice(0, 2).join(' ')); window.__fsShowErr?.();
    if (err instanceof TypeError) heal(); // mismatched cached files: fetch a clean copy
    else $('#v-' + tab).innerHTML = `<p class="note warn">⚠️ ${esc(err.message)}</p>`;
  }
}
// Clear cached app files and reload onto the latest version (at most once per session)
async function heal() {
  try { if (sessionStorage.getItem('fs-healed')) return; sessionStorage.setItem('fs-healed', '1'); } catch { /* */ }
  try { for (const k of await caches.keys()) if (k !== 'fs-data' && k !== 'fs-demos') await caches.delete(k); } catch { /* */ }
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* */ }
  location.reload();
}

function bindGlobal() {
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.dataset.go); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      try { const r = ACT[a.dataset.act]?.(a, e); if (r?.catch) r.catch(fail); } catch (err) { fail(err); }
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  // navigation through the address bar / back button / plain link activation
  const fromHash = () => { const h = location.hash.slice(1); if (TABS.some(([k]) => k === h) && h !== S.tab) go(h, true); };
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
}

// any unexpected error: tell the user briefly, recover stale code if that is the cause
function fail(err) {
  console.error(err);
  window.__fsErr?.push(String(err?.stack || err).split('\n').slice(0, 2).join(' ')); window.__fsShowErr?.();
  busy(null);
  if (err instanceof TypeError && /is not a function|does not provide/.test(err.message)) heal();
  else toast('⚠️ ' + (err?.message || err), 5000);
}
window.addEventListener('unhandledrejection', (e) => { if (/does not provide|Failed to fetch dynamically|Importing a module/.test(String(e.reason))) heal(); });

// ---------------- Diagnostics badge ----------------
window.__fsShowErr = () => {
  let b = document.getElementById('diag');
  if (!b) { b = document.createElement('button'); b.id = 'diag'; b.className = 'diag'; b.onclick = showDiag; document.body.append(b); }
  b.textContent = `⚠️ ${window.__fsErr.length}`;
};
async function showDiag() {
  let sw = 'none', cks = [];
  try { const r = await navigator.serviceWorker?.getRegistration(); sw = r ? `${r.active?.scriptURL?.replace(/^.*\//, '') || '?'} (${r.active?.state || 'no active'})${navigator.serviceWorker.controller ? ' controlling' : ''}` : 'not registered'; } catch { /* */ }
  try { cks = await caches.keys(); } catch { /* */ }
  const info = [`FieldShift ${APP_VERSION}`, `URL: ${location.href}`, `Browser: ${navigator.userAgent}`, `Screen: ${innerWidth}x${innerHeight} @${devicePixelRatio}`, `Service worker: ${sw}`, `Caches: ${cks.join(', ')}`, `Worker: ${worker ? 'module worker' : 'main thread'}`, `Tab: ${S.tab} · farm: ${S.farm ? 'yes' : 'no'} · lang: ${S.lang}`, '--- errors ---', ...(window.__fsErr || []).slice(-15)].join('\n');
  sheet(`<div class="sh-head"><h2>⚠️ Diagnostics</h2><button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div>
    <pre class="diag-pre">${esc(info)}</pre>
    <div class="row wrap gap"><button class="btn primary" id="diagCopy">📋 Copy</button><a class="btn" href="?reset">↺ Clean start</a></div>`);
  $('#diagCopy').onclick = () => navigator.clipboard?.writeText(info).then(() => toast(t('copied')), () => prompt('Copy', info));
}

// ---------------- Busy / toast ----------------
function busy(msg) { const b = $('#busy'); if (!b) return; b.hidden = !msg; if (msg) $('#busyMsg').textContent = msg; }
function toast(msg, ms = 3200) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.className = 'show';
  clearTimeout(el._t); el._t = setTimeout(() => (el.className = ''), ms);
}

// ---------------- Farm loading ----------------
async function openFarm(f, quiet = false) {
  let soilP = null;
  try {
    busy(t('loading_power'));
    if (f.demo) raw = await loadDemo(f.demo);
    else {
      // climate and soil start together; soil never blocks the first result
      soilP = fetchSoil(f.lat, f.lon).catch(() => null);
      raw = await fetchFarmData(f.lat, f.lon);
      const quick = await Promise.race([soilP, new Promise((r) => setTimeout(() => r(undefined), 2500))]);
      if (quick !== undefined) { raw = { ...raw, soil: quick }; soilP = null; }
    }
  } catch (err) {
    busy(null);
    toast(t('err_fetch'), 5000);
    if (quiet) { S.farm = null; save(); }
    go('farm');
    return;
  }
  const sameFarm = S.farm && Math.abs(S.farm.lat - f.lat) < 1e-3 && Math.abs(S.farm.lon - f.lon) < 1e-3;
  S.farm = { name: f.name || (sameFarm ? S.farm.name : null), lat: +f.lat, lon: +f.lon, demo: f.demo || null };
  base = buildClimate(raw);
  ins = climateInsights(base);
  applySoil(raw.soil, sameFarm);
  if (!sameFarm) {
    S.practice = { ...clone(DEF.practice), ...(f.demo ? clone(DEMO_PRACTICE[f.demo] || {}) : {}) };
    S.builder = { seq: [], sec: [] };
  }
  shift = null; ndvi = null; custom = null; recent = null;
  loadRecent();
  S.soilPending = !!soilP;
  save(); updateChip();
  if (!S.farm.name) reverseGeocode(f.lat, f.lon, lang()).then((n) => { if (n && S.farm) { S.farm.name = n; save(); updateChip(); if (S.tab === 'farm') renderFarm(); } });
  busy(t('loading_engine'));
  await run(true);
  busy(null);
  if (raw.fromCache && !quiet && !navigator.onLine) toast(t('from_cache'));
  go(quiet ? (S.tab === 'farm' ? 'plans' : S.tab) : 'plans');
  // demo farms ship with a snapshot; when online, pull the newest NASA record and update quietly
  if (f.demo && navigator.onLine) {
    const lat = f.lat, lon = f.lon, soil = raw.soil;
    fetchFarmData(lat, lon).then((fresh) => {
      if (!S.farm || S.farm.lat !== +lat || S.farm.lon !== +lon || monthsIn(fresh) <= monthsIn(raw)) return;
      raw = { ...fresh, soil }; base = buildClimate(raw); ins = climateInsights(base); shift = null;
      run().then(() => { if (S.tab === 'climate') renderClimate(); });
    }).catch(() => {});
  }
  if (soilP) {
    const lat = f.lat, lon = f.lon;
    soilP.then((sg) => {
      if (!S.farm || S.farm.lat !== +lat || S.farm.lon !== +lon) return;
      S.soilPending = false;
      if (sg) { raw = { ...raw, soil: sg }; applySoil(sg, false); save(); toast(t('soil_src').split('.')[0] + ' ✓'); run(); }
      if (S.tab === 'farm') renderFarm();
    });
  }
}
function applySoil(sg, keepEdits) {
  const auto = parseSoil(sg);
  S.soilAuto = auto;
  if (!keepEdits || !S.soil || !S.soilEdited) { S.soil = { ...(auto || DEFAULT_SOIL) }; S.soilEdited = false; }
}

let runT = null, runSeq = 0;
function rerun() { clearTimeout(runT); runT = setTimeout(() => run(), 220); }
async function run(first = false) {
  if (!raw) return;
  const my = ++runSeq;
  $('#v-plans')?.classList.add('stale');
  try {
    const r = await call('recommend');
    if (my !== runSeq) return;
    res = r;
    if (!S.practice.current.length && res.baseline) { S.practice.current = [...res.baseline.seq]; save(); }
    custom = null;
  } catch (err) { console.error(err); toast('Engine error: ' + err.message, 6000); }
  $('#v-plans')?.classList.remove('stale');
  try {
    if (!first && S.tab === 'plans') renderPlans();
    if (!first && S.tab === 'lab') renderLab();
  } catch (err) { fail(err); }
}

// ---------------- FARM TAB ----------------
function renderFarm() {
  const v = $('#v-farm');
  if (!S.farm || !raw) { v.innerHTML = landing(); bindLanding(v); return; }
  const s = S.soil, cls = textureClass(s.sand, s.silt, s.clay);
  const p = S.practice;
  const seg = (k, opts, pre) => `<div class="seg" role="radiogroup">${opts.map((o) => `<button role="radio" aria-checked="${p[k] === o}" data-act="prac" data-k="${k}" data-v="${o}">${esc(t(pre + o))}</button>`).join('')}</div>`;
  v.innerHTML = `
  <div class="grid2">
    <article class="card">
      <h2>${esc(t('farm_title'))}</h2>
      <p class="big">${esc(S.farm.name || '')}</p>
      <p class="muted">${S.farm.lat.toFixed(4)}°, ${S.farm.lon.toFixed(4)}° · ${raw.elev != null ? `${Math.round(raw.elev)} m` : ''} · ${esc(zoneLabel())}</p>
      <div class="row wrap gap">
        <button class="btn" data-act="changeLoc">${ico('<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', 18)} ${esc(t('change_loc'))}</button>
        <button class="btn ghost" data-act="map">${ico('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', 18)} ${esc(t('map_layers'))}</button>
        <button class="btn ghost" data-act="saveFarm">★ ${esc(t('save_farm'))}</button>
      </div>
      ${S.saved.length ? `<h3>${esc(t('saved_farms'))}</h3><div class="chips">${S.saved.map((f, i) => `<button class="chip" data-act="openSaved" data-i="${i}">${esc(f.name || `${f.lat.toFixed(2)},${f.lon.toFixed(2)}`)}</button>`).join('')}</div>` : ''}
    </article>
    <article class="card">
      <h2>${esc(t('soil_title'))} <small class="pill">${esc(t('texture'))}: ${esc(cls.replace(/_/g, ' '))}</small></h2>
      <p class="muted small">${S.soilPending ? `<span class="spin sm"></span> ${esc(t('loading_soil'))}` : esc(S.soilAuto ? t('soil_src') : t('soil_none'))}</p>
      <div class="texbar" aria-hidden="true"><i style="width:${+s.sand || 0}%;background:#e7c98f"></i><i style="width:${+s.silt || 0}%;background:#b9a07a"></i><i style="width:${+s.clay || 0}%;background:#8a6a4f"></i></div>
      <div class="fields">
        ${num('sand', t('sand'), s.sand, 0, 100, 1, '%')}${num('silt', t('silt'), s.silt, 0, 100, 1, '%')}${num('clay', t('clay'), s.clay, 0, 100, 1, '%')}
        ${num('soc', t('soc'), s.soc, 1, 150, 0.1, 'g/kg')}${num('ph', t('ph'), s.ph, 3.5, 10, 0.1, '')}${num('bd', t('bd'), s.bd, 0.8, 1.9, 0.01, 'g/cm³')}
      </div>
      ${S.soilEdited && S.soilAuto ? `<button class="btn ghost sm" data-act="soilReset">↺ SoilGrids</button>` : ''}
    </article>
  </div>
  <article class="card">
    <h2>${esc(t('practices'))}</h2>
    <div class="form">
      <label>${esc(t('irrigation'))}</label>${seg('irrigation', ['none', 'supplemental', 'full'], 'irr_')}
      <label>${esc(t('tillage'))}</label>${seg('tillage', ['conventional', 'reduced', 'notill'], 'till_')}
      <label>${esc(t('residue'))}</label>${seg('residue', ['retained', 'partial', 'removed'], 'res_')}
      <label>${esc(t('drainage'))}</label>${seg('drainage', ['good', 'moderate', 'poor'], 'dr_')}
      <label>${esc(t('salinity'))}</label>${seg('salinity', ['none', 'moderate', 'high'], 'sal_')}
      <label for="slope">${esc(t('slope'))} <output>${p.slope}%</output></label><input type="range" id="slope" min="0" max="30" step="1" value="${p.slope}" data-prac="slope">
      <label for="manure">${esc(t('manure'))} <output>${p.manure} ${esc(t('t_ha_yr'))}</output></label><input type="range" id="manure" min="0" max="20" step="1" value="${p.manure}" data-prac="manure">
      <label class="tog"><input type="checkbox" data-prac="conservation" ${p.conservation ? 'checked' : ''}> ${esc(t('conservation'))}</label>
    </div>
  </article>
  <article class="card">
    <h2>${esc(t('current_rot'))}</h2>
    <p class="muted small">${esc(t('current_hint'))}</p>
    <div class="seqedit">${p.current.map((id, i) => `<span class="seqc" style="--c:${famColor(id)}">${t('yr')} ${i + 1}: ${CROP[id].ic} ${esc(cropName(id))} <button data-act="curDel" data-i="${i}" aria-label="${esc(t('remove'))}">×</button>
      <select class="mini-sel" data-cursec="${i}" aria-label="${esc(t('then'))}"><option value="">${esc(t('then'))}: —</option>${[...MAIN_CROPS.filter((c) => !c.per), ...COVER_CROPS].map((c) => `<option value="${c.id}" ${p.currentSec?.[i] === c.id ? 'selected' : ''}>${esc(t('then'))}: ${c.cover ? '🌱' : '➕'} ${esc(cropName(c.id))}</option>`).join('')}</select></span>`).join('<span class="arr">→</span>')}
      ${p.current.length < 5 ? `<select data-act-change="curAdd" aria-label="${esc(t('add_year'))}"><option value="">+ ${esc(t('add_year'))}</option>${MAIN_CROPS.map((c) => `<option value="${c.id}">${c.ic} ${esc(cropName(c.id))}</option>`).join('')}</select>` : ''}
    </div>
    <label class="tog"><input type="checkbox" data-prac="currentCover" ${p.currentCover ? 'checked' : ''}> ${esc(t('current_cover'))}</label>
  </article>
  <div class="next"><button class="btn primary" data-go="climate">${esc(t('tab_climate'))} →</button></div>`;
  v.oninput = (e) => {
    const el = e.target;
    if (el.dataset.soil) {
      if (el.value === '' || !Number.isFinite(+el.value)) return;
      S.soil[el.dataset.soil] = clamp(+el.value, +el.min, +el.max); S.soilEdited = true; save(); rerun();
      if (['sand', 'silt', 'clay'].includes(el.dataset.soil)) clearTimeout(v._t), (v._t = setTimeout(renderFarm, 700));
    }
    if (el.dataset.prac) {
      S.practice[el.dataset.prac] = el.type === 'checkbox' ? el.checked : +el.value;
      const o = el.previousElementSibling?.querySelector('output');
      if (o) o.textContent = el.dataset.prac === 'slope' ? `${el.value}%` : `${el.value} ${t('t_ha_yr')}`;
      save(); rerun();
    }
  };
  v.onchange = (e) => {
    if (e.target.dataset.actChange === 'curAdd' && e.target.value) { S.practice.current.push(e.target.value); save(); rerun(); renderFarm(); }
    if (e.target.dataset.cursec != null) { S.practice.currentSec = S.practice.currentSec || []; S.practice.currentSec[+e.target.dataset.cursec] = e.target.value || undefined; save(); rerun(); }
  };
}
const num = (k, label, val, min, max, step, unit) => `<label class="numf"><span>${esc(label)}</span><span class="numw"><input type="number" inputmode="decimal" data-soil="${k}" value="${esc(val)}" min="${min}" max="${max}" step="${step}"><em>${unit}</em></span></label>`;

function zoneLabel() {
  if (!ins) return '';
  const z = ins.zone;
  return `${t('z_' + z.thermal)} · ${t('z_' + z.moist)}`;
}

function landing() {
  const groups = { Americas: [], Africa: [], Europe: [], Asia: [], Oceania: [] };
  for (const d of DEMOS) {
    const [, , lat, lon] = d;
    const g = lon < -30 ? 'Americas' : lon < 52 && lat < 36 && !(lon > 25 && lat > 29) ? 'Africa' : lon < 52 && lat >= 36 ? 'Europe' : lon > 110 && lat < -10 ? 'Oceania' : lon < 52 ? 'Africa' : 'Asia';
    groups[g].push(d);
  }
  return `
  <div class="hero">
    <div class="hero-art" aria-hidden="true">${heroArt()}</div>
    <h1>${esc(t('hero_title'))}</h1>
    <p class="lead">${esc(t('hero_sub'))}</p>
    <form class="search" id="searchForm" role="search">
      ${ico('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 20)}
      <input id="q" type="search" autocomplete="off" placeholder="${esc(t('search_ph'))}" aria-label="${esc(t('search_ph'))}">
      <button class="btn primary">${esc(t('go'))}</button>
    </form>
    <ul id="results" class="results" hidden></ul>
    <div class="row wrap gap center">
      <button class="btn" data-act="gps">${ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>', 18)} ${esc(t('use_gps'))}</button>
      <button class="btn" data-act="map">${ico('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', 18)} ${esc(t('pick_map'))}</button>
      <details class="coord"><summary class="btn ghost">${esc(t('coords'))}</summary>
        <form id="coordForm" class="row gap"><input name="lat" type="number" step="any" min="-90" max="90" placeholder="${esc(t('lat'))}" required><input name="lon" type="number" step="any" min="-180" max="180" placeholder="${esc(t('lon'))}" required><button class="btn primary">${esc(t('go'))}</button></form>
      </details>
    </div>
    <p><button class="link" data-act="guide">❓ ${esc(t('guide_title'))}</button></p>
    <h2 class="demo-h">${esc(t('or_demo'))}</h2>
    <p class="muted small center">${esc(t('demo_note'))}</p>
    <div class="demos">${Object.entries(groups).filter(([, a]) => a.length).map(([g, a]) => `<div class="demo-g"><h3>${g}</h3><div class="chips">${a.map(([id, n, lat, lon]) => `<button class="chip demo" data-act="demo" data-id="${id}" data-lat="${lat}" data-lon="${lon}" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`).join('')}</div>
  </div>`;
}
function heroArt() {
  // concentric rotation rings — the visual identity
  let s = '<svg viewBox="0 0 200 200" width="150" height="150">';
  const cols = ['#eda100', '#1baf7a', '#e87ba4', '#eb6834', '#9085e9', '#1baf7a'];
  for (let y = 0; y < 3; y++) for (let m = 0; m < 12; m++) {
    const r0 = 40 + y * 18, r1 = r0 + 15, a0 = (m / 12) * 6.283 + 0.02, a1 = ((m + 1) / 12) * 6.283 - 0.02;
    const p = (a, r) => `${100 + r * Math.sin(a)},${100 - r * Math.cos(a)}`;
    const c = cols[(Math.floor((m + y * 5) / 4)) % cols.length];
    s += `<path d="M${p(a0, r1)} A${r1},${r1} 0 0 1 ${p(a1, r1)} L${p(a1, r0)} A${r0},${r0} 0 0 0 ${p(a0, r0)}Z" fill="${c}" opacity="${0.55 + ((m * 7 + y * 3) % 5) / 10}"/>`;
  }
  return s + `<circle cx="100" cy="100" r="34" fill="var(--brand)"/><text x="100" y="108" text-anchor="middle" font-size="24">🛰️</text></svg>`;
}
function bindLanding(v) {
  const q = $('#q', v), list = $('#results', v);
  let tq;
  const doSearch = async () => {
    const s = q.value.trim(); if (s.length < 2) { list.hidden = true; return; }
    try {
      const r = await geocode(s, lang());
      list.innerHTML = r.length ? r.map((x) => `<li><button data-act="pick" data-lat="${x.lat}" data-lon="${x.lon}" data-name="${esc(x.name)}">${esc(x.name)}</button></li>`).join('') : '<li class="muted">—</li>';
      list.hidden = false;
    } catch { list.hidden = true; toast(t('offline')); }
  };
  q.oninput = () => { clearTimeout(tq); tq = setTimeout(doSearch, 350); };
  $('#searchForm', v).onsubmit = (e) => { e.preventDefault(); doSearch(); };
  $('#coordForm', v).onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); openFarm({ lat: clamp(+f.get('lat'), -90, 90), lon: clamp(+f.get('lon'), -180, 180) }); };
}

// ---------------- CLIMATE TAB ----------------
function renderClimate() {
  const v = $('#v-climate');
  if (!ins) return;
  const C = ins.C;
  const y0 = ins.years[0], y1 = ins.years[ins.years.length - 1];
  const sig = (p) => (p < 0.05 ? `<em class="sig">${esc(t('sig'))}</em>` : `<em class="nsig">${esc(t('notsig'))}</em>`);
  const tile = (label, val, sub, tone = '') => `<div class="kpi ${tone}"><span>${esc(label)}</span><b>${val}</b><small>${sub}</small></div>`;
  const dTdec = U.dTemp(ins.tTrend);
  v.innerHTML = `
  <div class="head"><h1>${esc(t('clim_title'))}</h1><p class="muted">${esc(t('clim_sub', { y0, y1 }))} · ${esc(zoneLabel())}</p></div>
  <div class="now-slot">${nowHTML()}</div>
  <div class="kpis">
    ${tile(t('k_temp'), `${U.n(U.temp(ins.Tann), 1)}${U.tempL}`, '')}
    ${tile(t('k_rain'), `${U.n(U.mm(ins.Pann))} ${U.mmL}`, `CV ${Math.round(ins.acv * 100)}%`)}
    ${tile(t('k_arid'), U.n(ins.aridity, 2), esc(t('arid_idx')), ins.aridity < 0.5 ? 'warn' : '')}
    ${tile(t('k_warm'), `${dTdec >= 0 ? '+' : ''}${U.n(dTdec, 2)}${U.tempL}`, `${esc(t('per_decade'))} · ${sig(ins.tP)}`, ins.tTrend > 0.25 ? 'warn' : '')}
    ${tile(t('k_rainTrend'), `${ins.pTrend >= 0 ? '+' : ''}${U.n(ins.pTrend, 1)}%`, `${esc(t('per_decade'))} · ${sig(ins.pP)}`, ins.pTrend < -5 ? 'warn' : '')}
    ${tile(t('k_dry'), `${Math.round(ins.dryFreq * 100)}%`, `${esc(t('of_years'))}: ${ins.dryYears.slice(-4).join(', ')}`, ins.dryFreq > 0.2 ? 'warn' : '')}
    ${tile(t('k_soilw'), `${Math.round(ins.gwAnn.reduce((a, b) => a + b, 0) / ins.gwAnn.length * 100)}%`, `${ins.gwTrend >= 0 ? '+' : ''}${U.n(ins.gwTrend * 100, 1)} pts ${esc(t('per_decade'))}`)}
    ${tile(t('k_seasons'), String(ins.seasons), ins.wet.map((w, m) => (w ? monthName(m).slice(0, 1) : '·')).join(''))}
  </div>
  <div class="grid2">
    <article class="card"><h2>${esc(t('ch_rain'))}</h2>${CH.rainChart(C.norm, U)}</article>
    <article class="card"><h2>${esc(t('ch_temp'))}</h2>${CH.tempChart(C.norm, C.frost, U)}</article>
    <article class="card"><h2>${esc(t('ch_trendT', { y0 }))}</h2>${CH.trendChart(ins.years, ins.annT.map(U.temp), { slope: ins.tReg.slope * (U.imp ? 1.8 : 1), icpt: U.imp ? ins.tReg.icpt * 1.8 + 32 : ins.tReg.icpt }, U.tempL, 'var(--s4d)')}</article>
    <article class="card"><h2>${esc(t('ch_trendP', { y0 }))}</h2>${CH.trendChart(ins.years, ins.annP.map(U.mm), { slope: U.mm(ins.pReg.slope), icpt: U.mm(ins.pReg.icpt) }, U.mmL, 'var(--s1)', (x) => U.n(x))}</article>
  </div>
  <article class="card" id="shiftCard"><h2>${esc(t('shift_title'))}</h2><p class="muted small">${esc(t('shift_sub'))}</p><div id="shiftBody">${shift ? shiftHTML() : `<div class="skel"></div>`}</div></article>
  <article class="card" id="ndviCard"><h2>${esc(t('ndvi_title'))}</h2><p class="muted small">${esc(t('ndvi_sub'))}</p><div id="ndviBody">${ndvi ? ndviHTML() : `<button class="btn" data-act="ndvi">🛰️ ${esc(t('ndvi_load'))}</button>`}</div></article>
  <div class="next"><button class="btn ghost" data-act="map">🗺️ ${esc(t('map_layers'))}</button><button class="btn primary" data-go="goals">${esc(t('tab_goals'))} →</button></div>`;
  if (!shift) call('shift').then((r) => { shift = r; const b = $('#shiftBody'); if (b) b.innerHTML = shiftHTML(); }).catch(() => {});
  if (!ndvi && navigator.onLine) ACT.ndvi();
}
function shiftHTML() {
  const labels = shift.eras.map((e) => `${t('era_' + e.k)}${e.dT ? ` (${e.dT > 0 ? '+' : ''}${U.n(U.dTemp(e.dT), 1)}°)` : ''}`);
  return CH.shiftTable(shift, labels);
}
function ndviHTML() {
  if (!ndvi.length) return `<p class="muted">${esc(t('ndvi_none'))}</p>`;
  // average NDVI by calendar month to find the peak
  const mo = Array.from({ length: 12 }, () => []);
  ndvi.forEach((p) => mo[+p.d.slice(5, 7) - 1].push(p.v));
  const avg = mo.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : -1));
  const pk = avg.indexOf(Math.max(...avg));
  return CH.ndviChart(ndvi) + `<p class="note">🌿 ${esc(t('ndvi_peak', { m: monthName(pk, 'long') }))}</p>`;
}

// ---------------- Season so far ----------------
function loadRecent() {
  if (!S.farm || !navigator.onLine) return;
  const { lat, lon } = S.farm;
  fetchRecent(lat, lon).then((d) => {
    if (!S.farm || S.farm.lat !== lat || S.farm.lon !== lon || !ins) return;
    recent = recentAnomaly(d, ins.C.norm);
    $$('.now-slot').forEach((el) => (el.innerHTML = nowHTML()));
  }).catch(() => {});
}
function nowHTML() {
  const a = recent;
  if (!a || !Number.isFinite(a.pct)) return '';
  const dry = a.pct < 75 || (a.gw < a.gwN - 0.08), wet = a.pct > 130 || (a.gw > a.gwN + 0.1);
  const hot = a.dT > 1;
  const tone = dry ? 'warn' : wet ? 'info' : 'ok';
  const fmtD = (s2) => `${s2.slice(6, 8)} ${monthName(+s2.slice(4, 6) - 1)}`;
  return `<section class="now ${tone}"><div class="now-h"><b>🛰️ ${esc(t('now_title'))}</b><small>${esc(fmtD(a.from))} – ${esc(fmtD(a.to))}</small></div>
    <div class="now-k">
      <div><span>🌧️ ${esc(t('now_rain'))}</span><b>${U.n(U.mm(a.P))} ${U.mmL}</b><small>${esc(t('of_normal', { pct: Math.round(a.pct) }))}</small></div>
      <div><span>🌡️ ${esc(t('now_temp'))}</span><b>${a.dT >= 0 ? '+' : '−'}${U.n(Math.abs(U.dTemp(a.dT)), 1)}${U.tempL}</b><small>&nbsp;</small></div>
      ${Number.isFinite(a.gw) ? `<div><span>💧 ${esc(t('now_soil'))}</span><b>${Math.round(a.gw * 100)}%</b><small>${esc(t('normal_is', { v: Math.round(a.gwN * 100) + '%' }))}</small></div>` : ''}
    </div>
    <p>${esc(t(dry ? 'now_dry' : wet ? 'now_wet' : 'now_ok'))}${hot ? ' ' + esc(t('now_hot')) : ''}</p>
    <p class="muted small">${esc(t('now_sub'))}</p></section>`;
}

// ---------------- GOALS TAB ----------------
// typical local practice for demo farms (so the baseline comparison is realistic)
const DEMO_PRACTICE = {
  iowa: { current: ['maize', 'soybean'] }, fresno: { irrigation: 'full', current: ['cotton', 'wheat'] },
  saskatoon: { current: ['wheat', 'canola'] }, sinaloa: { irrigation: 'full', current: ['maize'] },
  matogrosso: { current: ['soybean'], currentSec: ['maize'] }, pampas: { current: ['soybean', 'maize'] }, peru: { current: ['potato', 'quinoa'] },
  kano: { current: ['sorghum', 'cowpea'] }, tamale: { current: ['maize'] }, addis: { current: ['teff', 'wheat'] },
  nakuru: { current: ['maize'] }, lilongwe: { current: ['maize'] }, free_state: { current: ['maize'] },
  nile: { irrigation: 'full', current: ['wheat'], currentSec: ['maize'] }, cordoba: { current: ['wheat', 'sunflower'] },
  france: { current: ['wheat', 'maize'] }, ukraine: { current: ['wheat', 'sunflower'] },
  punjab: { irrigation: 'full', current: ['rice'], currentSec: ['wheat'] }, bangladesh: { irrigation: 'supplemental', current: ['rice'], currentSec: ['wheat'] },
  heilongjiang: { current: ['maize', 'soybean'] }, mekong: { irrigation: 'full', current: ['rice'], currentSec: ['rice'] },
  java: { irrigation: 'supplemental', current: ['rice', 'maize'] }, wagga: { current: ['wheat', 'canola'] },
};
const PRESETS = {
  balanced: { soil: 3, water: 3, profit: 3, resil: 3, simple: 2 },
  soil: { soil: 5, water: 3, profit: 2, resil: 3, simple: 1 },
  income: { soil: 2, water: 2, profit: 5, resil: 3, simple: 2 },
  drought: { soil: 3, water: 5, profit: 2, resil: 5, simple: 2 },
  small: { soil: 3, water: 3, profit: 3, resil: 4, simple: 4 },
};
function renderGoals() {
  const v = $('#v-goals');
  const P = S.prio, Cn = S.cons;
  const pr = [['soil', '🪱'], ['water', '💧'], ['profit', '💰'], ['resil', '🛡️'], ['simple', '🧭']];
  const crops = MAIN_CROPS;
  v.innerHTML = `
  <div class="head"><h1>${esc(t('goals_title'))}</h1><p class="muted">${esc(t('goals_sub'))}</p></div>
  <article class="card">
    <h2>${esc(t('presets'))}</h2>
    <div class="chips">${Object.keys(PRESETS).map((k) => `<button class="chip ${JSON.stringify(PRESETS[k]) === JSON.stringify(P) ? 'on' : ''}" data-act="preset" data-k="${k}">${esc(t('pr_' + k))}</button>`).join('')}</div>
    <div class="sliders">${pr.map(([k, ic]) => `
      <div class="sl"><label for="p-${k}"><span class="sl-ic">${ic}</span><span><b>${esc(t('p_' + k))}</b><small>${esc(t('pd_' + k))}</small></span><output>${P[k]}</output></label>
      <input type="range" id="p-${k}" min="0" max="5" step="1" value="${P[k]}" data-prio="${k}" style="--v:${P[k] * 20}%"></div>`).join('')}</div>
  </article>
  <article class="card">
    <h2>${esc(t('constraints'))}</h2>
    <div class="form">
      <label>${esc(t('rot_len'))}</label>
      <div class="seg">${['auto', '2', '3', '4', '5'].map((o) => `<button role="radio" aria-checked="${String(Cn.len) === o}" data-act="cons" data-k="len" data-v="${o}">${o === 'auto' ? esc(t('auto')) : `${o} ${esc(t('years'))}`}</button>`).join('')}</div>
      <label class="tog"><input type="checkbox" data-cons="covers" ${Cn.covers ? 'checked' : ''}> ${esc(t('allow_cover'))}</label>
      <label class="tog"><input type="checkbox" data-cons="double" ${Cn.double ? 'checked' : ''}> ${esc(t('allow_double'))}</label>
      <label class="tog"><input type="checkbox" data-cons="hort" ${Cn.hort ? 'checked' : ''}> ${esc(t('allow_hort'))}</label>
      <label class="tog"><input type="checkbox" data-cons="forage" ${Cn.forage ? 'checked' : ''}> ${esc(t('allow_forage'))}</label>
    </div>
    <h3>${esc(t('must_grow'))} / ${esc(t('never_grow'))}</h3>
    <p class="muted small">${esc(t('tap_crops'))}</p>
    <div class="chips">${crops.map((c) => { const st = Cn.include.includes(c.id) ? 'inc' : Cn.exclude.includes(c.id) ? 'exc' : ''; return `<button class="chip crop ${st}" data-act="tri" data-id="${c.id}" aria-pressed="${!!st}">${st === 'inc' ? '✔ ' : st === 'exc' ? '✖ ' : ''}${c.ic} ${esc(cropName(c.id))}</button>`; }).join('')}</div>
  </article>
  <article class="card">
    <h2>${esc(t('prices'))}</h2>
    <div class="fields">
      <label class="numf"><span>${esc(t('n_price'))}</span><span class="numw"><input type="number" step="0.05" min="0" value="${S.prices.n}" data-price="n"><em>$</em></span></label>
      <label class="numf"><span>${esc(t('w_price'))}</span><span class="numw"><input type="number" step="0.01" min="0" value="${S.prices.irr}" data-price="irr"><em>$</em></span></label>
    </div>
  </article>
  <div class="next"><button class="btn primary" data-go="plans">${esc(t('tab_plans'))} →</button></div>`;
  v.oninput = (e) => {
    const el = e.target;
    if (el.dataset.prio) { S.prio[el.dataset.prio] = +el.value; el.style.setProperty('--v', `${el.value * 20}%`); el.previousElementSibling.querySelector('output').textContent = el.value; save(); rerun(); }
    if (el.dataset.price) { S.prices[el.dataset.price] = +el.value; save(); rerun(); }
  };
  v.onchange = (e) => { const el = e.target; if (el.dataset.cons) { S.cons[el.dataset.cons] = el.checked; save(); rerun(); } };
}

// ---------------- PLANS TAB ----------------
const SC = ['base', 'recent', 'y2040', 'y2050', 'hotdry', 'custom'];
function planTitle(r) {
  return r.seq.map((id, i) => {
    const y = r.years[i];
    const sec = y.sec.type === 'cover' || y.sec.type === 'double' ? `<small class="sec ${y.sec.type}">+ ${CROP[y.sec.id].ic} ${esc(cropName(y.sec.id))}</small>` : '';
    return `<span class="seqc" style="--c:${famColor(id)}">${CROP[id].ic} ${esc(cropName(id))}${sec}</span>`;
  }).join('<span class="arr">→</span>');
}
function delta(v, b, fmt, goodUp = true, unit = '') {
  if (b == null || !Number.isFinite(b)) return `<b>${fmt(v)}</b>${unit ? ` <small>${unit}</small>` : ''}`;
  const d = v - b, good = goodUp ? d > 0 : d < 0;
  const show = Math.abs(d) > 1e-6 && +String(fmt(Math.abs(d))).replace(/[^\d.]/g, '') > 0;
  return `<b>${fmt(v)}</b>${unit ? ` <small>${unit}</small>` : ''}${show ? ` <em class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</em>` : ''}`;
}
function metricsRow(r, b, compact = false) {
  const items = [
    ['🪱', t('m_soc'), delta(r.socPct, b?.socPct, (x) => `${x.toFixed(1)}%`, true)],
    ['🛡️', t('m_ero'), delta(U.tha(r.erosion), b ? U.tha(b.erosion) : null, (x) => x.toFixed(1), false, U.thaL + '/yr')],
    ['🧪', t('m_fert'), delta(U.kg(r.fert), b ? U.kg(b.fert) : null, (x) => Math.round(x), false, U.kgL)],
    ['💧', t('m_irr'), delta(U.mm(r.irr), b ? U.mm(b.irr) : null, (x) => Math.round(x), false, U.mmL + '/yr')],
    ['💰', t('m_gm'), delta(U.money(r.gm), b ? U.money(b.gm) : null, (x) => Math.round(x), true, U.moneyL)],
  ];
  if (!compact) items.push(
    ['🌧️', t('m_p10'), delta(U.money(r.p10), b ? U.money(b.p10) : null, (x) => Math.round(x), true, U.moneyL)],
    ['⚠️', t('m_fail'), delta(r.pFail * 100, b ? b.pFail * 100 : null, (x) => `${Math.round(x)}%`, false)],
    ['🌍', t('m_co2'), delta(r.co2e, b?.co2e, (x) => x.toFixed(2), true, t('u_co2'))],
    ['🌱', t('m_living'), delta(r.livingFrac * 100, b ? b.livingFrac * 100 : null, (x) => `${Math.round(x)}%`, true)],
  );
  return `<div class="mets">${items.map(([ic, l, v]) => `<div class="met"><span>${ic} ${esc(l)}</span>${v}</div>`).join('')}</div>`;
}
function reasonText(x) {
  const p = { ...x.p };
  if (p.crop) p.crop = cropName(p.crop);
  if (p.from != null) p.from = monthName(p.from, 'long');
  if (p.to != null) p.to = monthName(p.to, 'long');
  if (p.mm != null) p.mm = `${U.n(U.mm(p.mm))} ${U.mmL}`.replace(/ (mm|in)$/, '');
  return t(x.k, p);
}
const SC_KEYS = ['soil', 'water', 'profit', 'resil', 'simple'];
const SC_IC = { soil: '🪱', water: '💧', profit: '💰', resil: '🛡️', simple: '🧭' };
function miniScores(r) {
  return `<div class="minis">${SC_KEYS.map((k) => `<div class="mini" data-tip="${esc(t('p_' + k))}: ${Math.round(r.scores[k])}/100"><span><em>${SC_IC[k]}</em><s>${esc(t('s_' + k))}</s></span><b>${Math.round(r.scores[k])}</b><i><u style="width:${Math.max(3, r.scores[k])}%"></u></i></div>`).join('')}</div>`;
}

function renderPlans() {
  const v = $('#v-plans');
  if (!res) { v.innerHTML = `<div class="skel tall"></div>`; return; }
  const b = res.baseline;
  const sc = res.scenario || {};
  v.innerHTML = `
  <div class="head row wrap gap" style="justify-content:space-between"><div><h1>${esc(t('plans_title'))}</h1><p class="muted">${esc(t('plans_sub', { n: U.n(res.evaluated), y: res.climate.years.length, ms: res.ms }))}</p></div>
    <button class="btn" data-act="report">📄 ${esc(t('report'))}</button></div>
  <div class="lens card flat">
    <span class="lens-l">🔭 ${esc(t('lens'))}</span>
    <div class="chips">${SC.map((k) => `<button class="chip ${S.scen.mode === k ? 'on' : ''}" data-act="scen" data-k="${k}">${esc(t('sc_' + k))}</button>`).join('')}</div>
    ${S.scen.mode === 'custom' ? `<div class="row wrap gap custom-sc">
      <label>${esc(t('dT'))} <output>${S.scen.dT > 0 ? '+' : ''}${S.scen.dT} °C</output><input type="range" min="-1" max="5" step="0.5" value="${S.scen.dT}" data-scen="dT"></label>
      <label>${esc(t('dP'))} <output>${S.scen.dP > 0 ? '+' : ''}${S.scen.dP}%</output><input type="range" min="-40" max="30" step="5" value="${S.scen.dP}" data-scen="dP"></label></div>` : ''}
    ${(sc.dT || sc.dP) ? `<p class="note small">🌡️ ${esc(t('sc_note', { dT: `${sc.dT > 0 ? '+' : ''}${(sc.dT || 0).toFixed(1)}`, dP: `${sc.dP > 0 ? '+' : ''}${Math.round((sc.dP || 0) * 100)}` }))}</p>` : ''}
  </div>
  <div class="now-slot">${nowHTML()}</div>
  ${b ? `<article class="card baseline">
    <div class="pc-top"><div class="pc-w">${CH.wheel(b, 76, false)}</div><div class="pc-t"><span class="eyebrow">${esc(t('your_current'))}</span><div class="seq">${planTitle(b)}</div></div>${CH.donut(b.total, 56, 'var(--s2)')}</div>
    ${miniScores(b)}${metricsRow(b, null, true)}
    <div class="row gap"><button class="btn ghost sm" data-act="openPlan" data-i="-1">${esc(t('details'))}</button></div>
  </article>` : `<p class="note warn">${esc(t('cur_fail'))}</p>`}
  ${res.droppedInclude?.length ? `<p class="note warn">⚠️ ${res.droppedInclude.map((id) => esc(cropName(id))).join(', ')}: ${esc(t('unsuitable'))} — ${esc(t('cur_fail'))}</p>` : ''}
  ${res.top.length ? `${summary(res.top[0], b)}<div class="plans">${res.top.map((r, i) => planCard(r, i, b)).join('')}</div>` : `<p class="note warn">${esc(t('no_plans'))}</p>`}`;
  v.oninput = (e) => { const el = e.target; if (el.dataset.scen) { S.scen[el.dataset.scen] = +el.value; el.previousElementSibling.textContent = `${el.value > 0 ? '+' : ''}${el.value}${el.dataset.scen === 'dT' ? ' °C' : '%'}`; save(); rerun(); } };
}
function summary(r, b) {
  if (!b) return '';
  const items = [
    ['💰', t('m_gm'), U.money(r.gm - b.gm), (x) => `${x >= 0 ? '+' : '−'}${U.n(Math.abs(x))}`, U.moneyL, true],
    ['🧪', t('m_fert'), U.kg(r.fert - b.fert), (x) => `${x >= 0 ? '+' : '−'}${U.n(Math.abs(x))}`, U.kgL, false],
    ...(Math.abs(r.irr - b.irr) > 5 ? [['💧', t('m_irr'), U.mm(r.irr - b.irr), (x) => `${x >= 0 ? '+' : '−'}${U.n(Math.abs(x))}`, U.mmL + '/yr', false]] : []),
    ['🪱', t('m_soc'), r.socPct - b.socPct, (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`, '%', true],
    ['🛡️', t('m_ero'), b.erosion ? ((r.erosion - b.erosion) / b.erosion) * 100 : 0, (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x))}`, '%', false],
    ['⚠️', t('m_fail'), (r.pFail - b.pFail) * 100, (x) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x))}`, 'pts', false],
  ];
  return `<section class="summary"><div class="sum-h"><span class="eyebrow">#1 ${esc(t('vs_current'))}</span><div class="seq">${planTitle(r)}</div></div>
    <div class="sum-k">${items.map(([ic, l, v, f, u, upGood]) => { const good = Math.abs(v) < 0.05 ? '' : (v > 0) === upGood ? 'up' : 'down'; return `<div><span>${ic} ${esc(l)}</span><b class="${good}">${f(v)}<small> ${esc(u)}</small></b></div>`; }).join('')}</div></section>`;
}
function planCard(r, i, b) {
  const good = r.reasons.filter((x) => !x.warn).slice(0, 3), warn = r.reasons.filter((x) => x.warn).slice(0, 1);
  return `<article class="card plan ${i === 0 ? 'best' : ''}">
    <div class="pc-top">
      <div class="pc-w">${CH.wheel(r, 76, false)}</div>
      <div class="pc-t"><span class="eyebrow">#${i + 1}${i === 0 ? ` · ★ ${esc(t('best'))}` : ''} · ${r.N} ${esc(t('years'))}</span><div class="seq">${planTitle(r)}</div></div>
      ${CH.donut(r.total, 56)}
    </div>
    ${miniScores(r)}
    ${metricsRow(r, b, true)}
    <ul class="reasons">${good.map((x) => `<li>${x.ic} ${esc(reasonText(x))}</li>`).join('')}${warn.map((x) => `<li class="w">${x.ic} ${esc(reasonText(x))}</li>`).join('')}</ul>
    <div class="row gap wrap"><button class="btn primary sm" data-act="openPlan" data-i="${i}">${esc(t('details'))} →</button>
    <button class="btn ghost sm" data-act="speak" data-i="${i}" aria-label="${esc(t('speak'))}">🔊 ${esc(t('speak'))}</button>
    <button class="btn ghost sm" data-act="share" data-i="${i}">↗ ${esc(t('share'))}</button></div>
  </article>`;
}

// ---------------- Plan detail sheet ----------------
function sheet(html) {
  let s = $('#sheet');
  if (!s) { s = document.createElement('div'); s.id = 'sheet'; s.className = 'sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); document.body.append(s); }
  s.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet-p">${html}</div>`;
  s.hidden = false; document.body.classList.add('noscroll');
  $('.sheet-p', s).scrollTop = 0;
  setTimeout(() => $('.sheet-p .x', s)?.focus(), 30);
}
function closeSheet() { const s = $('#sheet'); if (s) { s.hidden = true; document.body.classList.remove('noscroll'); } openPlan = null; stopSpeak(); }

function planDetail(r, label) {
  const b = res.baseline, isBase = r === b;
  const names = [label, ...(b && !isBase ? [t('your_current')] : []), ...(res.top[0] && r !== res.top[0] && !isBase ? [`#1`] : [])];
  const rows = SC_KEYS.map((k) => ({ label: t('p_' + k), vals: [r.scores[k], ...(b && !isBase ? [b.scores[k]] : []), ...(res.top[0] && r !== res.top[0] && !isBase ? [res.top[0].scores[k]] : [])] }));
  const socSeries = [{ name: label, color: 'var(--s1)', vals: r.socTraj.map(U.tha) }];
  if (b && !isBase) socSeries.push({ name: t('your_current'), color: 'var(--s2)', vals: b.socTraj.map(U.tha), dash: true });
  const fails = r.hist.filter((h) => h.fail).length;
  return `
  <div class="sh-head"><div><span class="eyebrow">${esc(label)} · ${r.N} ${esc(t('years'))} · ${esc(t('score'))} ${Math.round(r.total)}</span><div class="seq">${planTitle(r)}</div></div>
    <button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div>
  <div class="sh-actions row gap wrap noprint">
    <button class="btn sm" data-act="print">🖨️ ${esc(t('print'))}</button>
    <button class="btn sm" data-act="reportOpen">📄 ${esc(t('report'))}</button>
    <button class="btn sm" data-act="speakOpen">🔊 ${esc(t('speak'))}</button>
    <button class="btn sm" data-act="shareOpen">↗ ${esc(t('share'))}</button>
    <button class="btn sm" data-act="waOpen">💬 ${esc(t('whatsapp'))}</button>
  </div>
  <div class="print-only"><h1>FieldShift — ${esc(S.farm?.name || '')}</h1><p>${S.farm?.lat.toFixed(3)}, ${S.farm?.lon.toFixed(3)} · ${esc(zoneLabel())} · NASA POWER ${res.climate.years[0]}–${res.climate.years[res.climate.years.length - 1]} · ${new Date().toLocaleDateString(lang())}</p></div>
  <div class="grid2 tight">
    <section class="card flat center"><h3>${esc(t('wheel'))}</h3>${CH.wheel(r, 240, true)}</section>
    <section class="card flat"><h3>${esc(t('why'))}</h3>
      <ul class="reasons big">${r.reasons?.map((x) => `<li class="${x.warn ? 'w' : ''}">${x.ic} ${esc(reasonText(x))}</li>`).join('') || ''}</ul></section>
  </div>
  <section class="card flat"><h3>${esc(t('calendar'))}</h3>${CH.calendar(r)}</section>
  <section class="card flat"><h3>✅ ${esc(t('act_title'))}</h3><p class="muted small">${esc(t('act_sub'))}</p>${actionsHTML(r)}
    <button class="btn sm noprint" data-act="ics">📅 ${esc(t('ics'))}</button></section>
  <section class="card flat">${metricsRow(r, isBase ? null : b)}</section>
  <div class="grid2 tight">
    <section class="card flat"><h3>${esc(t('score_vs'))}</h3>${CH.compareBars(rows, names)}</section>
    <section class="card flat"><h3>${esc(t('soc_chart'))}</h3>${CH.linesChart(socSeries, t('yr'), `t C/${U.imp ? 'ac' : 'ha'}`)}</section>
  </div>
  <section class="card flat tm"><h3>⏳ ${esc(t('tm_title', { y0: r.hist[0]?.y ?? '', y1: r.hist[r.hist.length - 1]?.y ?? '' }))}</h3>
    <p class="muted small">${esc(t('tm_sub'))} <b>${esc(t('tm_fails', { n: fails }))}</b></p>
    ${r.hist.length ? CH.timeMachine(r.hist, isBase ? null : b?.hist, U) : ''}</section>
  <section class="card flat"><h3>${esc(t('year_table'))}</h3>
    <div class="tbl-w"><table class="tbl"><thead><tr><th>${esc(t('yr'))}</th><th>${esc(t('crop'))}</th><th>${esc(t('sow'))}</th><th>${esc(t('harvest'))}</th><th>${esc(t('exp_yield'))}</th><th>${esc(t('m_fert'))}</th><th>${esc(t('m_irr'))}</th><th>${esc(t('m_fail'))}</th><th>${esc(t('then'))}</th></tr></thead>
    <tbody>${r.years.map((y, i) => `<tr><td>${i + 1}</td><td>${CROP[y.id].ic} ${esc(cropName(y.id))}</td><td>${monthName(y.plant)}</td><td>${monthName(y.harv)}</td><td>${U.n(U.tha(y.yield), 1)} ${U.thaL}</td><td>${U.n(U.kg(y.fert))}</td><td>${U.n(U.mm(y.irr))}</td><td>${Math.round(y.pFail * 100)}%</td><td>${y.sec.id ? `${CROP[y.sec.id].ic} ${esc(cropName(y.sec.id))} <small>(${esc(t(y.sec.type))}, ${monthName(y.sec.start)}–${monthName(y.sec.end)})</small>` : esc(t(y.sec.type === 'none' ? 'none' : 'fallow'))}</td></tr>`).join('')}</tbody></table></div>
  </section>
  <p class="muted small">${esc(t('disclaimer'))}</p>`;
}

// ---------------- Action plan ----------------
// Turns a rotation into dated field operations, starting from the next season.
function actions(r) {
  const ev = [];
  r.years.forEach((y, i) => {
    const c = CROP[y.id], o = i * 12;
    ev.push({ m: o + y.plant, k: 'act_sow', p: { crop: y.id }, ic: '🌱' });
    if (c.nfix) ev.push({ m: o + y.plant, k: 'act_inoc', p: { crop: y.id }, ic: '🧫' });
    if (y.fert > 10) ev.push({ m: o + y.plant, k: 'act_fert', p: { crop: y.id, n: Math.round(U.kg(y.fert)) }, ic: '🧪' });
    if (y.irr > 20) ev.push({ m: o + y.plant + 1, k: 'act_irr', p: { crop: y.id, mm: `${U.n(U.mm(y.irr))} ${U.mmL}` }, ic: '💧' });
    if (y.pFail > 0.15) ev.push({ m: o + y.plant - 1, k: 'act_variety', p: { crop: y.id }, ic: '⚠️' });
    ev.push({ m: o + y.harv, k: 'act_harvest', p: { crop: y.id }, ic: '🌾' });
    if (y.sec.type === 'cover') {
      ev.push({ m: o + y.sec.start, k: 'act_cover', p: { crop: y.sec.id }, ic: '🍀' });
      if (!y.sec.mulch) ev.push({ m: o + y.sec.end, k: 'act_term', p: { crop: y.sec.id }, ic: '✂️' });
    } else if (y.sec.type === 'double') {
      ev.push({ m: o + y.sec.start, k: 'act_double', p: { crop: y.sec.id }, ic: '➕' });
      ev.push({ m: o + y.sec.end, k: 'act_harvest', p: { crop: y.sec.id }, ic: '🌾' });
    }
  });
  ev.sort((a, b) => a.m - b.m);
  // shift so the first operation falls in the coming 12 months
  const now = new Date(), cm = now.getFullYear() * 12 + now.getMonth();
  const first = ev[0]?.m ?? 0;
  const start = cm + ((((first - now.getMonth()) % 12) + 12) % 12) - first;
  return ev.map((e) => { const abs = start + e.m; return { ...e, year: Math.floor(abs / 12), month: ((abs % 12) + 12) % 12, text: t(e.k, { ...e.p, crop: cropName(e.p.crop) }) }; });
}
function actionsHTML(r) {
  const ev = actions(r);
  let h = '<ol class="acts">', last = '';
  for (const e of ev) {
    const lbl = `${monthName(e.month, 'long')} ${e.year}`;
    h += `<li>${lbl !== last ? `<span class="act-m">${esc(lbl)}</span>` : '<span class="act-m"></span>'}<span>${e.ic} ${esc(e.text)}</span></li>`;
    last = lbl;
  }
  return h + '</ol>';
}
function downloadICS(r) {
  const ev = actions(r);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FieldShift//EN', 'CALSCALE:GREGORIAN'];
  ev.forEach((e, i) => {
    const d = `${e.year}${pad(e.month + 1)}01`;
    const d2 = `${e.year}${pad(e.month + 1)}08`;
    lines.push('BEGIN:VEVENT', `UID:fs-${Date.now()}-${i}@fieldshift`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
      `SUMMARY:${e.text.replace(/[,;]/g, (x) => '\\' + x)}`, `DESCRIPTION:FieldShift — ${(S.farm?.name || '').replace(/[,;]/g, ' ')}`,
      'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', `DESCRIPTION:${e.text.replace(/[,;]/g, ' ')}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'fieldshift-plan.ics';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------- Report builder ----------------
const REP_SECTIONS = ['farm', 'soil', 'climate', 'now', 'suit', 'compare', 'plan', 'actions', 'tm', 'methods'];
let repOpt = { sec: Object.fromEntries(REP_SECTIONS.map((k) => [k, true])), plan: 0, n: 5 };
function planList() {
  const L = res.top.map((r, i) => [String(i), `#${i + 1} — ${planText(r)}`]);
  if (res.baseline) L.push(['cur', `${t('your_current')} — ${planText(res.baseline)}`]);
  if (custom) L.push(['custom', `${t('builder')} — ${planText(custom)}`]);
  return L;
}
const planText = (r) => r.seq.map((id, i) => cropName(id) + (r.years[i].sec.id ? ` + ${cropName(r.years[i].sec.id)}` : '')).join(' → ');
const pickPlan = (k) => (k === 'cur' ? res.baseline : k === 'custom' ? custom : res.top[+k]) || res.top[0] || res.baseline;
function reportSheet(preset) {
  if (preset != null) repOpt.plan = String(preset);
  sheet(`<div class="sh-head"><h2>📄 ${esc(t('rep_title'))}</h2><button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div>
  <p class="muted">${esc(t('rep_sub'))}</p>
  <div class="card flat"><h3>${esc(t('rep_sections'))}</h3>
    <div class="rep-secs">${REP_SECTIONS.map((k) => `<label class="tog"><input type="checkbox" data-rsec="${k}" ${repOpt.sec[k] ? 'checked' : ''}> ${esc(t('sec_' + k))}</label>`).join('')}</div>
    <div class="form">
      <label for="repPlan">${esc(t('rep_plan'))}</label><select id="repPlan">${planList().map(([k, l]) => `<option value="${k}" ${String(repOpt.plan) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label for="repN">${esc(t('rep_n'))}</label><select id="repN">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${repOpt.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div></div>
  <div class="row wrap gap"><button class="btn primary" data-act="repPrint">🖨️ ${esc(t('rep_print'))}</button><button class="btn" data-act="repCSV">📊 ${esc(t('rep_csv'))}</button><button class="btn" data-act="repJSON">{ } ${esc(t('rep_json'))}</button></div>`);
  const p = $('#sheet');
  p.onchange = (e) => {
    const el = e.target;
    if (el.dataset.rsec) repOpt.sec[el.dataset.rsec] = el.checked;
    if (el.id === 'repPlan') repOpt.plan = el.value;
    if (el.id === 'repN') repOpt.n = +el.value;
  };
}
function reportHTML() {
  const O = repOpt.sec, r = pickPlan(String(repOpt.plan)), b = res.baseline, p = S.practice, sl = S.soil;
  const C = ins.C, y0 = ins.years[0], y1 = ins.years[ins.years.length - 1];
  const h = [];
  h.push(`<header class="rep-h">${logo()}<div><h1>FieldShift — ${esc(S.farm.name || '')}</h1><p>${S.farm.lat.toFixed(4)}°, ${S.farm.lon.toFixed(4)}° · ${esc(zoneLabel())} · NASA POWER ${y0}–${y1} · ${esc(t('generated'))} ${new Date().toLocaleDateString(lang())}</p></div></header>`);
  if (O.farm) h.push(`<section><h2>${esc(t('sec_farm'))}</h2><table class="tbl kv"><tbody>
    <tr><th>${esc(t('irrigation'))}</th><td>${esc(t('irr_' + p.irrigation))}</td><th>${esc(t('tillage'))}</th><td>${esc(t('till_' + p.tillage))}</td></tr>
    <tr><th>${esc(t('residue'))}</th><td>${esc(t('res_' + p.residue))}</td><th>${esc(t('drainage'))}</th><td>${esc(t('dr_' + p.drainage))}</td></tr>
    <tr><th>${esc(t('slope'))}</th><td>${p.slope}%</td><th>${esc(t('manure'))}</th><td>${p.manure} ${esc(t('t_ha_yr'))}</td></tr>
    <tr><th>${esc(t('current_rot'))}</th><td colspan="3">${esc(b ? planText(b) : p.current.map(cropName).join(' → '))}</td></tr></tbody></table></section>`);
  if (O.soil) h.push(`<section><h2>${esc(t('sec_soil'))}</h2><table class="tbl kv"><tbody>
    <tr><th>${esc(t('texture'))}</th><td>${esc(textureClass(sl.sand, sl.silt, sl.clay).replace(/_/g, ' '))}</td><th>${esc(t('sand'))} / ${esc(t('silt'))} / ${esc(t('clay'))}</th><td>${sl.sand} / ${sl.silt} / ${sl.clay} %</td></tr>
    <tr><th>${esc(t('soc'))}</th><td>${sl.soc} g/kg</td><th>${esc(t('ph'))}</th><td>${sl.ph}</td></tr>
    <tr><th>${esc(t('bd'))}</th><td>${sl.bd} g/cm³</td><th>${esc(t('cec'))}</th><td>${sl.cec ?? '–'} cmol/kg</td></tr></tbody></table>
    <p class="muted small">${esc(S.soilEdited ? '✎' : t('soil_src'))}</p></section>`);
  if (O.climate) h.push(`<section><h2>${esc(t('sec_climate'))}</h2>
    <div class="kpis">${[[t('k_temp'), `${U.n(U.temp(ins.Tann), 1)}${U.tempL}`], [t('k_rain'), `${U.n(U.mm(ins.Pann))} ${U.mmL}`], [t('k_arid'), U.n(ins.aridity, 2)], [t('k_warm'), `${ins.tTrend >= 0 ? '+' : ''}${U.n(U.dTemp(ins.tTrend), 2)}${U.tempL} / 10 yr`], [t('k_rainTrend'), `${ins.pTrend >= 0 ? '+' : ''}${U.n(ins.pTrend, 1)}% / 10 yr`], [t('k_dry'), `${Math.round(ins.dryFreq * 100)}%`]].map(([l, v]) => `<div class="kpi"><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div>
    <div class="grid2">${CH.rainChart(C.norm, U)}${CH.tempChart(C.norm, C.frost, U)}</div></section>`);
  if (O.now && recent) h.push(`<section>${nowHTML()}</section>`);
  if (O.suit) h.push(`<section><h2>${esc(t('sec_suit'))}</h2><table class="tbl"><thead><tr><th>${esc(t('crop'))}</th><th>${esc(t('score'))}</th><th>${esc(t('sow'))}–${esc(t('harvest'))}</th><th>${esc(t('exp_yield'))}</th><th>${esc(t('m_fail'))}</th><th>${esc(t('limit_by'))}</th></tr></thead><tbody>
    ${res.suit.filter((x) => !CROP[x.id].cover).slice(0, 18).map((x) => `<tr><td>${CROP[x.id].ic} ${esc(cropName(x.id))}</td><td>${Math.round(x.S * 100)}</td><td>${x.plant != null ? `${monthName(x.plant)}–${monthName(x.harv)}` : '–'}</td><td>${x.yield ? `${U.n(U.tha(x.yield), 1)} ${U.thaL}` : '–'}</td><td>${Math.round((x.pFail || 0) * 100)}%</td><td>${x.limit ? esc(t('lim_' + x.limit)) : '—'}</td></tr>`).join('')}</tbody></table></section>`);
  if (O.compare) {
    const rows = [...res.top.slice(0, repOpt.n).map((x, i) => [`#${i + 1}`, x]), ...(b ? [[t('your_current'), b]] : [])];
    h.push(`<section><h2>${esc(t('sec_compare'))}</h2><div class="tbl-w"><table class="tbl cmp"><thead><tr><th></th><th>${esc(t('plans_title'))}</th><th>${esc(t('score'))}</th>${SC_KEYS.map((k) => `<th>${esc(t('s_' + k))}</th>`).join('')}<th>${esc(t('m_soc'))}</th><th>${esc(t('m_ero'))}</th><th>${esc(t('m_fert'))}</th><th>${esc(t('m_irr'))}</th><th>${esc(t('m_gm'))}</th><th>${esc(t('m_fail'))}</th></tr></thead><tbody>
    ${rows.map(([lab, x]) => `<tr><td><b>${esc(lab)}</b></td><td>${esc(planText(x))}</td><td><b>${Math.round(x.total)}</b></td>${SC_KEYS.map((k) => `<td>${Math.round(x.scores[k])}</td>`).join('')}<td>${x.socPct.toFixed(1)}%</td><td>${U.n(U.tha(x.erosion), 1)}</td><td>${U.n(U.kg(x.fert))}</td><td>${U.n(U.mm(x.irr))}</td><td>${U.n(U.money(x.gm))}</td><td>${Math.round(x.pFail * 100)}%</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">${esc(t('m_ero'))}: ${U.thaL}/yr · ${esc(t('m_fert'))}: ${U.kgL} · ${esc(t('m_irr'))}: ${U.mmL}/yr · ${esc(t('m_gm'))}: ${U.moneyL}</p></section>`);
  }
  if (r && O.plan) {
    h.push(`<section><h2>${esc(t('sec_plan'))}: ${esc(planText(r))}</h2>
      <div class="grid2"><div class="center">${CH.wheel(r, 220, true)}</div><ul class="reasons big">${(r.reasons || []).map((x) => `<li>${x.ic} ${esc(reasonText(x))}</li>`).join('')}</ul></div>
      ${CH.calendar(r)}${metricsRow(r, r === b ? null : b)}
      ${CH.linesChart([{ name: planText(r).slice(0, 40), color: 'var(--s1)', vals: r.socTraj.map(U.tha) }, ...(b && r !== b ? [{ name: t('your_current'), color: 'var(--s2)', vals: b.socTraj.map(U.tha), dash: true }] : [])], t('yr'), `t C/${U.imp ? 'ac' : 'ha'}`)}</section>`);
  }
  if (r && O.actions) h.push(`<section><h2>${esc(t('act_title'))}</h2>${actionsHTML(r)}</section>`);
  if (r && O.tm && r.hist.length) h.push(`<section><h2>${esc(t('tm_title', { y0: r.hist[0].y, y1: r.hist[r.hist.length - 1].y }))}</h2>${CH.timeMachine(r.hist, r === b ? null : b?.hist, U)}<p class="muted small">${esc(t('tm_fails', { n: r.hist.filter((x) => x.fail).length }))}</p></section>`);
  if (O.methods) h.push(`<section><h2>${esc(t('sec_methods'))}</h2><p class="small">NASA POWER (monthly ${y0}–${y1}, climatology, near-real-time daily) · NASA GIBS · MODIS MOD13Q1 NDVI (ORNL DAAC) · ISRIC SoilGrids 2.0 · FAO Ecocrop / FAO-56. ${esc(t('about_body'))}</p><p class="small"><b>${esc(t('disclaimer'))}</b></p><p class="small muted">https://samuelakosaonyejekwe.github.io/fieldshift/</p></section>`);
  return h.join('');
}
function printReport() {
  let el = $('#report');
  if (!el) { el = document.createElement('div'); el.id = 'report'; document.body.append(el); }
  CH.setWidth(680);
  el.innerHTML = reportHTML();
  document.body.classList.add('print-report');
  const done = () => { document.body.classList.remove('print-report'); el.innerHTML = ''; sizeCharts(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1500); }, 80);
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = () => (S.farm?.name || 'farm').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'farm';
function reportCSV() {
  const q = (v) => { const x = String(v ?? ''); return /[",\n;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  const L = [];
  L.push(['FieldShift', S.farm.name || '', S.farm.lat, S.farm.lon, new Date().toISOString().slice(0, 10)].map(q).join(','));
  L.push('');
  L.push(['rank', 'rotation', 'score', 'soil', 'water', 'income', 'resilience', 'simplicity', 'soc_change_20y_pct', 'erosion_t_ha_yr', 'n_fert_kg_ha_yr', 'irrigation_mm_yr', 'margin_usd_ha_yr', 'bad_year_margin_usd_ha', 'failure_risk_pct', 'co2e_t_ha_yr'].join(','));
  const rows = [...res.top.slice(0, repOpt.n).map((x, i) => [`#${i + 1}`, x]), ...(res.baseline ? [['current', res.baseline]] : []), ...(custom ? [['builder', custom]] : [])];
  for (const [lab, x] of rows) L.push([lab, planText(x), x.total.toFixed(1), ...SC_KEYS.map((k) => x.scores[k].toFixed(0)), x.socPct.toFixed(2), x.erosion.toFixed(2), x.fert.toFixed(0), x.irr.toFixed(0), x.gm.toFixed(0), x.p10.toFixed(0), (x.pFail * 100).toFixed(1), x.co2e.toFixed(3)].map(q).join(','));
  L.push('');
  L.push(['month', 'rain_mm', 'et0_mm', 'tmean_c', 'tmax_extreme_c', 'tmin_extreme_c', 'root_zone_soil_wetness', 'frost_days'].join(','));
  ins.C.norm.P.forEach((_, m) => L.push([m + 1, ins.C.norm.P[m].toFixed(1), ins.C.norm.ET0[m].toFixed(1), ins.C.norm.T[m].toFixed(1), ins.C.norm.Tx[m].toFixed(1), ins.C.norm.Tn[m].toFixed(1), ins.C.norm.GW[m].toFixed(2), (ins.C.frost[m] || 0).toFixed(1)].join(',')));
  L.push('');
  L.push(['crop', 'suitability', 'sow_month', 'harvest_month', 'expected_yield_t_ha', 'failure_risk_pct', 'limited_by'].join(','));
  for (const x of res.suit) L.push([cropName(x.id), (x.S * 100).toFixed(0), x.plant != null ? ((x.plant + 12) % 12) + 1 : '', x.harv != null ? ((x.harv + 12) % 12) + 1 : '', x.yield ? x.yield.toFixed(2) : '', ((x.pFail || 0) * 100).toFixed(0), x.limit || ''].map(q).join(','));
  download(`fieldshift-${slug()}.csv`, '\ufeff' + L.join('\r\n'), 'text/csv;charset=utf-8');
}
function reportJSON() {
  const slim = (x) => x && { rotation: x.seq, secondary: x.years.map((y) => y.sec.id || y.sec.type), score: +x.total.toFixed(1), scores: x.scores, socChangePct: x.socPct, erosion: x.erosion, nFert: x.fert, irrigation: x.irr, margin: x.gm, badYearMargin: x.p10, failureRisk: x.pFail, co2e: x.co2e, years: x.years, timeMachine: x.hist };
  const out = { app: 'FieldShift', version: APP_VERSION, generated: new Date().toISOString(), farm: S.farm, soil: S.soil, practice: S.practice, priorities: S.prio, options: S.cons, scenario: res.scenario,
    climate: { years: [ins.years[0], ins.years[ins.years.length - 1]], normals: ins.C.norm, trends: { tempPerDecade: ins.tTrend, rainPctPerDecade: ins.pTrend, droughtYearFreq: ins.dryFreq } },
    plans: res.top.slice(0, repOpt.n).map(slim), current: slim(res.baseline), builder: slim(custom), suitability: res.suit.map(({ hist, ...x }) => x) };
  download(`fieldshift-${slug()}.json`, JSON.stringify(out, null, 1), 'application/json');
}

// ---------------- CROP LAB ----------------
let labFilter = 'all';
function renderLab() {
  const v = $('#v-lab');
  if (!res) { v.innerHTML = `<div class="skel tall"></div>`; return; }
  const B = S.builder;
  if (!B.seq.length && res.top[0]) { B.seq = [...res.top[0].seq]; B.sec = B.seq.map(() => 'auto'); }
  const secOpts = (sel) => `<option value="auto" ${sel === 'auto' ? 'selected' : ''}>${esc(t('auto_sec'))}</option><option value="fallow" ${sel === 'fallow' ? 'selected' : ''}>${esc(t('fallow'))}</option>` +
    COVER_CROPS.map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>🌱 ${esc(cropName(c.id))}</option>`).join('') +
    MAIN_CROPS.filter((c) => !c.per).map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>➕ ${esc(cropName(c.id))}</option>`).join('');
  const suit = res.suit;
  const types = ['all', 'cereal', 'legume', 'oilseed', 'root', 'vegetable', 'forage', 'cover'];
  const rows = suit.filter((s) => labFilter === 'all' || CROP[s.id].type === labFilter || (labFilter === 'oilseed' && CROP[s.id].type === 'fibre'));
  const band = (S2) => (S2 >= 0.75 ? ['excellent', 'var(--good)'] : S2 >= 0.55 ? ['good', 'var(--s3)'] : S2 >= 0.4 ? ['marginal', 'var(--warn)'] : S2 > 0.05 ? ['poor', 'var(--serious)'] : ['unsuitable', 'var(--bad)']);
  v.innerHTML = `
  <div class="head"><h1>${esc(t('lab_title'))}</h1><p class="muted">${esc(t('lab_sub'))}</p></div>
  <article class="card">
    <h2>🧩 ${esc(t('builder'))}</h2><p class="muted small">${esc(t('builder_sub'))}</p>
    <div class="builder">${B.seq.map((id, i) => `<div class="bslot" style="--c:${famColor(id)}"><span class="eyebrow">${esc(t('yr'))} ${i + 1}</span>
      <select data-b="seq" data-i="${i}" aria-label="${esc(t('crop'))}">${MAIN_CROPS.map((c) => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.ic} ${esc(cropName(c.id))}</option>`).join('')}</select>
      <small>${esc(t('then'))}</small><select data-b="sec" data-i="${i}">${secOpts(B.sec[i] || 'auto')}</select>
      ${B.seq.length > 1 ? `<button class="link" data-act="bDel" data-i="${i}">${esc(t('remove'))}</button>` : ''}</div>`).join('')}
      ${B.seq.length < 5 ? `<button class="bslot add" data-act="bAdd">+ ${esc(t('add_year'))}</button>` : ''}</div>
    <div id="customOut">${custom ? customHTML() : `<div class="skel"></div>`}</div>
  </article>
  <article class="card">
    <h2>📊 ${esc(t('suit_title'))}</h2>
    <div class="chips">${types.map((k) => `<button class="chip ${labFilter === k ? 'on' : ''}" data-act="labF" data-k="${k}">${k === 'all' ? '★' : esc(t('type_' + k))}</button>`).join('')}</div>
    <div class="suit">${rows.map((s) => { const [bk, col] = band(s.S); const c = CROP[s.id]; return `
      <details class="srow"><summary><span class="s-n">${c.ic} ${esc(cropName(s.id))}</span><span class="s-bar"><i style="width:${Math.round(s.S * 100)}%;background:${col}"></i></span><span class="s-v">${Math.round(s.S * 100)}</span>
        <span class="s-m">${s.plant != null ? `${monthName(s.plant)}–${monthName(s.harv)}` : ''} ${s.limit ? `· ${esc(t('limit_by'))} ${esc(t('lim_' + s.limit))}` : `· ${esc(t(bk))}`}${s.pFail > 0.1 ? ` · ⚠️ ${esc(t('fails_in', { pct: Math.round(s.pFail * 100) }))}` : ''}</span></summary>
        <div class="s-d">
          ${s.comps ? `<div class="comps">${Object.entries(s.comps).map(([k, x]) => `<span class="${x < 0.7 ? 'lo' : ''}">${esc(t('lim_' + k))} <b>${Math.round(x * 100)}</b></span>`).join('')}</div>` : ''}
          <p class="small muted">${esc(t(FAMILIES[c.fam]?.key || 'fam_other'))} · ${esc(t('type_' + c.type))}${c.nfix ? ` · N ${c.nfix} kg/ha` : ''} · ${esc(t('exp_yield'))} ${s.yield ? `${U.n(U.tha(s.yield), 1)} ${U.thaL}` : '—'}</p>
          ${!c.cover ? `<div class="fields">
            <label class="numf"><span>${esc(t('yield_local'))}</span><span class="numw"><input type="number" step="0.1" min="0" value="${S.overrides[c.id]?.yld ?? c.yld}" data-ov="yld" data-id="${c.id}"></span></label>
            <label class="numf"><span>${esc(t('gm_local'))}</span><span class="numw"><input type="number" step="10" value="${S.overrides[c.id]?.gm ?? c.gm}" data-ov="gm" data-id="${c.id}"></span></label></div>` : ''}
        </div></details>`; }).join('')}</div>
  </article>`;
  if (!custom) evalCustom();
  v.onchange = (e) => {
    const el = e.target;
    if (el.dataset.b) { S.builder[el.dataset.b][+el.dataset.i] = el.value; custom = null; save(); evalCustom(); }
    if (el.dataset.ov) { S.overrides[el.dataset.id] = { ...(S.overrides[el.dataset.id] || {}), [el.dataset.ov]: +el.value }; save(); rerun(); }
  };
}
async function evalCustom() {
  const out = $('#customOut');
  if (out) out.innerHTML = `<div class="skel"></div>`;
  try {
    custom = await call('custom', { seq: S.builder.seq, sec: S.builder.sec, refGM: res?.refGM });
  } catch (e) { custom = null; }
  if (!custom) { if (out) out.innerHTML = `<p class="note warn">${esc(t('no_plans'))}</p>`; return; }
  custom.reasons = [];
  if (out) out.innerHTML = customHTML();
}
function customHTML() {
  const r = custom, b = res.baseline, top = res.top[0];
  const rows = SC_KEYS.map((k) => ({ label: t('p_' + k), vals: [r.scores[k], b?.scores[k], top?.scores[k]].filter((x) => x != null) }));
  const names = [t('builder'), ...(b ? [t('your_current')] : []), ...(top ? ['#1'] : [])];
  return `<div class="pc-top"><div class="pc-w">${CH.wheel(r, 90, false)}</div><div class="pc-t"><div class="seq">${planTitle(r)}</div></div>${CH.donut(r.total, 60)}</div>
    ${metricsRow(r, b)}${CH.compareBars(rows, names)}
    <div class="row gap"><button class="btn sm" data-act="openCustom">${esc(t('details'))} →</button></div>`;
}

// ---------------- ABOUT ----------------
function renderAbout() {
  $('#v-about').innerHTML = `<article class="card prose">
  <h1>${esc(t('about'))}</h1><p>${esc(t('about_body'))}</p>
  <h2>${esc(t('data_sources'))}</h2>
  <ul>
    <li><b>NASA POWER</b> (Prediction Of Worldwide Energy Resources) — monthly temperature, extremes, precipitation (corrected), solar radiation, humidity, wind, root-zone & surface soil wetness (GMAO MERRA-2 / GEOS, CERES, IMERG-corrected), 1995 → last year; frost-day climatology.</li>
    <li><b>NASA GIBS</b> — VIIRS true colour, MODIS NDVI 16-day, SMAP L4 root-zone soil moisture map layers.</li>
    <li><b>MODIS MOD13Q1</b> NDVI (250 m, 16-day) via the ORNL DAAC subsetting service — observed greening at your field.</li>
    <li><b>ISRIC SoilGrids 2.0</b> — sand, silt, clay, organic carbon, pH, bulk density, CEC, nitrogen (0–30 cm).</li>
    <li>Crop parameters: FAO Ecocrop, FAO-56 crop coefficients, extension literature. Geocoding: Open-Meteo, OpenStreetMap Nominatim.</li>
  </ul>
  <h2>${esc(t('method'))}</h2>
  <ol>
    <li>Reference evapotranspiration (Hargreaves radiation method) and effective rainfall (USDA-SCS) from NASA POWER, month by month.</li>
    <li>Each crop is placed in the calendar using growing-degree days, frost and heat probabilities from 30 years of NASA monthly extremes, a FAO-56 water balance seeded with NASA root-zone soil wetness, waterlogging, humidity-driven disease, soil pH, texture and salinity.</li>
    <li>Every placement is replayed against each real year of the NASA record to estimate failure risk (the “Time Machine”).</li>
    <li>Thousands of rotation sequences are generated; gaps between crops are filled with the best cover crop, second cash crop or fallow for your priorities.</li>
    <li>Each rotation is simulated for 20 years: soil organic carbon (two-pool, equilibrium-calibrated), RUSLE erosion with NASA-derived rainfall erosivity, nitrogen budget with legume credits, irrigation, nitrate-leaching exposure, margins, greenhouse-gas balance and pest-break rules.</li>
    <li>Scores for soil, water, income, resilience and simplicity are weighted by your sliders. Climate lenses re-run everything under recent, projected (NASA-observed trend to 2040/2050) or stress climates.</li>
  </ol>
  <h2>🔒 Privacy & security</h2>
  <ul>
    <li>No account, no tracking, no ads, no analytics. Your farm, soil and choices are stored only on your device.</li>
    <li>Only the field coordinates are sent — directly from your browser — to NASA POWER, NASA/ORNL MODIS, ISRIC SoilGrids and the place-name services. Nothing passes through a FieldShift server (there is none).</li>
    <li>HTTPS-only, strict Content Security Policy, integrity-checked map library, sanitised share links, no third-party scripts.</li>
    <li>Use <a href="?reset">Clean start</a> to erase everything FieldShift stored on this device.</li>
  </ul>
  <p class="note">${esc(t('disclaimer'))}</p>
  <p class="muted small">NASA does not endorse this tool. Built for the 2026 NASA Space Apps Challenge — “Field Shift: Adapting Farms with NASA Data”.</p>
  </article>`;
}

// ---------------- Feature guide ----------------
const GUIDE_IC = ["🌍", "🧭", "🟤", "🚜", "🛰️", "🌧️", "📈", "🌿", "🗺️", "🎯", "🔄", "🔭", "🎡", "⏳", "✅", "💬", "🧪", "📲", "⚙️"];
const GUIDE_TAB = ['farm', 'farm', 'farm', 'farm', 'climate', 'climate', 'climate', 'climate', 'climate', 'goals', 'plans', 'plans', 'plans', 'plans', 'plans', 'plans', 'lab', null, null];
function guideHTML() {
  return `<div class="sh-head"><h2>❓ ${esc(t('guide_title'))}</h2><button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div>
  <p class="muted">${esc(t('guide_sub'))}</p>
  <div class="guide">${GUIDE_IC.map((ic, i) => `<button class="g-item" data-act="guideGo" data-i="${i}"><span class="g-ic">${ic}</span><span><b>${esc(t(`g${i + 1}_t`))}</b><small>${esc(t(`g${i + 1}_d`))}</small><em>📍 ${esc(t('where'))}: ${esc(t(`g${i + 1}_w`))}</em></span></button>`).join('')}</div>`;
}

// ---------------- Settings ----------------
function settingsHTML() {
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button role="radio" aria-checked="${String(S[k]) === String(v)}" data-act="pref" data-k="${k}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
  return `<div class="sh-head"><h2>${esc(t('settings'))}</h2><button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div>
  <div class="form">
    <label>${esc(t('units'))}</label>${seg('units', [['metric', t('metric')], ['imperial', t('imperial')]])}
    <label>${esc(t('theme'))}</label>${seg('theme', [['auto', t('th_auto')], ['light', t('th_light')], ['dark', t('th_dark')]])}
    <label>${esc(t('text_size'))}</label>${seg('fs', [[0.9, 'A−'], [1, 'A'], [1.15, 'A+'], [1.3, 'A++']])}
  </div>
  <div class="row wrap gap">
    ${canOfferInstall() ? `<button class="btn primary" data-act="install">⬇ ${esc(t('install'))}</button>` : `<span class="pill">${esc(t('installed'))}</span>`}
    <button class="btn" data-act="about">ℹ️ ${esc(t('about'))}</button>
    <button class="btn ghost" data-act="resetAll">↺ ${esc(t('reset'))}</button>
  </div>
  <p class="muted small">FieldShift ${APP_VERSION} · <button class="link" data-act="diag">Diagnostics</button> · <a href="?reset">Clean start</a></p>`;
}
// ---------------- Install as an app (Android, iPhone, desktop) ----------------
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; updateInstall(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast(t('installed')); updateInstall(); });
function canOfferInstall() { return !isStandalone(); }
function updateInstall() { const b = $('#installBtn'); if (b) b.hidden = !canOfferInstall(); }
const SHARE_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v9h14v-9"/></svg>';
const ADD_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
async function install() {
  if (deferredInstall) { deferredInstall.prompt(); const r = await deferredInstall.userChoice.catch(() => null); deferredInstall = null; updateInstall(); if (r?.outcome === 'accepted') toast(t('installed')); return; }
  const how = isIOS() ? esc(t('install_ios', { share: '§S', add: '§A' })).replace('§S', SHARE_IC).replace('§A', ADD_IC) : esc(t('install_other'));
  sheet(`<div class="sh-head"><h2>⬇ ${esc(t('install_title'))}</h2><button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div>
    <div class="install-card"><img src="icons/icon-192.png" width="72" height="72" alt=""><div><p>${esc(t('install_sub'))}</p><p class="big-step">${how}</p></div></div>
    ${isIOS() ? `<div class="ios-steps"><div><span>1</span>${SHARE_IC}</div><div><span>2</span>${ADD_IC} ${esc(t('install_ios').split('“')[1]?.split('”')[0] || 'Add to Home Screen')}</div><div><span>3</span>✓</div></div>` : ''}`);
}

// ---------------- Map (lazy Leaflet + NASA GIBS) ----------------
let L = null;
async function loadLeaflet() {
  if (L) return L;
  await new Promise((ok, bad) => {
    // pinned version + Subresource Integrity: a modified copy on the CDN is refused by the browser
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    css.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'; css.crossOrigin = 'anonymous'; document.head.append(css);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'; s.crossOrigin = 'anonymous';
    s.onload = ok; s.onerror = bad; document.head.append(s);
  });
  L = window.L; return L;
}
async function openMap() {
  sheet(`<div class="sh-head"><h2>🗺️ ${esc(t('pick_map'))}</h2><button class="icon-btn x" data-act="closeSheet" aria-label="${esc(t('close'))}">✕</button></div><div id="map" class="map"><div class="spin"></div></div><div id="mapPick" class="row gap wrap"></div>`);
  try { await loadLeaflet(); } catch { $('#map').innerHTML = `<p class="note warn">${esc(t('offline'))}</p>`; return; }
  const c = S.farm ? [S.farm.lat, S.farm.lon] : [15, 10];
  const m = L.map('map', { zoomControl: true, worldCopyJump: true }).setView(c, S.farm ? 10 : 2);
  const gibs = (layer, fmt, lvl, extra = {}) => L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/default/GoogleMapsCompatible_Level${lvl}/{z}/{y}/{x}.${fmt}`, { maxNativeZoom: lvl, maxZoom: 18, attribution: 'NASA GIBS', ...extra });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
  const layers = {
    [t('l_osm')]: osm,
    [t('l_true')]: gibs('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'jpg', 9),
  };
  const over = {
    [t('l_ndvi')]: gibs('MODIS_Terra_L3_NDVI_16Day', 'png', 9, { opacity: 0.7 }),
    [t('l_smap')]: gibs('SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', 'png', 6, { opacity: 0.65 }),
  };
  L.control.layers(layers, over, { collapsed: false }).addTo(m);
  let mk = S.farm ? L.marker(c).addTo(m) : null;
  m.on('click', (e) => {
    const { lat, lng } = e.latlng;
    const lon = ((lng + 540) % 360) - 180;
    if (mk) mk.setLatLng(e.latlng); else mk = L.marker(e.latlng).addTo(m);
    $('#mapPick').innerHTML = `<span class="muted">${lat.toFixed(4)}, ${lon.toFixed(4)}</span><button class="btn primary" data-act="pick" data-lat="${lat.toFixed(4)}" data-lon="${lon.toFixed(4)}">✔ ${esc(t('go'))}</button>`;
  });
  setTimeout(() => m.invalidateSize(), 200);
}

// ---------------- Speech, share, print ----------------
const VOICE = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', pt: 'pt-BR', sw: 'sw-KE', hi: 'hi-IN', ar: 'ar-SA', zh: 'zh-CN', bn: 'bn-IN', ru: 'ru-RU', ur: 'ur-PK', id: 'id-ID', de: 'de-DE', ja: 'ja-JP', tr: 'tr-TR', vi: 'vi-VN', fa: 'fa-IR', it: 'it-IT', ha: 'ha-NG', yo: 'yo-NG', ig: 'ig-NG', am: 'am-ET', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN', pa: 'pa-IN', el: 'el-GR', ko: 'ko-KR', th: 'th-TH', uk: 'uk-UA', pl: 'pl-PL', nl: 'nl-NL', tl: 'fil-PH', ms: 'ms-MY', ne: 'ne-NP', so: 'so-SO', zu: 'zu-ZA', om: 'om-ET' };
function planSpeech(r, idx) {
  const parts = r.seq.map((id, i) => {
    const y = r.years[i];
    return `${t('yr')} ${i + 1}: ${cropName(id)}${y.sec.id ? `, ${t('then')} ${cropName(y.sec.id)}` : ''}`;
  });
  return `${idx >= 0 ? `#${idx + 1}. ` : ''}${parts.join('. ')}. ${t('score')} ${Math.round(r.total)}. ${(r.reasons || []).map(reasonText).join(' ')}`;
}
// Warm, unhurried baritone narration: deepest male voice on the device, lowered pitch, slow pace,
// spoken sentence by sentence with small pauses.
const MALE = /(guy|davis|christopher|eric|roger|steffan|brian|ryan|thomas|daniel|alex|fred|aaron|arthur|gordon|oliver|male|man|david|mark|george|james|jorge|diego|pablo|raul|henri|paul|claude|antonio|ricardo|duarte|madhur|prabhat|hemant|rafiki|daudi)/i;
const FEMALE = /(female|woman|zira|aria|jenny|samantha|victoria|karen|moira|tessa|susan|hazel|libby|sonia|natasha|catherine|amelie|helena|laura|elena|paulina|monica|luciana|francisca|heera|swara|kalpana|zuri|rehema)/i;
let voiceCache = null;
function pickVoice(code) {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(code.slice(0, 2)));
  if (!vs.length) return null;
  const rank = (v) => (MALE.test(v.name) ? 0 : FEMALE.test(v.name) ? 3 : 1) - (/natural|neural|online|premium|enhanced/i.test(v.name) ? 0.5 : 0) + (v.lang.toLowerCase() === code.toLowerCase() ? 0 : 0.2);
  return vs.sort((a, b) => rank(a) - rank(b))[0];
}
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('🔇');
  speechSynthesis.cancel();
  const code = VOICE[lang()] || 'en-US';
  const go2 = () => {
    const v = pickVoice(code);
    if (!v && speechSynthesis.getVoices().length) toast('🔇 ' + code + ' voice not installed on this device — add it in your phone’s text-to-speech settings.', 5000);
    const female = v && FEMALE.test(v.name) && !MALE.test(v.name);
    const clean = text.replace(/[^\p{L}\p{N}\s.,:;%+\-–()$]/gu, ' ').replace(/\s+/g, ' ');
    const parts = clean.replace(/([.;:])\s+/g, '$1\n').split('\n').filter((x) => x.trim());
    parts.forEach((part) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = code; if (v) u.voice = v;
      u.pitch = female ? 0.5 : 0.62;   // baritone register
      u.rate = 0.84;                    // smooth, unhurried
      u.volume = 1;
      speechSynthesis.speak(u);
    });
  };
  let started = false;
  const once = () => { if (!started) { started = true; go2(); } };
  if (speechSynthesis.getVoices().length || voiceCache) once();
  else { speechSynthesis.onvoiceschanged = () => { voiceCache = true; once(); }; setTimeout(once, 700); }
}
function stopSpeak() { try { speechSynthesis.cancel(); } catch { /* none */ } }
function shareURL() {
  const st = { farm: S.farm, soil: S.soil, soilEdited: S.soilEdited, practice: S.practice, prio: S.prio, cons: S.cons, scen: S.scen, prices: S.prices, lang: S.lang, units: S.units };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(st)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#s=${b64}`;
}
async function share(r, idx) {
  const url = shareURL();
  const text = `FieldShift — ${S.farm?.name || ''}: ${r ? planSpeech(r, idx).slice(0, 220) : ''}`;
  if (navigator.share) { try { await navigator.share({ title: 'FieldShift', text, url }); return; } catch { /* cancelled */ } }
  try { await navigator.clipboard.writeText(url); toast(t('copied')); } catch { prompt('URL', url); }
}

// ---------------- Actions ----------------
const ACT = {
  demo: (a) => openFarm({ demo: a.dataset.id, lat: +a.dataset.lat, lon: +a.dataset.lon, name: a.dataset.name }),
  pick: (a) => { closeSheet(); openFarm({ lat: +a.dataset.lat, lon: +a.dataset.lon, name: a.dataset.name || null }); },
  gps: () => {
    if (!navigator.geolocation) return toast(t('err_gps'));
    busy(t('use_gps'));
    navigator.geolocation.getCurrentPosition((p) => { busy(null); openFarm({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }); }, () => { busy(null); toast(t('err_gps')); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 6e5 });
  },
  map: () => openMap(),
  changeLoc: () => { $('#v-farm').innerHTML = landing(); bindLanding($('#v-farm')); },
  saveFarm: () => { if (!S.saved.some((f) => f.lat === S.farm.lat && f.lon === S.farm.lon)) S.saved.unshift({ ...S.farm }); S.saved = S.saved.slice(0, 12); save(); renderFarm(); toast('★'); },
  openSaved: (a) => openFarm(S.saved[+a.dataset.i]),
  soilReset: () => { S.soil = { ...S.soilAuto }; S.soilEdited = false; save(); rerun(); renderFarm(); },
  prac: (a) => { S.practice[a.dataset.k] = a.dataset.v; save(); rerun(); $$(`[data-act="prac"][data-k="${a.dataset.k}"]`).forEach((b) => b.setAttribute('aria-checked', b === a)); },
  curDel: (a) => { S.practice.current.splice(+a.dataset.i, 1); S.practice.currentSec?.splice(+a.dataset.i, 1); save(); rerun(); renderFarm(); },
  preset: (a) => { S.prio = { ...PRESETS[a.dataset.k] }; save(); rerun(); renderGoals(); },
  cons: (a) => { S.cons[a.dataset.k] = a.dataset.v === 'auto' ? 'auto' : +a.dataset.v; save(); rerun(); $$(`[data-act="cons"][data-k="${a.dataset.k}"]`).forEach((b) => b.setAttribute('aria-checked', b === a)); },
  tri: (a) => {
    const id = a.dataset.id, C2 = S.cons;
    if (C2.include.includes(id)) { C2.include = C2.include.filter((x) => x !== id); C2.exclude.push(id); }
    else if (C2.exclude.includes(id)) C2.exclude = C2.exclude.filter((x) => x !== id);
    else C2.include = [...C2.include, id].slice(-3);
    save(); rerun(); renderGoals();
  },
  scen: (a) => { S.scen.mode = a.dataset.k; save(); renderPlans(); rerun(); },
  openPlan: (a) => { const i = +a.dataset.i; openPlan = i < 0 ? res.baseline : res.top[i]; sheet(planDetail(openPlan, i < 0 ? t('your_current') : `#${i + 1}`)); openPlan._i = i; },
  openCustom: () => { openPlan = custom; sheet(planDetail(custom, t('builder'))); openPlan._i = -2; },
  closeSheet: () => closeSheet(),
  ics: () => openPlan && downloadICS(openPlan),
  report: () => reportSheet(),
  diag: () => showDiag(),
  reportOpen: () => { const i = openPlan?._i; reportSheet(i >= 0 ? i : i === -1 ? 'cur' : i === -2 ? 'custom' : 0); },
  repPrint: () => { closeSheet(); printReport(); },
  repCSV: () => reportCSV(),
  repJSON: () => reportJSON(),
  speak: (a) => { const i = +a.dataset.i; speak(planSpeech(res.top[i], i)); },
  speakOpen: () => openPlan && speak(planSpeech(openPlan, openPlan._i)),
  share: (a) => { const i = +a.dataset.i; share(res.top[i], i); },
  shareOpen: () => share(openPlan, openPlan?._i ?? 0),
  waOpen: () => { const txt = `FieldShift — ${S.farm?.name || ''}\n${planSpeech(openPlan, openPlan._i ?? 0)}\n${shareURL()}`; window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener'); },
  print: () => { document.body.classList.add('printing'); setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 60); },
  ndvi: async () => {
    if (!S.farm) return;
    const b = $('#ndviBody'); if (b) b.innerHTML = `<div class="skel"></div>`;
    try { ndvi = await fetchNDVI(S.farm.lat, S.farm.lon); } catch { ndvi = []; }
    const b2 = $('#ndviBody'); if (b2) b2.innerHTML = ndviHTML();
  },
  labF: (a) => { labFilter = a.dataset.k; renderLab(); },
  bAdd: () => { const B = S.builder; B.seq.push(res.suit.find((s) => !CROP[s.id].cover && !B.seq.includes(s.id))?.id || 'maize'); B.sec.push('auto'); custom = null; save(); renderLab(); evalCustom(); },
  bDel: (a) => { const B = S.builder; B.seq.splice(+a.dataset.i, 1); B.sec.splice(+a.dataset.i, 1); custom = null; save(); renderLab(); evalCustom(); },
  bEval: () => evalCustom(),
  settings: () => sheet(settingsHTML()),
  pref: async (a) => { const k = a.dataset.k; S[k] = k === 'fs' ? +a.dataset.v : a.dataset.v; save(); applyPrefs(); sheet(settingsHTML()); go(S.tab); },
  about: () => { closeSheet(); go('about'); },
  install: () => install(),
  guide: () => sheet(guideHTML()),
  guideGo: (a) => {
    const i = +a.dataset.i, tab = GUIDE_TAB[i];
    closeSheet();
    if (i === 17) return install();
    if (i === 18) return sheet(settingsHTML());
    if (tab) go(tab);
  },
  resetAll: async () => {
    try { localStorage.removeItem('fs-state'); sessionStorage.removeItem('fs-healed'); } catch { /* */ }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* */ }
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* */ }
    location.reload();
  },
};

boot();
