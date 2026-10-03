// Tiny dependency-free SVG chart kit. Every chart returns an SVG/HTML string;
// tooltips are driven by data-tip attributes (see bindTips).
import { famColor, CROP } from './crops.js?v=1.9.0';
import { cropName, monthName, t } from './i18n.js?v=1.9.0';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// charts are drawn at the on-screen pixel width so text stays legible on phones
let CW = 640;
export const setWidth = (w) => { CW = Math.round(Math.max(300, Math.min(760, w))); };
const fx = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

function niceTicks(min, max, n = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}

function frame(W, H, P, yt, ys, xlabels, unit) {
  let g = '';
  for (const v of yt) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(v)}" y2="${ys(v)}" class="grid"/><text x="${P.l - 6}" y="${ys(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  if (unit) g += `<text x="${P.l - 6}" y="${P.t - 8}" class="ax" text-anchor="end">${esc(unit)}</text>`;
  for (const [x, s] of xlabels) g += `<text x="${x}" y="${H - P.b + 16}" class="ax" text-anchor="middle">${esc(s)}</text>`;
  return g;
}

// Monthly rainfall bars + ET0 line (both mm) ; wet months shaded.
export function rainChart(norm, U) {
  const W = CW, H = 240, P = { l: 44, r: 12, t: 24, b: 28 };
  const P1 = norm.P.map(U.mm), E1 = norm.ET0.map(U.mm);
  const max = Math.max(...P1, ...E1) * 1.08;
  const yt = niceTicks(0, max);
  const ys = (v) => H - P.b - (v / yt[yt.length - 1]) * (H - P.t - P.b);
  const bw = (W - P.l - P.r) / 12, xm = (m) => P.l + bw * (m + 0.5);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(t('ch_rain'))}">`;
  s += frame(W, H, P, yt, ys, norm.P.map((_, m) => [xm(m), W < 450 ? monthName(m).slice(0, 1) : monthName(m).slice(0, 3)]), U.mmL);
  norm.P.forEach((p, m) => {
    const wet = p >= 0.5 * norm.ET0[m];
    if (wet) s += `<rect x="${P.l + bw * m}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" class="wetband"/>`;
  });
  P1.forEach((p, m) => {
    const x = P.l + bw * m + bw * 0.2, w = bw * 0.6, y = ys(p), h = Math.max(0, ys(0) - y);
    s += `<path d="M${x},${ys(0)} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${Math.max(0, h - 4)} z" fill="var(--s1)"/>`;
  });
  s += `<polyline points="${E1.map((v, m) => `${xm(m)},${ys(v)}`).join(' ')}" fill="none" stroke="var(--s2)" stroke-width="2.5" stroke-linejoin="round"/>`;
  E1.forEach((v, m) => { s += `<circle cx="${xm(m)}" cy="${ys(v)}" r="4" fill="var(--s2)" stroke="var(--surface)" stroke-width="2"/>`; });
  norm.P.forEach((p, m) => {
    s += `<rect x="${P.l + bw * m}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-tip="${esc(`<b>${monthName(m, 'long')}</b><br>${t('rain')}: ${fx(U.mm(p))} ${U.mmL}<br>${t('et0')}: ${fx(U.mm(norm.ET0[m]))} ${U.mmL}<br>NASA GWETROOT: ${fx(norm.GW[m] * 100)}%`)}"/>`;
  });
  return s + '</svg>' + legend([[t('rain'), 'var(--s1)', 'bar'], [t('et0'), 'var(--s2)', 'line']]);
}

