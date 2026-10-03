// Data access + climate analytics.
// Sources: NASA POWER (monthly 1995–last year + 2001–2020 climatology),
// ISRIC SoilGrids v2, MODIS MOD13Q1 NDVI via ORNL DAAC, Open-Meteo geocoding.

const POWER = 'https://power.larc.nasa.gov/api/temporal';
const MP = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,GWETTOP,ALLSKY_SFC_SW_DWN,RH2M,WS2M';
const CP = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETROOT,GWETTOP,ALLSKY_SFC_SW_DWN,RH2M,WS2M,FROST_DAYS';
export const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MK = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export const DEMOS = [
  ['iowa', 'Ames, Iowa, USA', 41.99, -93.62], ['fresno', 'Fresno, California, USA', 36.74, -119.79],
  ['saskatoon', 'Saskatoon, Canada', 52.13, -106.67], ['sinaloa', 'Culiacán, Sinaloa, Mexico', 24.81, -107.39],
  ['matogrosso', 'Sorriso, Mato Grosso, Brazil', -12.55, -55.72], ['pampas', 'Pergamino, Argentina', -33.89, -60.57],
  ['peru', 'Puno Altiplano, Peru', -15.84, -70.02], ['kano', 'Kano, Nigeria', 12.0, 8.52],
  ['tamale', 'Tamale, Ghana', 9.4, -0.84], ['addis', 'Debre Zeyit, Ethiopia', 8.75, 38.98],
  ['nakuru', 'Nakuru, Kenya', -0.3, 36.07], ['lilongwe', 'Lilongwe, Malawi', -13.96, 33.79],
  ['free_state', 'Bethlehem, South Africa', -28.23, 28.31], ['nile', 'Nile Delta, Egypt', 30.8, 31.0],
  ['cordoba', 'Córdoba, Spain', 37.88, -4.78], ['france', 'Beauce, France', 48.2, 1.6],
  ['ukraine', 'Poltava, Ukraine', 49.59, 34.55], ['punjab', 'Ludhiana, Punjab, India', 30.9, 75.85],
  ['bangladesh', 'Bogura, Bangladesh', 24.85, 89.37], ['heilongjiang', 'Harbin, China', 45.8, 126.53],
  ['mekong', 'Can Tho, Vietnam', 10.03, 105.78], ['java', 'Central Java, Indonesia', -7.15, 110.4],
  ['wagga', 'Wagga Wagga, Australia', -35.12, 147.37],
];

