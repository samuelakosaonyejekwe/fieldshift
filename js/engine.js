// FieldShift rotation engine.
// Pure functions: climate (NASA POWER) + soil + farmer inputs -> ranked rotations.
import { CROPS, CROP, MAIN_CROPS, COVER_CROPS } from './crops.js?v=1.9.2';
import { deriveClimate, climateInsights, textureClass, texGroup, awcOf, kFactor, DAYS, effRain } from './data.js?v=1.9.2';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const DRAIN = { good: 0.25, moderate: 0.6, poor: 1 };
const RETAIN = { retained: 1, partial: 0.5, removed: 0.15 };
const TILL_K = { conventional: 1, reduced: 0.85, notill: 0.72 };
const TILL_RES = { conventional: 0.12, reduced: 0.4, notill: 0.75 };
const SAL = { none: 0, moderate: 0.5, high: 0.9 };
export const N_CO2E = 8.5; // kg CO2e per kg synthetic N (manufacture + field N2O)
const CRED = (c) => (c.cover ? 0.6 : c.per ? 0.5 : 0.3);

// ---------------- Context ----------------
export function makeContext(base, inp, scen) {
  const C = deriveClimate(base, scen || scenarioOf(base, inp.scen));
  const s = { ...inp.soil };
  const cls = textureClass(s.sand, s.silt, s.clay);
  const pr = inp.practice;
  const slope = clamp(pr.slope ?? 2, 0, 60) / 100;
  const th = Math.atan(slope), lam = 60;
  const mexp = slope > 0.05 ? 0.5 : slope > 0.03 ? 0.4 : slope > 0.01 ? 0.3 : 0.2;
  const LS = Math.pow(lam / 22.13, mexp) * (65.41 * Math.sin(th) ** 2 + 4.56 * Math.sin(th) + 0.065);
  const ctx = {
    C, inp, soil: s, cls, grp: texGroup(cls), awc: awcOf(cls), K: kFactor(s.sand, s.silt, s.clay, s.soc), LS,
    Pf: pr.conservation ? 0.6 : 1,
    drain: DRAIN[pr.drainage] ?? 0.6, irr: pr.irrigation || 'none', till: pr.tillage || 'conventional',
    retain: RETAIN[pr.residue] ?? 1, manure: +pr.manure || 0, salinity: SAL[pr.salinity] ?? 0,
    prices: { n: inp.prices?.n ?? 1.1, irr: inp.prices?.irr ?? 0.15 },
    ov: inp.overrides || {}, cache: new Map(),
  };
  ctx.soc0 = Math.max(1, (s.soc || 1) * (s.bd || 1.3) * 30 * 0.1); // t C/ha in 0-30 cm
  // erosion already embedded in today's soil (typical regional cropping, average cover factor ~0.35)
  ctx.eroRef = C.norm.R.reduce((a, r) => a + r, 0) * ctx.K * ctx.LS * 0.35 * ctx.Pf;
  const fT = clamp(2 ** ((C.Tann - 15) / 10), 0.25, 3);
  const gw = mean(C.norm.GW);
  const fW = (0.35 + 0.65 * clamp(C.aridity)) * (gw > 0.8 ? 0.8 : 1);
  const fClay = clamp(1.25 - s.clay / 100, 0.7, 1.2);
  ctx.kRaw = 0.014 * fT * fW * fClay; // replaced by equilibrium calibration in calibrateSOC()
  ctx.minN = Math.min(140, ((ctx.soc0 * ctx.k * 1000) / 11) * 0.5 + ctx.manure * 8);
  ctx.soilF = {};
  for (const c of CROPS) ctx.soilF[c.id] = soilFit(c, ctx);
  calibrateSOC(ctx, base, inp);
  return ctx;
}

// Assume today's measured SOC is in equilibrium with typical regional practice
// (best-suited cereal, half residue kept, conventional tillage, no cover crop) under the
// baseline climate. Decomposition of the active pool (50%) is then scaled for tillage and warming.
function calibrateSOC(ctx, base, inp) {
  const rk = JSON.stringify([inp.soil, inp.practice?.irrigation, inp.practice?.drainage, inp.practice?.salinity]);
  base._ref = base._ref || new Map();
  const ref = base._ref.get(rk) || (() => {
    const bctx = ctx.C.dT || ctx.C.dP || ctx.C.from ? makeContext(base, inp, {}) : ctx;
    if (bctx !== ctx) return bctx.ref;
    let best = null;
    for (const c of MAIN_CROPS) {
      if (c.type !== 'cereal' || c.home) continue;
      const p = placeMain(c, ctx)[0];
      if (p && (!best || p.S > best.S)) best = { c, S: p.S };
    }
    const S = Math.max(0.3, best?.S ?? 0.5), c = best?.c ?? CROP.maize;
    const ag = c.res * S;
    return { H: ag * 0.5 * 0.45 * 0.12 + ag * c.rs * 0.45 * 0.3, T: ctx.C.Tann };
  })();
  base._ref.set(rk, ref);
  ctx.ref = ref;
  const active = 0.5 * ctx.soc0;
  ctx.k = (ref.H / active) * TILL_K[ctx.till] * clamp(2 ** ((ctx.C.Tann - ref.T) / 10), 0.5, 2);
  ctx.active0 = active;
  ctx.minN = Math.min(140, ((ctx.soc0 * 0.012 * clamp(2 ** ((ctx.C.Tann - 15) / 10), 0.4, 2.5) * 1000) / 11) * 0.5 + ctx.manure * 8);
}

export function scenarioOf(base, sc = {}) {
  const mode = sc.mode || 'base';
  if (mode === 'recent') return { from: base.years[base.years.length - 1] - 9 };
  if (mode === 'hotdry') return { dT: 2, dP: -0.15 };
  if (mode === 'custom') return { dT: +sc.dT || 0, dP: (+sc.dP || 0) / 100 };
  if (mode === 'y2040' || mode === 'y2050') {
    const ins = sc._ins || climateInsights(base);
    const yrs = (mode === 'y2040' ? 2040 : 2050) - mean(base.years);
    return { dT: clamp((ins.tTrend / 10) * yrs, -1, 4), dP: clamp(((ins.pTrend / 100) / 10) * yrs, -0.3, 0.3) };
  }
  return {};
}

function soilFit(c, ctx) {
  const ph = ctx.soil.ph;
  const dph = ph < c.ph[0] ? c.ph[0] - ph : ph > c.ph[1] ? ph - c.ph[1] : 0;
  const fph = clamp(1 - 0.3 * dph, 0.2, 1);
  const g = ctx.grp, i = Math.min(1, Math.floor(g));
  const ftex = c.tex[i] + (c.tex[i + 1] - c.tex[i]) * (g - i);
  const fsal = 1 - ctx.salinity * (1 - c.sal);
  return { f: fph * ftex * fsal, ph: fph, tex: ftex, sal: fsal };
}