// Temperature: mean line + extreme band, frost-day markers
export function tempChart(norm, frost, U) {
  const W = CW, H = 220, P = { l: 44, r: 12, t: 24, b: 28 };
  const T = norm.T.map(U.temp), Tx = norm.Tx.map(U.temp), Tn = norm.Tn.map(U.temp);
  const yt = niceTicks(Math.min(...Tn), Math.max(...Tx));
  const ys = (v) => H - P.b - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - P.t - P.b);
  const bw = (W - P.l - P.r) / 12, xm = (m) => P.l + bw * (m + 0.5);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(t('ch_temp'))}">`;
  s += frame(W, H, P, yt, ys, T.map((_, m) => [xm(m), W < 450 ? monthName(m).slice(0, 1) : monthName(m).slice(0, 3)]), U.tempL);
  const zero = U.temp(0);
  if (zero > yt[0] && zero < yt[yt.length - 1]) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(zero)}" y2="${ys(zero)}" class="zero"/>`;
  s += `<path d="M${Tx.map((v, m) => `${xm(m)},${ys(v)}`).join(' L')} L${Tn.map((v, m) => `${xm(11 - m)},${ys(Tn[11 - m])}`).join(' L')} Z" fill="var(--s4)" opacity=".22"/>`;
  s += `<polyline points="${T.map((v, m) => `${xm(m)},${ys(v)}`).join(' ')}" fill="none" stroke="var(--s4d)" stroke-width="2.5"/>`;
  T.forEach((v, m) => { s += `<circle cx="${xm(m)}" cy="${ys(v)}" r="4" fill="var(--s4d)" stroke="var(--surface)" stroke-width="2"/>`; if (frost[m] > 3) s += `<text x="${xm(m)}" y="${P.t + 4}" text-anchor="middle" font-size="13">❄</text>`; });
  T.forEach((v, m) => { s += `<rect x="${P.l + bw * m}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-tip="${esc(`<b>${monthName(m, 'long')}</b><br>${t('tmean')}: ${fx(v, 1)}${U.tempL}<br>${t('textreme')}: ${fx(Tn[m], 0)} … ${fx(Tx[m], 0)}${U.tempL}<br>${fx(frost[m], 0)} ${t('frost_days')}`)}"/>`; });
  return s + '</svg>' + legend([[t('tmean'), 'var(--s4d)', 'line'], [t('textreme'), 'var(--s4)', 'band']]);
}