async function getJSON(url, ms = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// Small persistent cache (localStorage) so a farm opens instantly the second time.
const LS = 'fs-cache-v1:';
function cacheGet(k) { try { return JSON.parse(localStorage.getItem(LS + k)); } catch { return null; } }
function cacheSet(k, v) {
  try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {
    try { Object.keys(localStorage).filter((x) => x.startsWith(LS)).slice(0, 5).forEach((x) => localStorage.removeItem(x)); } catch { /* ignore */ }
  }
}
const key = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export async function loadDemo(id) {
  return getJSON(`data/demo/${id}.json`);
}

// NASA POWER climate only (fast, ~2 s). Soil is fetched separately so it never blocks.
// Cached copies are reused for 3 days, then refreshed straight from NASA (offline: cached copy is used).
const FRESH_MS = 3 * 864e5;
export async function fetchFarmData(lat, lon, { force = false } = {}) {
  const k = key(lat, lon);
  const cached = cacheGet('farm:' + k);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (cached && !force && (!online || Date.now() - (cached.t || 0) < FRESH_MS)) return { ...cached, fromCache: true };
  const end = new Date().getFullYear() - 1;
  try {
    const [m, c] = await Promise.all([
      getJSON(`${POWER}/monthly/point?parameters=${MP}&community=AG&longitude=${lon}&latitude=${lat}&start=1995&end=${end}&format=JSON`, 60000),
      getJSON(`${POWER}/climatology/point?parameters=${CP}&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`, 60000),
    ]);
    const out = { lat, lon, monthly: m.properties.parameter, clim: c.properties.parameter, elev: m.geometry.coordinates[2] ?? null, soil: null, t: Date.now() };
    cacheSet('farm:' + k, out);
    return out;
  } catch (e) {
    if (cached) return { ...cached, fromCache: true };
    throw e;
  }
}
export const monthsIn = (raw) => Object.keys(raw?.monthly?.T2M || {}).filter((x) => raw.monthly.T2M[x] > -900).length;

export async function fetchSoil(lat, lon) {
  const k = 'soil:' + key(lat, lon);
  const c = cacheGet(k);
  if (c) return c;
  // SoilGrids masks cities and water: probe the point and nearby farmland in parallel, prefer the closest hit
  const offs = [[0, 0], [0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03], [0.06, 0.06], [-0.06, -0.06]];
  const tries = offs.map(([dy, dx]) => fetchSoilAt(+(lat + dy).toFixed(4), +(lon + dx).toFixed(4)).then((r) => (parseSoil(r) ? { ...r, probe: [dy, dx] } : null)).catch(() => null));
  for (const t of tries) { const r = await t; if (r) { cacheSet(k, r); return r; } }
  return null;
}
async function fetchSoilAt(lat, lon) {
  const props = ['soc', 'phh2o', 'clay', 'sand', 'silt', 'nitrogen', 'cec', 'bdod'].map((p) => 'property=' + p).join('&');
  return getJSON(`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&${props}&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`, 25000);
}

// ---------- Soil ----------
export function parseSoil(sg) {
  if (!sg?.properties?.layers) return null;
  const out = {};
  const w = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 };
  for (const L of sg.properties.layers) {
    let s = 0, n = 0;
    for (const d of L.depths) {
      const v = d.values.mean;
      if (v == null) continue;
      s += (v / L.unit_measure.d_factor) * w[d.label]; n += w[d.label];
    }
    if (n) out[L.name] = s / n;
  }
  if (out.clay == null || out.sand == null) return null;
  return {
    clay: round(out.clay, 0), sand: round(out.sand, 0), silt: round(out.silt ?? 100 - out.clay - out.sand, 0),
    soc: round(out.soc ?? 10, 1), // g/kg
    ph: round(out.phh2o ?? 6.5, 1), cec: round(out.cec ?? 15, 0), n: round(out.nitrogen ?? 1, 2), // g/kg
    bd: round(out.bdod ?? 1.35, 2),
  };
}

export const DEFAULT_SOIL = { clay: 25, sand: 40, silt: 35, soc: 12, ph: 6.5, cec: 15, n: 1.2, bd: 1.35 };

// USDA texture triangle
export function textureClass(sand, silt, clay) {
  if (silt + 1.5 * clay < 15) return 'sand';
  if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return 'loamy_sand';
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) return 'sandy_loam';
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'loam';
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'silt_loam';
  if (silt >= 80 && clay < 12) return 'silt';
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'sandy_clay_loam';
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'clay_loam';
  if (clay >= 27 && clay < 40 && sand <= 20) return 'silty_clay_loam';
  if (clay >= 35 && sand > 45) return 'sandy_clay';
  if (clay >= 40 && silt >= 40) return 'silty_clay';
  return 'clay';
}
const AWC = { sand: 60, loamy_sand: 90, sandy_loam: 125, loam: 165, silt_loam: 200, silt: 200, sandy_clay_loam: 140, clay_loam: 170, silty_clay_loam: 185, sandy_clay: 130, silty_clay: 160, clay: 150 };
// texture group on a 0 (coarse) .. 2 (fine clay) scale; loams sit at 1
const GROUP = { sand: 0, loamy_sand: 0.2, sandy_loam: 0.6, loam: 1, silt_loam: 1, silt: 1, sandy_clay_loam: 1.1, clay_loam: 1.3, silty_clay_loam: 1.3, sandy_clay: 1.8, silty_clay: 1.8, clay: 2 };
export const texGroup = (cls) => GROUP[cls] ?? 1;
export const awcOf = (cls) => AWC[cls] ?? 150; // mm water per m soil

// RUSLE K factor (EPIC, Williams 1995), t·ha·h/(ha·MJ·mm)
export function kFactor(sand, silt, clay, socGkg) {
  const oc = socGkg / 10; // %
  const sn1 = 1 - sand / 100;
  const a = 0.2 + 0.3 * Math.exp(-0.256 * sand * (1 - silt / 100));
  const b = Math.pow(silt / Math.max(1, clay + silt), 0.3);
  const c = 1 - (0.25 * oc) / (oc + Math.exp(3.72 - 2.95 * oc));
  const d = 1 - (0.7 * sn1) / (sn1 + Math.exp(-5.51 + 22.9 * sn1));
  return a * b * c * d * 0.1317;
}