function trap(c, t) {
  if (t < c.to1) return clamp(0.3 + (0.7 * (t - c.tb)) / Math.max(1, c.to1 - c.tb), 0.05, 1);
  if (t > c.to2) return clamp(1 - (0.7 * (t - c.to2)) / Math.max(1, c.tx - c.to2), 0.05, 1);
  return 1;
}
// frost a crop tolerates while actively growing (hardened winter types tolerate more)
const activeThr = (c) => (c.fr >= -2 ? c.fr : Math.max(c.fr * 0.5, -10));
// humid-season foliar disease pressure (e.g. Ascochyta on chickpea)
const humF = (c, rh) => 1 - c.hum * clamp((rh - 60) / 25);
const kcAt = (c, f) => (f < 0.2 ? 0.5 : f < 0.75 ? c.kc : 0.75);

// ---------------- Placement of a crop in the calendar ----------------
// Simulate a crop from start month s for up to maxSpan months.
// partial=true allows unfinished cover crops (biomass scales with GDD reached).
function evalSpan(c, ctx, s, maxSpan, partial = false, gap = false) {
  const { norm, pBelow, pAbove } = ctx.C;
  const need = c.gdd;
  const t0 = norm.T[s % 12];
  if (t0 < c.tb + 2 || t0 > c.tx + 1) return null;
  if (!c.win && !c.wk && pBelow(s % 12, c.fr) > 0.5) return null;
  let gdd = 0, dorm = 0, done = false, killed = false;
  const months = [];
  for (let i = 0; i < maxSpan; i++) {
    const m = (s + i) % 12, t = norm.T[m];
    if (t < c.tb) {
      if (c.wk) { killed = true; months.push({ m, d: 1 }); break; }
      if (!c.win || pBelow(m, c.fr) > 0.45 || ++dorm > 6) { if (partial && i > 0) break; return null; }
      months.push({ m, d: 1 });
      continue;
    }
    if (t > c.tx + 3) { if (partial && i > 0) break; return null; }
    gdd += (Math.min(t, c.to2) - c.tb) * DAYS[m];
    months.push({ m, d: 0 });
    if (gdd >= need) { done = true; break; }
  }
  const frac = clamp(gdd / need);
  // short warm season: an early-maturing variety can still finish (with lower yield)
  const early = !done && !partial && !c.cover && frac >= 0.75;
  if (!done && !early && !(partial && frac >= 0.3)) return null;
  // strip trailing dormant months (crop ends when last active month ends)
  while (months.length && months[months.length - 1].d && !killed) months.pop();
  const pl = scoreSpan(c, ctx, s, months, frac, killed, gap);
  if (pl && early) { pl.S *= frac * frac; pl.early = true; }
  return pl;
}

function scoreSpan(c, ctx, s, months, frac = 1, killed = false, gap = false) {
  const { norm, pBelow, pAbove } = ctx.C;
  const n = months.length;
  const act = months.filter((x) => !x.d);
  if (!act.length) return null;
  const temp = mean(act.map((x) => trap(c, norm.T[x.m])));
  let fr = 0, hot = 0, wet = 0;
  months.forEach((x, i) => {
    const w = i === 0 ? 0.5 : i === n - 1 ? 0.6 : 1;
    if (!(c.wk && x.d)) fr = Math.max(fr, w * pBelow(x.m, x.d ? c.fr : activeThr(c)));
    const f = (i + 0.5) / n;
    if (!x.d && f > 0.3 && f < 0.85) hot = Math.max(hot, pAbove(x.m, c.tx + 2));
    if (!x.d && norm.P[x.m] > 1.4 * norm.ET0[x.m] && norm.GW[x.m] > 0.7) wet++;
  });
  const frostF = 1 - 0.8 * fr;
  const heatF = 1 - 0.6 * (1 - c.ht) * hot;
  const wetF = c.wl >= 1 ? 1 : 1 - (1 - c.wl) * ctx.drain * (wet / Math.max(1, act.length)) * 0.7;
  // water balance (FAO-56 style, monthly)
  let demand = 0, supply = 0;
  months.forEach((x, i) => {
    const kc = x.d ? 0.3 : kcAt(c, (i + 0.5) / n);
    demand += kc * norm.ET0[x.m] + (x.d ? 0 : c.perc);
    supply += norm.Pe[x.m];
  });
  // plant-available water at sowing, filled according to NASA POWER root-zone soil wetness
  // ...but never more than the rain of the previous four months could have stored (hyper-arid guard)
  let prevRain = 0; for (let k = 1; k <= 4; k++) prevRain += norm.Pe[(((s - k) % 12) + 12) % 12];
  const storage = Math.min(ctx.awc * Math.min(c.rd, 1.5) * clamp((norm.GW[s % 12] - 0.15) / 0.4, 0.1, 1), 0.6 * prevRain + 10) * (gap ? 0.35 : 1);
  supply += storage;
  const deficit = Math.max(0, demand - supply);
  const irr = c.cover ? 0 : ctx.irr === 'full' ? deficit : ctx.irr === 'supplemental' ? Math.min(deficit * 0.6, 220) : 0;
  const ratio = (supply + irr) / Math.max(1, demand);
  // below ~40% of the crop's water need no variety yields reliably
  const waterF = (ratio >= 1 ? 1 : Math.pow(clamp(ratio), 0.35 + 1.3 * (1 - c.dt))) * (ratio < 0.4 ? ratio / 0.4 : 1);
  const soilF = ctx.soilF[c.id].f;
  const diseaseF = humF(c, mean(act.map((x) => norm.RH[x.m])));
  const S = Math.pow(temp, 0.7) * frostF * heatF * waterF * wetF * soilF * diseaseF;
  return { id: c.id, s, n, months, frac, killed, S, temp, frostF, heatF, wetF, waterF, soilF, diseaseF, demand, supply, storage, irr, ratio, rainUse: Math.min(demand, supply) };
}