// Annual series with linear trend
export function trendChart(years, vals, reg, unit, color = 'var(--s1)', fmtv = (v) => fx(v, 1)) {
  const W = CW, H = 200, P = { l: 44, r: 12, t: 22, b: 26 };
  const yt = niceTicks(Math.min(...vals), Math.max(...vals));
  const x0 = years[0], x1 = years[years.length - 1];
  const xs = (y) => P.l + ((y - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const ys = (v) => H - P.b - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - P.t - P.b);
  const xl = years.filter((y) => y % (W < 450 ? 10 : 5) === 0).map((y) => [xs(y), String(y)]);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">` + frame(W, H, P, yt, ys, xl, unit);
  s += `<polyline points="${vals.map((v, i) => `${xs(years[i])},${ys(v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" opacity=".55"/>`;
  vals.forEach((v, i) => { s += `<circle cx="${xs(years[i])}" cy="${ys(v)}" r="3.5" fill="${color}"/>`; });
  if (reg) s += `<line x1="${xs(x0)}" y1="${ys(reg.icpt + reg.slope * x0)}" x2="${xs(x1)}" y2="${ys(reg.icpt + reg.slope * x1)}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 4"/>`;
  const bw = (W - P.l - P.r) / years.length;
  vals.forEach((v, i) => { s += `<rect x="${xs(years[i]) - bw / 2}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent" data-tip="${esc(`<b>${years[i]}</b><br>${fmtv(v)} ${unit}`)}"/>`; });
  return s + '</svg>';
}

// NDVI time series
export function ndviChart(pts) {
  const W = CW, H = 190, P = { l: 40, r: 12, t: 18, b: 26 };
  const ts = pts.map((p) => Date.parse(p.d)), x0 = ts[0], x1 = ts[ts.length - 1];
  const xs = (v) => P.l + ((v - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const yt = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const ys = (v) => H - P.b - v * (H - P.t - P.b);
  const xl = [];
  let last = '';
  pts.forEach((p, i) => { const k = p.d.slice(0, 7); if (k !== last && (+p.d.slice(5, 7)) % (W < 450 ? 6 : 3) === 1) { xl.push([xs(ts[i]), `${monthName(+p.d.slice(5, 7) - 1)} ${p.d.slice(2, 4)}`]); } last = k; });
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">` + frame(W, H, P, yt, ys, xl, 'NDVI');
  const line = pts.map((p, i) => `${xs(ts[i])},${ys(Math.max(0, p.v))}`).join(' ');
  s += `<polygon points="${xs(x0)},${ys(0)} ${line} ${xs(x1)},${ys(0)}" fill="var(--s3)" opacity=".18"/><polyline points="${line}" fill="none" stroke="var(--s3)" stroke-width="2.5"/>`;
  pts.forEach((p, i) => { s += `<circle cx="${xs(ts[i])}" cy="${ys(Math.max(0, p.v))}" r="9" fill="transparent" data-tip="${esc(`<b>${p.d}</b><br>NDVI ${p.v.toFixed(2)}`)}"/>`; });
  return s + '</svg>';
}

// Multi-line chart (e.g. soil carbon trajectories). series: [{name, color, vals}]
export function linesChart(series, xlab, unit, fmtv = (v) => fx(v, 1)) {
  const W = CW, H = 220, P = { l: 48, r: 14, t: 22, b: 28 };
  const all = series.flatMap((s) => s.vals);
  const pad = (Math.max(...all) - Math.min(...all)) * 0.15 || 1;
  const yt = niceTicks(Math.min(...all) - pad, Math.max(...all) + pad);
  const n = series[0].vals.length;
  const xs = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const ys = (v) => H - P.b - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - P.t - P.b);
  const xl = Array.from({ length: n }, (_, i) => i).filter((i) => i % (W < 450 ? 10 : 5) === 0).map((i) => [xs(i), `${xlab} ${i}`]);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">` + frame(W, H, P, yt, ys, xl, unit);
  series.forEach((se) => { s += `<polyline points="${se.vals.map((v, i) => `${xs(i)},${ys(v)}`).join(' ')}" fill="none" stroke="${se.color}" stroke-width="2.5" ${se.dash ? 'stroke-dasharray="6 4"' : ''}/>`; });
  series.forEach((se) => { const v = se.vals[n - 1]; s += `<circle cx="${xs(n - 1)}" cy="${ys(v)}" r="4.5" fill="${se.color}" stroke="var(--surface)" stroke-width="2"/>`; });
  for (let i = 0; i < n; i++) s += `<rect x="${xs(i) - (W / n) / 2}" y="${P.t}" width="${W / n}" height="${H - P.t - P.b}" fill="transparent" data-tip="${esc(`<b>${xlab} ${i}</b><br>${series.map((se) => `<i style='background:${se.color}'></i>${esc(se.name)}: ${fmtv(se.vals[i])} ${unit}`).join('<br>')}`)}"/>`;
  return s + '</svg>' + legend(series.map((se) => [se.name, se.color, 'line']));
}

// Cumulative margin lines + yearly outcome strip (Time Machine)
export function timeMachine(plan, cur, U) {
  const W = CW, H = 230, P = { l: 56, r: 14, t: 20, b: 64 };
  const yrs = plan.map((h) => h.y);
  const cum = (arr) => { let a = 0; return arr.map((h) => (a += h.income)); };
  const cp = cum(plan);
  // align the current rotation by calendar year (a missing year adds nothing)
  let cc = null;
  if (cur) { const by = new Map(cur.map((h) => [h.y, h.income])); let a = 0; cc = yrs.map((y) => (a += by.get(y) ?? 0)); }
  const all = [...cp, ...(cc || []), 0].map(U.money);
  const yt = niceTicks(Math.min(...all), Math.max(...all));
  const n = yrs.length;
  const xs = (i) => P.l + ((i + 0.5) / n) * (W - P.l - P.r);
  const ys = (v) => H - P.b - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (H - P.t - P.b);
  const xl = yrs.map((y, i) => [xs(i), y]).filter(([, y]) => y % (W < 450 ? 10 : 5) === 0).map(([x, y]) => [x, String(y)]);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">` + frame(W, H, P, yt, ys, [], U.moneyL);
  s += `<line x1="${P.l}" x2="${W - P.r}" y1="${ys(0)}" y2="${ys(0)}" class="zero"/>`;
  if (cc) s += `<polyline points="${cc.map((v, i) => `${xs(i)},${ys(U.money(v))}`).join(' ')}" fill="none" stroke="var(--s2)" stroke-width="2.5" stroke-dasharray="6 4"/>`;
  s += `<polyline points="${cp.map((v, i) => `${xs(i)},${ys(U.money(v))}`).join(' ')}" fill="none" stroke="var(--s1)" stroke-width="2.5"/>`;
  // outcome strip
  const cw = (W - P.l - P.r) / n, sy = H - P.b + 10;
  plan.forEach((h, i) => {
    const col = h.fail ? 'var(--bad)' : h.S < 0.6 ? 'var(--warn)' : 'var(--good)';
    const ic = h.frost ? '❄' : h.heat ? '🔥' : h.dry ? '☀' : '';
    s += `<rect x="${P.l + i * cw + 1}" y="${sy}" width="${cw - 2}" height="18" rx="3" fill="${col}" opacity="${h.fail ? 1 : 0.35 + 0.6 * Math.min(1, h.S)}"/>`;
    if (ic && cw > 12) s += `<text x="${xs(i)}" y="${sy + 13}" text-anchor="middle" font-size="10">${ic}</text>`;
  });
  for (const [x, y] of xl) s += `<text x="${x}" y="${H - 16}" class="ax" text-anchor="middle">${y}</text>`;
  plan.forEach((h, i) => {
    const c2 = cc ? U.money(cc[i]) : null;
    s += `<rect x="${P.l + i * cw}" y="${P.t}" width="${cw}" height="${H - P.t - 20}" fill="transparent" data-tip="${esc(`<b>${h.y}</b> — ${cropName(h.id)}<br>${t('score')}: ${Math.round(h.S * 100)}${h.fail ? ' ✖' : ''} ${h.dry ? '☀' : ''}${h.heat ? '🔥' : ''}${h.frost ? '❄' : ''}<br>${t('m_gm')}: ${U.moneyFmt(h.income)}<br>${t('tm_cum')}: ${U.moneyFmt(cp[i])}${c2 != null ? `<br>${t('tm_cur')}: ${U.moneyFmt(cc[i])}` : ''}`)}"/>`;
  });
  return s + '</svg>' + legend([[t('tm_plan'), 'var(--s1)', 'line'], ...(cc ? [[t('tm_cur'), 'var(--s2)', 'dash']] : [])]);
}

// Rotation wheel: one ring per year, 12 month segments
export function wheel(r, size = 220, label = true) {
  const N = r.N, cx = size / 2, cy = size / 2, R = size / 2 - 4, r0 = R * 0.34;
  const ring = (R - r0) / N;
  let s = `<svg viewBox="0 0 ${size} ${size}" class="wheel" role="img" aria-label="${esc(t('wheel'))}">`;
  const arc = (a0, a1, ri, ro) => {
    const p = (a, rr) => [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
    const [x0, y0] = p(a0, ro), [x1, y1] = p(a1, ro), [x2, y2] = p(a1, ri), [x3, y3] = p(a0, ri);
    return `M${x0},${y0} A${ro},${ro} 0 0 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 0 0 ${x3},${y3} Z`;
  };
  for (let y = 0; y < N; y++) {
    for (let m = 0; m < 12; m++) {
      const o = r.occ[y * 12 + m];
      const a0 = (m / 12) * 2 * Math.PI + 0.012, a1 = ((m + 1) / 12) * 2 * Math.PI - 0.012;
      const ri = r0 + y * ring + 1, ro = r0 + (y + 1) * ring - 1;
      const col = o ? famColor(o.id) : 'var(--bare)';
      const op = o ? (o.cover ? 0.55 : o.dorm ? 0.7 : 1) : 1;
      s += `<path d="${arc(a0, a1, ri, ro)}" fill="${col}" opacity="${op}" ${o?.cover ? 'class="hatch"' : ''} data-tip="${esc(`${t('yr')} ${y + 1} · ${monthName(m, 'long')}<br>${o ? (o.cover ? '🌱 ' : '') + cropName(o.id) : t('fallow')}`)}"/>`;
    }
  }
  if (label) for (let m = 0; m < 12; m++) {
    const a = ((m + 0.5) / 12) * 2 * Math.PI, rr = r0 - 11;
    s += `<text x="${cx + rr * Math.sin(a)}" y="${cy - rr * Math.cos(a) + 3}" text-anchor="middle" class="wl">${monthName(m).slice(0, 1)}</text>`;
  }
  return s + '</svg>';
}

// Calendar grid: rows = years, cols = months
export function calendar(r) {
  let h = '<div class="cal" role="table">';
  h += `<div class="cal-row cal-head"><span></span>${Array.from({ length: 12 }, (_, m) => `<span>${monthName(m).slice(0, 3)}</span>`).join('')}</div>`;
  for (let y = 0; y < r.N; y++) {
    h += `<div class="cal-row"><span class="cal-y">${t('yr')} ${y + 1}</span>`;
    let m = 0;
    while (m < 12) {
      const o = r.occ[y * 12 + m];
      let k = m + 1;
      while (k < 12 && sameOcc(r.occ[y * 12 + k], o)) k++;
      const span = k - m;
      const name = o ? cropName(o.id) : t('fallow');
      const ic = o ? CROP[o.id].ic : '';
      h += `<span class="cal-c ${o ? (o.cover ? 'is-cover' : '') : 'is-bare'}" style="grid-column:span ${span};--c:${o ? famColor(o.id) : 'transparent'}" data-tip="${esc(name)}">${span >= 2 || name.length < 6 ? `${ic} ${esc(name)}` : ic}</span>`;
      m = k;
    }
    h += '</div>';
  }
  return h + '</div>';
}
const sameOcc = (a, b) => (!a && !b) || (a && b && a.id === b.id && a.cover === b.cover);

// Grouped horizontal bars: criteria x (plan, current)
export function compareBars(rows, names) {
  const cols = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
  let h = '<div class="cbars">';
  for (const row of rows) {
    h += `<div class="cb-row"><div class="cb-l">${esc(row.label)}</div><div class="cb-bars">`;
    row.vals.forEach((v, i) => {
      if (v == null) return;
      h += `<div class="cb-bar" data-tip="${esc(`${names[i]}: ${Math.round(v)}/100`)}"><i style="width:${Math.max(2, v)}%;background:${cols[i]}"></i><b>${Math.round(v)}</b></div>`;
    });
    h += '</div></div>';
  }
  return h + '</div>' + legend(names.map((n, i) => [n, cols[i], 'bar']));
}

// Crop shift heat table
export function shiftTable(shift, eraLabels) {
  const rows = shift.rows.filter((r) => Math.max(...r.v) >= 0.25).sort((a, b) => b.v[0] - a.v[0]);
  const cell = (v) => {
    const l = 92 - Math.round(v * 52); // lightness ramp (one hue)
    return `background:hsl(152 45% ${l}%);color:${v > 0.62 ? '#fff' : 'var(--ink)'}`;
  };
  let h = `<div class="shift"><div class="sh-row sh-head"><span></span>${eraLabels.map((e) => `<span>${esc(e)}</span>`).join('')}<span>Δ</span></div>`;
  for (const r of rows) {
    const d = r.v[r.v.length - 1] - r.v[0];
    const arrow = d > 0.05 ? `<b class="up">▲ ${Math.round(d * 100)}</b>` : d < -0.05 ? `<b class="down">▼ ${Math.round(-d * 100)}</b>` : '<b class="eq">●</b>';
    h += `<div class="sh-row"><span class="sh-c">${CROP[r.id].ic} ${esc(cropName(r.id))}</span>${r.v.map((v, i) => `<span class="sh-v" style="${cell(v)}" data-tip="${esc(`${cropName(r.id)} · ${eraLabels[i]}: ${Math.round(v * 100)}/100`)}">${Math.round(v * 100)}</span>`).join('')}<span>${arrow}</span></div>`;
  }
  return h + '</div>';
}

export function legend(items) {
  return `<div class="legend">${items.map(([n, c, k]) => `<span><i class="lg-${k}" style="--c:${c}"></i>${esc(n)}</span>`).join('')}</div>`;
}

export function donut(v, size = 56, color = 'var(--brand)') {
  const r = size / 2 - 5, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, v / 100));
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="donut"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="7"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" class="donut-t">${Math.round(v)}</text></svg>`;
}

// One shared tooltip for the whole app
export function bindTips(root = document) {
  const tip = document.getElementById('tip');
  let cur = null;
  const show = (el, x, y) => {
    tip.innerHTML = el.getAttribute('data-tip');
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const px = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14));
    const py = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
    tip.style.transform = `translate(${px}px,${py}px)`;
  };
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) { if (cur) { tip.hidden = true; cur = null; } return; }
    cur = el; show(el, e.clientX, e.clientY);
  });
  root.addEventListener('pointerleave', () => { tip.hidden = true; });
  root.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && e.pointerType !== 'mouse') show(el, e.clientX, e.clientY);
  });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
}