// ---------- Climate analytics ----------
const ok = (v) => v != null && v > -900;
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : NaN; };

// Hargreaves (1975) radiation-based reference ET, mm/day
export const et0 = (T, Rs) => Math.max(0, 0.0135 * (T + 17.8) * (Rs / 2.45));
// USDA-SCS effective rainfall, monthly mm
export const effRain = (P) => (P <= 250 ? (P * (125 - 0.2 * P)) / 125 : 125 + 0.1 * P);

export function linreg(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter((p) => Number.isFinite(p[1]));
  const n = pts.length; if (n < 3) return { slope: 0, icpt: mean(ys), r2: 0, p: 1 };
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxy / sxx, icpt = my - slope * mx, r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  // approximate two-sided p-value of the slope (t distribution ≈ normal for n≥20)
  const t = Math.sqrt(r2 * (n - 2) / Math.max(1e-9, 1 - r2));
  const p = 2 * (1 - normCdf(t));
  return { slope, icpt, r2, p };
}
function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

// Build the climate object from raw POWER responses.
export function buildClimate(raw) {
  const M = raw.monthly;
  const yrs = [...new Set(Object.keys(M.T2M).map((k) => +k.slice(0, 4)))].sort();
  const series = {};
  const map = { T: 'T2M', Tx: 'T2M_MAX', Tn: 'T2M_MIN', P: 'PRECTOTCORR', GW: 'GWETROOT', GT: 'GWETTOP', Rs: 'ALLSKY_SFC_SW_DWN', RH: 'RH2M', WS: 'WS2M' };
  for (const [s, p] of Object.entries(map)) {
    series[s] = yrs.map((y) => MK.map((_, m) => { const v = M[p]?.[`${y}${String(m + 1).padStart(2, '0')}`]; return ok(v) ? v : NaN; }));
  }
  // precipitation: mm/day -> mm/month
  series.P = series.P.map((row) => row.map((v, m) => v * DAYS[m]));
  // keep only years that are complete for T and P
  const keep = yrs.map((_, i) => series.T[i].every(Number.isFinite) && series.P[i].every(Number.isFinite));
  const years = yrs.filter((_, i) => keep[i]);
  for (const s of Object.keys(series)) series[s] = series[s].filter((_, i) => keep[i]);
  // fill radiation gaps with column means
  for (const s of ['Rs', 'GW', 'GT', 'RH', 'WS', 'Tx', 'Tn']) {
    const cm = MK.map((_, m) => mean(series[s].map((r) => r[m])));
    series[s] = series[s].map((r) => r.map((v, m) => (Number.isFinite(v) ? v : cm[m])));
  }
  const frost = MK.map((m) => (ok(raw.clim?.FROST_DAYS?.[m]) ? raw.clim.FROST_DAYS[m] : 0));
  return { lat: raw.lat, lon: raw.lon, elev: raw.elev, years, series, frost };
}