// Replay a placement through every historical year of the NASA record.
function history(c, ctx, pl) {
  const { S: Y, years } = ctx.C;
  const out = [];
  for (let y = 0; y < years.length; y++) {
    let ok = true, rh = 0, temp = 0, na = 0, demand = 0, supply = 0, frost = false, heat = false, dry = false;
    pl.months.forEach((x, i) => {
      const yy = y + Math.floor((pl.s + i) / 12) - (pl.s >= 12 ? 1 : 0);
      if (yy >= years.length) { ok = false; return; }
      const T = Y.T[yy][x.m], f = (i + 0.5) / pl.n;
      if (!x.d) { temp += trap(c, T); na++; }
      demand += (x.d ? 0.3 : kcAt(c, f)) * Y.ET0[yy][x.m] + (x.d ? 0 : c.perc);
      supply += effRain(Y.P[yy][x.m]);
      const thr = x.d ? c.fr : activeThr(c) - 1;
      if (i > 0 && i < pl.n - 1 && Y.Tn[yy][x.m] < thr && !(c.wk && x.d)) frost = true;
      if (!x.d && f > 0.3 && f < 0.85 && Y.Tx[yy][x.m] > c.tx + 3) heat = true;
      if (!x.d) rh += Y.RH[yy][x.m];
    });
    if (!ok || !na) continue;
    supply += pl.storage;
    const deficit = Math.max(0, demand - supply);
    const irr = ctx.irr === 'full' ? deficit : ctx.irr === 'supplemental' ? Math.min(deficit * 0.6, 220) : 0;
    const ratio = (supply + irr) / Math.max(1, demand);
    const wf = (ratio >= 1 ? 1 : Math.pow(clamp(ratio), 0.35 + 1.3 * (1 - c.dt))) * (ratio < 0.4 ? ratio / 0.4 : 1);
    dry = wf < 0.6 || ratio < 0.5;
    const Sy = Math.pow(temp / na, 0.7) * wf * (frost ? 0.35 : 1) * (heat ? 1 - 0.5 * (1 - c.ht) : 1) * pl.wetF * pl.soilF * humF(c, rh / na);
    out.push({ y: years[y] + Math.floor((pl.s + pl.n - 1) / 12), S: Sy, frost, heat, dry, irr });
  }
  return out;
}

function perennialPlace(c, ctx) {
  const { norm, pBelow } = ctx.C;
  const months = [];
  for (let m = 0; m < 12; m++) {
    const t = norm.T[m];
    if (t < c.tb) { if (pBelow(m, c.fr) > 0.45) return null; months.push({ m, d: 1 }); }
    else if (t > c.tx + 3) return null;
    else months.push({ m, d: 0 });
  }
  const act = months.filter((x) => !x.d).length;
  if (act < 4) return null;
  const pl = scoreSpan(c, ctx, 0, months);
  if (!pl) return null;
  pl.S *= clamp(act / 6, 0.5, 1);
  return pl;
}

// Best placements of a main crop (up to 3 alternatives with different harvest months)
export function placeMain(c, ctx) {
  const ck = 'main:' + c.id;
  if (ctx.cache.has(ck)) return ctx.cache.get(ck);
  let res = [];
  if (c.per) { const p = perennialPlace(c, ctx); if (p) res = [p]; }
  else {
    for (let s = 0; s < 12; s++) { const p = evalSpan(c, ctx, s, 11); if (p) res.push(p); }
    res.sort((a, b) => b.S - a.S || a.n - b.n);
    const seen = new Set();
    res = res.filter((p) => { const h = (p.s + p.n - 1) % 12; if (seen.has(h)) return false; seen.add(h); return true; }).slice(0, 4);
  }
  for (const p of res) {
    // normalise so harvest falls inside the rotation year
    const h = p.s + p.n - 1;
    p.plant = h >= 12 ? p.s - 12 : p.s;
    p.harv = p.plant + p.n - 1;
    p.hist = history(c, ctx, p);
    // a 'failed' season = climate cut the crop below 45% of what this soil allows
    p.pFail = p.hist.length ? p.hist.filter((h2) => h2.S / p.soilF < 0.45).length / p.hist.length : 1;
    p.Smean = p.hist.length ? mean(p.hist.map((h2) => h2.S)) : p.S;
    p.Score = 0.5 * p.S + 0.5 * p.Smean;
  }
  res.sort((a, b) => b.Score - a.Score);
  ctx.cache.set(ck, res);
  return res;
}

const local = (ctx, c) => ({ gm: ctx.ov[c.id]?.gm ?? c.gm, yld: ctx.ov[c.id]?.yld ?? c.yld });

// Suitability of every crop on this farm (for the Crops tab and Crop Shift)
export function suitability(ctx) {
  return CROPS.map((c) => {
    const pl = c.cover ? bestCoverAnywhere(c, ctx) : placeMain(c, ctx)[0];
    if (!pl) return { id: c.id, S: 0, limit: limitWhy(c, ctx) };
    const comps = { temp: Math.pow(pl.temp, 0.7), frost: pl.frostF, heat: pl.heatF, water: pl.waterF, wet: pl.wetF, soil: pl.soilF, disease: pl.diseaseF ?? 1 };
    const limit = Object.entries(comps).sort((a, b) => a[1] - b[1])[0];
    const L = local(ctx, c);
    return { id: c.id, S: pl.Score ?? pl.S, pl, comps, limit: limit[1] < 0.85 ? limit[0] : null, yield: L.yld * (pl.Smean ?? pl.S), pFail: pl.pFail ?? 0 };
  }).sort((a, b) => b.S - a.S);
}
function bestCoverAnywhere(c, ctx) {
  let best = null;
  for (let s = 0; s < 12; s++) { const p = evalSpan(c, ctx, s, 6, true); if (p && (!best || p.S * p.frac > best.S * best.frac)) best = p; }
  if (best) { best.S *= Math.sqrt(best.frac); best.plant = best.s; best.harv = best.s + best.n - 1; }
  return best;
}
function limitWhy(c, ctx) {
  const T = ctx.C.norm.T;
  if (Math.max(...T) < c.tb + 3) return 'temp';
  if (Math.min(...T) > c.tx) return 'heat';
  return 'season';
}