// Apply a climate scenario and derive the normals the crop model needs.
// scen: { dT, dP (fraction), from (year) }
export function deriveClimate(base, scen = {}) {
  const dT = scen.dT || 0, dP = scen.dP || 0;
  const idx = base.years.map((y, i) => [y, i]).filter(([y]) => !scen.from || y >= scen.from).map(([, i]) => i);
  const S = {};
  for (const [k, v] of Object.entries(base.series)) {
    S[k] = idx.map((i) => v[i].map((x) => (k === 'T' || k === 'Tx' || k === 'Tn' ? x + dT : k === 'P' ? x * (1 + dP) : x)));
  }
  const years = idx.map((i) => base.years[i]);
  S.ET0 = S.T.map((row, y) => row.map((t, m) => et0(t, S.Rs[y][m]) * DAYS[m]));
  const col = (k) => Array.from({ length: 12 }, (_, m) => mean(S[k].map((r) => r[m])));
  const norm = { T: col('T'), Tx: col('Tx'), Tn: col('Tn'), P: col('P'), ET0: col('ET0'), GW: col('GW'), GT: col('GT'), Rs: col('Rs'), RH: col('RH'), WS: col('WS') };
  norm.Pe = norm.P.map(effRain);
  const annP = S.P.map((r) => r.reduce((a, b) => a + b, 0));
  const annT = S.T.map((r) => mean(r));
  const annET = S.ET0.map((r) => r.reduce((a, b) => a + b, 0));
  const Pann = mean(annP), ETann = mean(annET);
  // Erosivity (Renard & Freimund 1994) distributed by P^1.5
  const R = Pann < 850 ? 0.0483 * Pann ** 1.61 : 587.8 - 1.219 * Pann + 0.004105 * Pann ** 2;
  const w15 = norm.P.map((p) => p ** 1.5), sw = w15.reduce((a, b) => a + b, 0) || 1;
  norm.R = w15.map((w) => (R * w) / sw);
  return {
    ...base, years, S, norm, annP, annT, annET, Pann, ETann, Tann: mean(annT),
    aridity: Pann / ETann, frost: base.frost, dT, dP,
    // fraction of years where the monthly extreme min < thr
    pBelow: (m, thr) => S.Tn.filter((r) => r[m] < thr).length / S.Tn.length,
    pAbove: (m, thr) => S.Tx.filter((r) => r[m] > thr).length / S.Tx.length,
  };
}

// Trends & headline indicators from the full baseline record
export function climateInsights(base) {
  const C = deriveClimate(base);
  const yrs = C.years;
  const tr = linreg(yrs, C.annT);
  const pr = linreg(yrs, C.annP);
  const gwAnn = C.S.GW.map((r) => mean(r));
  const gw = linreg(yrs, gwAnn);
  const hot = C.S.Tx.map((r) => Math.max(...r));
  const hr = linreg(yrs, hot);
  const sorted = [...C.annP].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const dry = C.annP.map((p) => p < 0.8 * med);
  const recent = C.annP.slice(-10), early = C.annP.slice(0, 10);
  // rainy season onset/cessation from long-term normals: months where P > 0.5*ET0
  const wet = C.norm.P.map((p, m) => p >= 0.5 * C.norm.ET0[m]);
  // seasonality: CV of monthly P
  const pm = mean(C.norm.P), pcv = Math.sqrt(mean(C.norm.P.map((p) => (p - pm) ** 2))) / (pm || 1);
  // inter-annual rainfall variability
  const am = mean(C.annP), acv = Math.sqrt(mean(C.annP.map((p) => (p - am) ** 2))) / (am || 1);
  // count rainy seasons (runs of wet months, circular)
  let seasons = 0; for (let m = 0; m < 12; m++) if (wet[m] && !wet[(m + 11) % 12]) seasons++;
  if (seasons === 0 && wet.every(Boolean)) seasons = 1;
  return {
    C, Tann: C.Tann, Pann: C.Pann, ETann: C.ETann, aridity: C.aridity,
    tTrend: tr.slope * 10, tP: tr.p, pTrend: (pr.slope * 10 / (am || 1)) * 100, pP: pr.p,
    gwTrend: gw.slope * 10, gwP: gw.p, hotTrend: hr.slope * 10,
    dryFreq: dry.filter(Boolean).length / dry.length, dryYears: yrs.filter((_, i) => dry[i]),
    recentShift: ((mean(recent) - mean(early)) / (mean(early) || 1)) * 100,
    wet, seasons, pcv, acv, annT: C.annT, annP: C.annP, years: yrs, gwAnn, hot,
    tReg: tr, pReg: pr, frostMonths: C.frost.map((f) => f > 3),
    zone: climateZone(C),
  };
}

function climateZone(C) {
  const ai = C.aridity, t = C.Tann, tmin = Math.min(...C.norm.T);
  const moist = ai < 0.2 ? 'arid' : ai < 0.5 ? 'semiarid' : ai < 0.65 ? 'subhumid_dry' : ai < 1 ? 'subhumid' : 'humid';
  const thermal = tmin > 18 ? 'tropical' : tmin > 5 ? 'subtropical' : tmin > -3 ? 'temperate' : 'cold';
  return { moist, thermal, label: `${thermal}_${moist}`, tAnn: t };
}

// ---------- Season so far: NASA POWER near-real-time daily data ----------
export async function fetchRecent(lat, lon) {
  const k = 'recent:' + key(lat, lon);
  const c = cacheGet(k);
  if (c && Date.now() - c.t < 12 * 3600e3) return c.v;
  const d = (x) => x.toISOString().slice(0, 10).replace(/-/g, '');
  const end = new Date(Date.now() - 2 * 864e5), start = new Date(end.getTime() - 92 * 864e5);
  const r = await getJSON(`${POWER}/daily/point?parameters=PRECTOTCORR,T2M,GWETROOT&community=AG&longitude=${lon}&latitude=${lat}&start=${d(start)}&end=${d(end)}&format=JSON`, 30000);
  const P = r.properties.parameter;
  const days = Object.keys(P.T2M).filter((k2) => ok(P.T2M[k2]) && ok(P.PRECTOTCORR[k2])).sort().slice(-90);
  const v = days.map((k2) => ({ d: k2, m: +k2.slice(4, 6) - 1, P: P.PRECTOTCORR[k2], T: P.T2M[k2], GW: ok(P.GWETROOT[k2]) ? P.GWETROOT[k2] : NaN }));
  if (v.length) cacheSet(k, { t: Date.now(), v });
  return v;
}
// Compare recent days with the long-term normals for the same calendar days
export function recentAnomaly(days, norm) {
  if (!days?.length) return null;
  let P = 0, Pn = 0, dT = 0;
  for (const x of days) { P += x.P; Pn += norm.P[x.m] / DAYS[x.m]; dT += x.T - norm.T[x.m]; }
  const lastGW = days.filter((x) => Number.isFinite(x.GW)).slice(-7);
  const gw = lastGW.length ? mean(lastGW.map((x) => x.GW)) : NaN;
  const gwN = norm.GW[days[days.length - 1].m];
  return { P, Pn, pct: Pn > 1 ? (P / Pn) * 100 : NaN, dT: dT / days.length, gw, gwN, from: days[0].d, to: days[days.length - 1].d, n: days.length };
}

// ---------- MODIS NDVI (satellite greenness) ----------
export async function fetchNDVI(lat, lon, monthsBack = 24) {
  const k = 'ndvi:' + key(lat, lon);
  const c = cacheGet(k);
  if (c && Date.now() - c.t < 7 * 864e5) return c.v;
  const now = new Date();
  const start = new Date(now.getTime() - monthsBack * 30.4 * 864e5);
  const dates = [];
  for (let y = start.getFullYear(); y <= now.getFullYear(); y++) {
    for (let d = 1; d <= 353; d += 16) {
      const dt = new Date(Date.UTC(y, 0, d));
      if (dt >= start && dt <= now - 20 * 864e5) dates.push(`A${y}${String(d).padStart(3, '0')}`);
    }
  }
  const chunks = [];
  for (let i = 0; i < dates.length; i += 10) chunks.push([dates[i], dates[Math.min(i + 9, dates.length - 1)]]);
  const res = await Promise.all(chunks.map(([a, b]) => getJSON(`https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${lat}&longitude=${lon}&band=250m_16_days_NDVI&startDate=${a}&endDate=${b}&kmAboveBelow=0&kmLeftRight=0`, 40000).catch(() => null)));
  const pts = [];
  for (const r of res) for (const s of r?.subset || []) {
    const v = s.data?.[0];
    if (v != null && v > -2000) pts.push({ d: s.calendar_date, v: v * 0.0001 });
  }
  pts.sort((a, b) => a.d.localeCompare(b.d));
  // remove cloud dips: value much lower than both neighbours
  const clean = pts.filter((p, i) => !(i > 0 && i < pts.length - 1 && p.v < pts[i - 1].v - 0.15 && p.v < pts[i + 1].v - 0.15));
  if (clean.length) cacheSet(k, { t: Date.now(), v: clean });
  return clean;
}

// ---------- Geocoding ----------
export async function geocode(q, lang = 'en') {
  const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${lang}&format=json`, 12000);
  return (r.results || []).map((x) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}
export async function reverseGeocode(lat, lon, lang = 'en') {
  try {
    const r = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=${lang}`, 8000);
    const a = r.address || {};
    return [a.village || a.town || a.city || a.county || a.state_district, a.state, a.country].filter(Boolean).join(', ') || null;
  } catch { return null; }
}