// ---------------- Gap filling (cover crop / double crop / fallow) ----------------
function gapOptions(ctx, a, L) {
  const k = `gap:${((a % 12) + 12) % 12}:${L}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k);
  const s0 = ((a % 12) + 12) % 12;
  const covers = [], doubles = [];
  if (L >= 2) {
    for (const c of COVER_CROPS) {
      let best = null;
      for (let d = 0; d <= Math.min(1, L - 2); d++) {
        const p = evalSpan(c, ctx, s0 + d, L - d, true, true);
        if (p && (!best || p.S * p.frac > best.S * best.frac)) { best = p; best.off = d; }
      }
      if (best) covers.push(best);
    }
    for (const c of MAIN_CROPS) {
      if (c.per) continue;
      for (let d = 0; d <= Math.min(1, L - 2); d++) {
        const p = evalSpan(c, ctx, s0 + d, L - d, false, true);
        if (p && p.S >= 0.45) { p.off = d; doubles.push(p); break; }
      }
    }
  }
  const out = { covers: covers.sort((x, y) => y.S * y.frac - x.S * x.frac), doubles: doubles.sort((x, y) => y.S - x.S) };
  ctx.cache.set(k, out);
  return out;
}

function chooseGap(ctx, prefs, a, L, prev, next, forced) {
  if (L < 2 || forced === 'fallow') return { type: 'fallow', L };
  if (forced && forced !== 'auto' && CROP[forced]) {
    // farmer-specified second crop: place it directly, no automatic rules
    const c = CROP[forced], s0 = ((a % 12) + 12) % 12;
    let pl = null;
    for (let d = 0; d <= Math.min(1, L - 2) && !pl; d++) { pl = evalSpan(c, ctx, s0 + d, L - d, c.cover, true); if (pl) pl.off = d; }
    if (!pl && !c.cover) { pl = evalSpan(c, ctx, s0, L, true, true); if (pl) { pl.off = 0; pl.S *= pl.frac; } }
    return pl ? { type: c.cover ? 'cover' : 'double', id: c.id, pl, L } : { type: 'fallow', L };
  }
  const o = gapOptions(ctx, a, L);
  const W = prefs.w, ar = ctx.C.aridity;
  const refGM = 1500;
  const cands = [{ type: 'fallow', L, u: W.water * (ar < 0.65 ? 0.35 * (1 - ar) : 0) + W.simple * 0.3 }];
  const nextC = CROP[next], prevC = CROP[prev];
  if (prefs.covers !== false) for (const p of o.covers.slice(0, 5)) {
    const c = CROP[p.id];
    const bio = c.res * p.frac * p.S;
    const legBonus = c.nfix && nextC && nextC.ndem > 60 ? 0.3 : c.nfix ? 0.12 : 0;
    const famClash = nextC && c.fam === nextC.fam && c.fam !== 'Poaceae' ? 0.25 : 0;
    const u = W.soil * (clamp(bio / 3.5) * 0.7 + legBonus + 0.25 - famClash)
      + W.water * (-(1 - p.waterF) * 0.6 - (ar < 0.5 ? 0.4 : 0) + 0.15)
      + W.profit * ((c.gm + (c.nfix && nextC ? c.nfix * CRED(c) * p.S * ctx.prices.n : 0)) / refGM)
      + W.resil * 0.1 - W.simple * 0.2;
    if (bio > 0.6 && p.waterF >= 0.5) cands.push({ type: 'cover', id: p.id, pl: p, u, L });
  }
  if (prefs.double !== false) for (const p of o.doubles.slice(0, 6)) {
    const c = CROP[p.id];
    if (prefs.exclude?.includes(c.id) || c.id === next || c.id === prev || (c.hort && !prefs.hort)) continue;
    if ((nextC && c.fam === nextC.fam) || (prevC && c.fam === prevC.fam && c.fam !== 'Poaceae')) continue;
    const L2 = local(ctx, c);
    const net = L2.gm * p.S - c.ndem * p.S * ctx.prices.n * 0.7 - p.irr * ctx.prices.irr;
    const u = W.profit * (net / refGM) * 1.2
      + W.soil * (clamp((c.res * p.S) / 6) * 0.4 + (c.nfix ? 0.2 : 0) - (c.dist - 1))
      + W.water * (-(p.irr / 250) - (1 - p.waterF) * 0.5)
      + W.resil * (p.S - 0.6) * 0.3 - W.simple * 0.35;
    cands.push({ type: 'double', id: p.id, pl: p, u, L });
  }
  if (forced && forced !== 'auto') {
    const f = cands.find((x) => x.id === forced);
    if (f) return f;
  }
  return cands.sort((x, y) => y.u - x.u)[0];
}

// ---------------- Rotation evaluation ----------------
// seq: array of crop ids (one main crop per year); sec: optional per-year secondary override
export function evaluate(seq, ctx, prefs, opt = {}) {
  const N = seq.length;
  const yrs = [];
  for (let i = 0; i < N; i++) {
    const c = CROP[seq[i]];
    const pls = placeMain(c, ctx);
    if (!pls.length) return null;
    yrs.push({ c, pls, pl: pls[0] });
  }
  // resolve timing conflicts using alternative placements; repeat until stable, then verify every gap
  const plantAbs = (i) => i * 12 + yrs[i].pl.plant;
  const harvAbs = (i) => i * 12 + yrs[i].pl.harv;
  const gapOf = (i) => { const j = (i + 1) % N; return plantAbs(j) + (j === 0 ? N * 12 : 0) - harvAbs(i) - 1; };
  for (let pass = 0; pass < N + 2; pass++) {
    let changed = false;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, off = j === 0 ? N * 12 : 0;
      if (yrs[j].c.per || yrs[i].c.per || gapOf(i) >= 0) continue;
      const alt = yrs[j].pls.find((p) => j * 12 + p.plant + off - harvAbs(i) - 1 >= 0);
      const altPrev = yrs[i].pls.find((p) => plantAbs(j) + off - (i * 12 + p.harv) - 1 >= 0);
      if (alt && alt.Score > (altPrev?.Score ?? -1)) yrs[j].pl = alt;
      else if (altPrev) yrs[i].pl = altPrev;
      else if (alt) yrs[j].pl = alt;
      else return null;
      changed = true;
    }
    if (!changed) break;
  }
  for (let i = 0; i < N; i++) if (!yrs[i].c.per && !yrs[(i + 1) % N].c.per && gapOf(i) < 0) return null;
  // perennials fill from previous harvest to next planting
  for (let i = 0; i < N; i++) {
    if (!yrs[i].c.per) continue;
    const p = (i - 1 + N) % N, n = (i + 1) % N;
    yrs[i].start = yrs[p].c.per ? i * 12 : harvAbs(p) + 1 - (p >= i ? N * 12 : 0);
    yrs[i].end = yrs[n].c.per ? i * 12 + 11 : plantAbs(n) - 1 + (n <= i ? N * 12 : 0);
    if (yrs[i].end - yrs[i].start < 6) return null;
  }
  for (let i = 0; i < N; i++) if (!yrs[i].c.per) { yrs[i].start = plantAbs(i); yrs[i].end = harvAbs(i); }
  // secondary slots
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a = yrs[i].end + 1, b = yrs[j].start + (j === 0 ? N * 12 : 0) - 1;
    const L = b - a + 1;
    const forced = opt.sec?.[i];
    yrs[i].sec = (yrs[i].c.per || yrs[j].c.per) ? { type: 'none', L: 0 } : chooseGap(ctx, prefs, a, L, seq[i], seq[j], forced);
    yrs[i].sec.a = a;
    if (yrs[i].sec.pl) {
      yrs[i].sec.start = a + (yrs[i].sec.pl.off || 0);
      // winter-hardy covers stand until the next sowing; frost-tender ones die back and leave a mulch
      const cc = CROP[yrs[i].sec.id];
      yrs[i].sec.end = yrs[i].sec.type === 'cover' && cc.win ? b : yrs[i].sec.start + yrs[i].sec.pl.n - 1;
      yrs[i].sec.mulch = yrs[i].sec.type === 'cover' && !cc.win;
    }
  }
  return metrics(seq, yrs, ctx, prefs);
}

function metrics(seq, yrs, ctx, prefs) {
  const N = seq.length, T = N * 12, C = ctx.C;
  // ---- monthly cover timeline (for erosion, leaching, living roots) ----
  const canopy = new Array(T).fill(0), living = new Array(T).fill(0), resid = new Array(T).fill(0);
  const occ = new Array(T).fill(null);
  const paint = (start, end, c, pl, cover = false) => {
    const n = end - start + 1;
    for (let k = 0; k < n; k++) {
      const t = (((start + k) % T) + T) % T;
      const mo = pl?.months?.[k];
      const dorm = mo?.d;
      const f = (k + 0.5) / n;
      let cv = c.per ? c.cov * (dorm ? 0.6 : 1) : cover ? c.cov * clamp((k + 0.5) / 2) : c.cov * clamp(f / 0.4) * (dorm ? 0.4 : 1);
      if (cover && pl?.killed && k >= pl.months.length - 1) { resid[t] = Math.max(resid[t], 0.6); cv = 0; }
      canopy[t] = Math.max(canopy[t], cv);
      if (cv > 0) living[t] = 1;
      occ[t] = { id: c.id, cover, dorm: !!dorm };
    }
  };
  yrs.forEach((y) => {
    paint(y.start, y.end, y.c, y.c.per ? null : y.pl);
    if (y.sec.pl) paint(y.sec.start, y.sec.end, CROP[y.sec.id], y.sec.pl, y.sec.type === 'cover');
  });
  // residue cover on bare months
  for (let i = 0; i < N; i++) {
    const y = yrs[i];
    const last = y.sec.pl ? CROP[y.sec.id] : y.c;
    const lastS = y.sec.pl ? y.sec.pl.S * (y.sec.pl.frac || 1) : y.pl.S;
    const rc = TILL_RES[ctx.till] * clamp((last.res * lastS * (y.sec.type === 'cover' ? 1 : ctx.retain)) / 4);
    for (let k = y.end + 1; k <= y.end + 14; k++) {
      const t = ((k % T) + T) % T;
      if (occ[t] && !(occ[t].cover && resid[t])) { if (occ[t].id !== (y.sec.id || '')) break; else continue; }
      resid[t] = Math.max(resid[t], rc);
    }
  }
  let ero = 0, sur = 0, surBare = 0;
  for (let t = 0; t < T; t++) {
    const m = t % 12;
    const cf = 1 - 0.92 * Math.max(canopy[t], resid[t]);
    ero += C.norm.R[m] * ctx.K * ctx.LS * cf * ctx.Pf;
    const s = Math.max(0, C.norm.P[m] - C.norm.ET0[m]);
    sur += s; surBare += s * (1 - clamp(canopy[t] / 0.3));
  }
  const erosion = ero / N; // t/ha/yr
  const leach = sur ? surBare / sur : 0;
  const livingFrac = living.reduce((a, b) => a + b, 0) / T;

  // ---- nitrogen, water, money per year ----
  let fertTot = 0, demTot = 0, irrTot = 0, cuTot = 0, gmTot = 0, rainFit = 0;
  const perYear = [];
  const nslots = [];
  yrs.forEach((y) => { nslots.push({ c: y.c, S: y.pl.S }); if (y.sec.pl) nslots.push({ c: CROP[y.sec.id], S: y.sec.pl.S * (y.sec.pl.frac || 1), sec: true }); });
  const nsl = nslots.length;
  let slotIdx = 0;
  yrs.forEach((y, i) => {
    const c = y.c, L = local(ctx, c), pl = y.pl;
    const prev1 = nslots[(slotIdx - 1 + nsl) % nsl], prev2 = nslots[(slotIdx - 2 + nsl) % nsl];
    const credit = (prev1.c.nfix ? prev1.c.nfix * prev1.S * CRED(prev1.c) : 0) + (prev2.c.nfix && nsl > 2 ? prev2.c.nfix * prev2.S * CRED(prev2.c) * 0.3 : 0);
    const dem = c.ndem * pl.S;
    const fert = Math.max(0, dem - credit - ctx.minN);
    let inc = L.gm * pl.S - fert * ctx.prices.n - pl.irr * ctx.prices.irr;
    let irr = pl.irr, cu = pl.rainUse + pl.irr, f2 = 0;
    const s = y.sec;
    if (s.pl) {
      const c2 = CROP[s.id], L2 = local(ctx, c2);
      if (s.type === 'double') {
        f2 = Math.max(0, c2.ndem * s.pl.S - (c.nfix ? c.nfix * pl.S * 0.3 : 0) - ctx.minN * 0.5);
        inc += L2.gm * s.pl.S - f2 * ctx.prices.n - s.pl.irr * ctx.prices.irr;
        irr += s.pl.irr;
      } else inc += c2.gm; // cover crop seed + establishment cost
      cu += s.pl.rainUse + (s.type === 'double' ? s.pl.irr : 0);
    }
    slotIdx += s.pl ? 2 : 1;
    fertTot += fert + f2; demTot += dem + (s.type === 'double' ? CROP[s.id].ndem * s.pl.S : 0);
    irrTot += irr; cuTot += cu; gmTot += inc; rainFit += pl.waterF;
    perYear.push({ id: c.id, plant: pl.plant, harv: pl.harv, start: y.start - i * 12, end: y.end - i * 12, S: pl.S, Smean: pl.Smean, pFail: pl.pFail, yield: L.yld * pl.S, fert: fert + f2, credit, irr, income: inc, sec: s.pl ? { type: s.type, id: s.id, start: s.start - i * 12, end: s.end - i * 12, S: s.pl.S, frac: s.pl.frac, mulch: !!s.mulch } : { type: s.type, L: s.L } });
  });
  const fert = fertTot / N, irr = irrTot / N, cu = cuTot / N, gm = gmTot / N;

  // ---- soil organic carbon, 20 years ----
  const inputs = yrs.map((y) => {
    let h = 0;
    const add = (c, S, frac, ret) => {
      const ag = c.res * S * frac;
      h += ag * ret * 0.45 * 0.12 + ag * c.rs * 0.45 * 0.3 + (c.per ? ag * 0.3 * 0.45 * 0.3 : 0);
    };
    add(y.c, y.pl.S, 1, ctx.retain);
    if (y.sec.pl) add(CROP[y.sec.id], y.sec.pl.S, y.sec.pl.frac || 1, y.sec.type === 'cover' ? 1 : ctx.retain);
    h += ctx.manure * 0.35 * 0.3;
    const dist = Math.max(y.c.dist, y.sec.type === 'double' ? CROP[y.sec.id].dist : 1);
    return { h, dist };
  });
  const socTraj = [ctx.soc0];
  let act = ctx.active0;
  const stable = ctx.soc0 - ctx.active0, conc0 = ctx.soil.soc;
  const eroRef = ctx.eroRef;
  for (let t = 0; t < 20; t++) {
    const inp = inputs[t % N];
    const conc = (conc0 * (act + stable)) / ctx.soc0;
    act = act + inp.h - ctx.k * inp.dist * act - (Math.max(0, erosion - eroRef) * conc * 1.5) / 1000;
    socTraj.push(act + stable);
  }
  const soc = act + stable;
  const socPct = ((soc - ctx.soc0) / ctx.soc0) * 100;
  const socRate = (soc - ctx.soc0) / 20; // t C/ha/yr
  const co2e = socRate * 3.667 - (fert * N_CO2E) / 1000; // t CO2e/ha/yr (positive = removal)

  // ---- pest & disease breaks ----
  let viol = 0;
  const notes = [];
  for (let i = 0; i < N; i++) for (let d = 1; d <= Math.min(N, 4); d++) {
    const a = CROP[seq[i]], b = CROP[seq[(i + d) % N]];
    if (N === 1 && d > 1) break;
    if (a.id === b.id && !a.per && d === 1) {
      const sec = yrs[i].sec;
      const broken = sec.type === 'double' && CROP[sec.id].fam !== a.fam;
      viol += broken ? 0.4 : a.id === 'rice' ? 0.6 : 1;
      if (!broken) notes.push(a.id);
    }
    else if (a.fam === b.fam && d < a.brk && !(a.per && b.per)) viol += a.fam === 'Poaceae' ? 0.4 : 0.8;
  }
  const pest = clamp(1 - viol / Math.max(1, N));

  // ---- resilience ----
  const fams = new Set(seq.map((x) => CROP[x].fam));
  const pFail = mean(yrs.map((y) => y.pl.pFail));
  const stress = ctx.stress ? mean(seq.map((x) => { const p = placeMain(CROP[x], ctx.stress)[0]; const b = placeMain(CROP[x], ctx)[0]; return p && b ? clamp(p.S / Math.max(0.05, b.S), 0, 1.1) : 0; })) : 0.8;
  // historical replay (Time Machine summary)
  const H = timeMachine(seq, yrs, ctx);
  const incs = H.map((h) => h.income).sort((a, b) => a - b);
  const p10 = incs.length ? incs[Math.floor(incs.length * 0.1)] : gm;
  const stab = gm > 0 ? clamp(p10 / gm) : 0;

  // ---- scores 0..100 ----
  const nSelf = clamp(1 - fert / Math.max(1, demTot / N));
  const soilScore = 100 * (0.33 * clamp((socPct + 12) / 24) + 0.25 / (1 + erosion / 5) + 0.15 * livingFrac + 0.12 * nSelf + 0.15 * pest);
  const meanWF = rainFit / N;
  const waterScore = 100 * (0.45 * meanWF + 0.3 * (1 - irr / (irr + 0.5 * C.Pann + 1)) + 0.15 * (1 - leach) + 0.1 * clamp(C.Pann / Math.max(1, cu)));
  const resilScore = 100 * (0.35 * (1 - clamp(1.6 * pFail)) + 0.25 * clamp(stress) + 0.2 * clamp(fams.size / 3) + 0.2 * stab);
  const avgLab = mean(seq.map((x) => CROP[x].lab));
  const secOps = yrs.filter((y) => y.sec.pl).length / N;
  const simpleScore = 100 * clamp(1 - 0.22 * (avgLab - 1) - 0.07 * Math.max(0, new Set(seq).size - 2) - 0.12 * secOps - (irr > 0 ? 0.1 : 0));
  const feas = mean(yrs.map((y) => y.pl.S));
  return {
    seq, N, years: perYear, occ, canopy, resid,
    erosion, leach, livingFrac, fert, irr, cu, gm, p10, socTraj, socPct, socRate, co2e, pest, viol, repeats: notes,
    pFail, stress, fams: fams.size, feas, hist: H,
    scores: { soil: soilScore, water: waterScore, profit: 0, resil: resilScore, simple: simpleScore },
  };
}

// Replay the rotation over the NASA record: year y uses rotation position (y - y0) mod N.
function timeMachine(seq, yrs, ctx) {
  const N = seq.length, years = ctx.C.years;
  const out = [];
  for (let k = 0; k < years.length; k++) {
    const i = k % N, y = yrs[i];
    const h = y.pl.hist.find((x) => x.y === years[k]);
    if (!h) continue;
    const L = local(ctx, y.c);
    let inc = L.gm * h.S - y.c.ndem * h.S * 0.6 * ctx.prices.n - h.irr * ctx.prices.irr;
    if (y.sec.type === 'double') { const c2 = CROP[y.sec.id]; inc += local(ctx, c2).gm * y.sec.pl.S * (0.6 + 0.4 * h.S / Math.max(0.2, y.pl.S)) - c2.ndem * y.sec.pl.S * 0.5 * ctx.prices.n; }
    else if (y.sec.type === 'cover') inc += CROP[y.sec.id].gm;
    out.push({ y: years[k], id: y.c.id, S: h.S, income: inc, frost: h.frost, heat: h.heat, dry: h.dry, fail: h.S / y.pl.soilF < 0.45 });
  }
  return out;
}

export function weights(prio) {
  const w = { soil: +prio.soil, water: +prio.water, profit: +prio.profit, resil: +prio.resil, simple: +prio.simple };
  const s = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const k in w) w[k] /= s;
  return w;
}

function finalize(list, w, refGM) {
  for (const r of list) {
    r.scores.profit = 100 * clamp(r.gm / Math.max(1, refGM));
    // agronomic red flags (same crop / same family too soon) cut the total, whatever the weights
    r.total = Object.keys(w).reduce((s, k) => s + w[k] * r.scores[k], 0) * (0.6 + 0.4 * clamp(r.feas / 0.6)) * (1 - 0.07 * Math.min(3, r.viol / Math.max(1, r.N) * 2));
  }
}

// ---------------- Search ----------------
export function recommend(base, inp) {
  const t0 = performance.now();
  const ins = climateInsights(base);
  const sc = { ...(inp.scen || {}), _ins: ins };
  const ctx = makeContext(base, inp, scenarioOf(base, sc));
  ctx.stress = makeContext(base, inp, (() => { const s = scenarioOf(base, sc); return { ...s, dT: (s.dT || 0) + 2, dP: (s.dP || 0) - 0.15 }; })());
  const prefs = { w: weights(inp.prio), covers: inp.cons.covers, double: inp.cons.double, exclude: inp.cons.exclude || [], hort: !!inp.cons.hort };
  const suit = suitability(ctx);
  const include0 = (inp.cons.include || []).filter((id) => CROP[id] && !CROP[id].cover);
  const okHere = new Set(suit.filter((x) => x.S >= 0.3).map((x) => x.id));
  const include = include0.filter((id) => okHere.has(id));
  const droppedInclude = include0.filter((id) => !okHere.has(id));

  const home = (c) => !c.home || (base.lat >= c.home[0] && base.lat <= c.home[1] && base.lon >= c.home[2] && base.lon <= c.home[3]);
  const market = (c) => (!c.hort || inp.cons.hort) && (c.type !== 'forage' || inp.cons.forage);
  const pool = suit.filter((s) => !CROP[s.id].cover && s.S >= 0.3 && !prefs.exclude.includes(s.id) && ((home(CROP[s.id]) && market(CROP[s.id])) || include.includes(s.id)));
  // rank candidates by suitability blended with value & soil role so the pool is diverse
  const rank = (s) => s.S * (0.7 + 0.3 * clamp(local(ctx, CROP[s.id]).gm / 900)) + (CROP[s.id].nfix ? 0.08 : 0);
  const sorted = [...pool].sort((a, b) => rank(b) - rank(a));
  const lens = inp.cons.len === 'auto' ? [1, 2, 3, 4] : [+inp.cons.len];
  const results = [];
  let evaluated = 0;
  const sMap = Object.fromEntries(suit.map((x) => [x.id, x.S]));
  const gmN = (id) => clamp(local(ctx, CROP[id]).gm / 900);
  const W = prefs.w;
  const quick = (seq) => {
    // cheap pre-screen: suitability, value, legume N supply, family diversity, perennial cover
    let q = 0;
    for (const id of seq) { const c = CROP[id]; q += sMap[id] * (1 + W.profit * gmN(id)) + (c.nfix ? 0.15 * (W.soil + W.profit) : 0) + (c.per ? 0.2 * W.soil : 0); }
    return q / seq.length + 0.12 * new Set(seq.map((x) => CROP[x].fam)).size * (W.soil + W.resil) - 0.08 * (new Set(seq).size - 1) * W.simple;
  };
  const cands = [];
  for (const N of lens) {
    const K = N <= 2 ? 14 : N === 3 ? 12 : N === 4 ? 10 : 8;
    let cand = sorted.slice(0, K).map((s) => s.id);
    for (const id of include) if (!cand.includes(id) && pool.find((p) => p.id === id)) cand.push(id);
    const famSet = new Set(cand.map((x) => CROP[x].fam));
    if (famSet.size < 2) { const extra = sorted.find((s) => CROP[s.id].fam !== CROP[cand[0]].fam); if (extra) cand.push(extra.id); }
    const k = cand.length;
    const idx = new Array(N).fill(0);
    const total = k ** N;
    for (let n = 0; n < total; n++) {
      let r = n;
      for (let i = 0; i < N; i++) { idx[i] = r % k; r = Math.floor(r / k); }
      if (!isCanonical(idx)) continue;
      const seq = idx.map((i) => cand[i]);
      // perennial stands of up to 3 consecutive years are fine; other crops must differ
      if (N > 1 && seq.some((x, i) => x === seq[(i + 1) % N] && !CROP[x].per)) continue;
      if (seq.filter((x) => CROP[x].per).length > 3) continue;
      if (include.length && !include.every((id) => seq.includes(id))) continue;
      cands.push({ seq, q: quick(seq), N });
    }
  }
  // evaluate the most promising candidates per rotation length in full
  const budget = inp.budget || 450;
  for (const N of lens) {
    const group = cands.filter((c) => c.N === N).sort((a, b) => b.q - a.q).slice(0, Math.ceil(budget / lens.length) + (N === 1 ? 0 : 40));
    for (const { seq } of group) {
      const r2 = evaluate(seq, ctx, prefs);
      evaluated++;
      // a one-crop system is only a rotation if a different family follows it in the same year
      if (r2 && N === 1 && !(r2.years[0].sec.type === 'double' && CROP[r2.years[0].sec.id].fam !== CROP[seq[0]].fam)) continue;
      if (r2) results.push(r2);
    }
  }
  // current practice baseline
  const cur = (inp.practice.current || []).filter((x) => CROP[x]);
  // default baseline: the best-suited staple cereal (what most farms in the region grow)
  const staple = sorted.find((x) => CROP[x.id].type === 'cereal' && !CROP[x.id].home) || sorted[0];
  const curSeq = cur.length ? cur : [staple?.id || 'maize'];
  const baseline = evaluate(curSeq, ctx, prefs, { sec: curSeq.map((_, i) => (cur.length && inp.practice.currentSec?.[i]) || (inp.practice.currentCover ? 'auto' : 'fallow')) });
  const refGM = Math.max(1, ...results.map((r) => r.gm), baseline?.gm || 0);
  finalize(results, prefs.w, refGM);
  if (baseline) finalize([baseline], prefs.w, refGM);
  results.sort((a, b) => b.total - a.total);
  // diverse top picks: distinct crop sets
  const top = [], seen = new Set();
  for (const r of results) {
    const key = [...new Set(r.seq)].sort().join('+') + (r.N);
    const keySet = [...new Set(r.seq)].sort().join('+');
    if (seen.has(key) || top.filter((t) => [...new Set(t.seq)].sort().join('+') === keySet).length >= 1) continue;
    seen.add(key); top.push(r);
    if (top.length >= 6) break;
  }
  top.forEach((r) => { r.reasons = explain(r, baseline, ctx, ins); });
  return { ctx: null, droppedInclude, top, baseline, suit: suit.map(slimSuit), evaluated, ms: Math.round(performance.now() - t0), ins: slimIns(ins), scenario: scenarioOf(base, sc), climate: slimClimate(ctx.C), refGM };
}

function isCanonical(idx) {
  const N = idx.length;
  for (let r = 1; r < N; r++) {
    for (let i = 0; i < N; i++) {
      const a = idx[i], b = idx[(i + r) % N];
      if (b < a) return false;
      if (b > a) break;
    }
  }
  return true;
}

// Evaluate a farmer-built rotation (Builder tab)
export function evaluateCustom(base, inp, seq, sec) {
  const ins = climateInsights(base);
  const sc = { ...(inp.scen || {}), _ins: ins };
  const ctx = makeContext(base, inp, scenarioOf(base, sc));
  ctx.stress = makeContext(base, inp, (() => { const s = scenarioOf(base, sc); return { ...s, dT: (s.dT || 0) + 2, dP: (s.dP || 0) - 0.15 }; })());
  const prefs = { w: weights(inp.prio), covers: true, double: true, exclude: [] };
  const r = evaluate(seq, ctx, prefs, { sec });
  return { r, ctx };
}
export { finalize };

// Crop Shift: suitability of every crop across climate eras
export function cropShift(base, inp) {
  const ins = climateInsights(base);
  const eras = [
    ['base', {}], ['recent', { from: base.years[base.years.length - 1] - 9 }],
    ['y2040', scenarioOf(base, { mode: 'y2040', _ins: ins })], ['y2050', scenarioOf(base, { mode: 'y2050', _ins: ins })],
  ];
  const tables = eras.map(([k, sc]) => {
    const ctx = makeContext(base, inp, sc);
    const m = {};
    for (const c of MAIN_CROPS) { const p = placeMain(c, ctx)[0]; m[c.id] = p ? p.Score : 0; }
    return [k, m, sc];
  });
  const home = (c) => !c.home || (base.lat >= c.home[0] && base.lat <= c.home[1] && base.lon >= c.home[2] && base.lon <= c.home[3]);
  return { eras: tables.map(([k, , sc]) => ({ k, dT: sc.dT || 0, dP: sc.dP || 0 })), rows: MAIN_CROPS.filter(home).map((c) => ({ id: c.id, v: tables.map(([, m]) => m[c.id]) })) };
}

// ---------------- Explanations ----------------
function explain(r, b, ctx, ins) {
  const out = [];
  const C = ctx.C;
  // N credits
  const credit = r.years.filter((y) => y.credit > 15).sort((a, b2) => b2.credit - a.credit)[0];
  if (credit) out.push({ ic: '🌱', k: 'r_ncredit', p: { crop: credit.id, n: Math.round(credit.credit), usd: Math.round(credit.credit * ctx.prices.n) } });
  if (b) {
    const dF = b.fert - r.fert;
    if (dF > 10) out.push({ ic: '💰', k: 'r_fert', p: { n: Math.round(dF), co2: Math.round((dF * N_CO2E)) } });
    const dS = r.socPct - b.socPct;
    if (dS > 1) out.push({ ic: '🪱', k: 'r_soc', p: { pct: dS.toFixed(1), co2: (r.socRate * 3.667).toFixed(2) } });
    const dE = b.erosion - r.erosion;
    if (dE > 0.3 && b.erosion > 0) out.push({ ic: '🛡️', k: 'r_erosion', p: { pct: Math.round((dE / b.erosion) * 100), t: dE.toFixed(1) } });
    const dW = b.irr - r.irr;
    if (dW > 20) out.push({ ic: '💧', k: 'r_water', p: { mm: Math.round(dW) } });
    const dR = b.pFail - r.pFail;
    if (dR > 0.04) out.push({ ic: '📉', k: 'r_risk', p: { pct: Math.round(dR * 100) } });
  }
  const cover = r.years.find((y) => y.sec.type === 'cover');
  if (cover) {
    const wetMonths = [];
    for (let k = cover.sec.start; k <= cover.sec.end; k++) wetMonths.push(((k % 12) + 12) % 12);
    const rain = wetMonths.reduce((s, m) => s + C.norm.P[m], 0);
    out.push({ ic: '🌾', k: 'r_cover', p: { crop: cover.sec.id, from: ((cover.sec.start % 12) + 12) % 12, to: ((cover.sec.end % 12) + 12) % 12, mm: Math.round(rain) } });
  }
  const dbl = r.years.find((y) => y.sec.type === 'double');
  if (dbl) out.push({ ic: '➕', k: 'r_double', p: { crop: dbl.sec.id } });
  const tough = r.seq.map((x) => CROP[x]).filter((c) => c.dt >= 0.7);
  if (tough.length && ins.dryFreq > 0.12) out.push({ ic: '☀️', k: 'r_drought', p: { crop: tough[0].id, pct: Math.round(ins.dryFreq * 100) } });
  if (r.fams >= 3) out.push({ ic: '🐞', k: 'r_pests', p: { n: r.fams } });
  // warnings
  const risky = r.years.filter((y) => y.pFail > 0.2).sort((a, b2) => b2.pFail - a.pFail)[0];
  if (risky) out.push({ ic: '⚠️', k: 'w_fail', p: { crop: risky.id, pct: Math.round(risky.pFail * 100) }, warn: true });
  if (r.erosion > 10) out.push({ ic: '⚠️', k: 'w_erosion', p: { t: r.erosion.toFixed(0) }, warn: true });
  if (r.irr > 150) out.push({ ic: '⚠️', k: 'w_irr', p: { mm: Math.round(r.irr) }, warn: true });
  if (r.repeats.length) out.push({ ic: '⚠️', k: 'w_repeat', p: { crop: r.repeats[0] }, warn: true });
  return out;
}

// strip heavy/non-serialisable parts before handing results to the UI
function slimSuit(s) {
  return { id: s.id, S: s.S, limit: s.limit, yield: s.yield, pFail: s.pFail, comps: s.comps, plant: s.pl?.plant, harv: s.pl?.harv, n: s.pl?.n, demand: s.pl?.demand, irr: s.pl?.irr, supply: s.pl?.supply, hist: s.pl?.hist?.map((h) => [h.y, +h.S.toFixed(3)]) };
}
function slimIns(i) { const { C, ...rest } = i; return rest; }
function slimClimate(C) { return { norm: C.norm, Pann: C.Pann, ETann: C.ETann, Tann: C.Tann, aridity: C.aridity, years: C.years, annP: C.annP, annT: C.annT, frost: C.frost, dT: C.dT, dP: C.dP }; }
