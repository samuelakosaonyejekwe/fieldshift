// FieldShift crop knowledge base.
// Values are indicative global agronomic parameters compiled from FAO Ecocrop,
// FAO-56 crop coefficients, and extension literature. Farmers can override
// yield and gross margin locally in the Crops tab.
//
// Field legend
//  fam  botanical family          type  role in rotation
//  tb   base temperature (°C)     to1/to2 optimal range   tx  upper limit
//  gdd  growing degree days (base tb, capped at to2) from planting to harvest
//  fr   killing frost (monthly extreme minimum, °C)
//  win  can over-winter dormant   wk   winter-killed cover (residue stays)
//  ht/dt/wl  heat / drought / waterlogging tolerance 0..1
//  kc   mid-season crop coefficient (FAO-56)      rd  effective root depth (m)
//  ph   [low, high] preferred pH  tex  suitability on coarse / medium / fine (clay) soils
//  hort high-value horticulture (needs a fresh-produce market)
//  hum  sensitivity to humid-season foliar disease   home  [latS, latN, lonW, lonE] niche crop market region
//  sal  salinity tolerance 0..1   nfix  N fixed (kg/ha)   ndem  N demand at potential
//  res  above-ground residue left (t DM/ha)   rs  root:shoot carbon ratio
//  cov  mean canopy cover         dist  soil disturbance at harvest (1 = none)
//  yld  potential yield (t/ha)    gm  indicative gross margin before N & water (USD/ha)
//  lab  labour/management intensity 1..3   brk  years before same family should return
//  per  perennial (occupies whole year)    perc  extra percolation demand (mm/month, paddy)

export const FAMILIES = {
  Poaceae:        { color: '#eda100', key: 'fam_grass' },
  Fabaceae:       { color: '#1baf7a', key: 'fam_legume' },
  Brassicaceae:   { color: '#e87ba4', key: 'fam_brassica' },
  Solanaceae:     { color: '#e34948', key: 'fam_nightshade' },
  Asteraceae:     { color: '#eb6834', key: 'fam_aster' },
  Malvaceae:      { color: '#9085e9', key: 'fam_mallow' },
  Euphorbiaceae:  { color: '#a0714f', key: 'fam_root' },
  Convolvulaceae: { color: '#b4795a', key: 'fam_root' },
  Amaryllidaceae: { color: '#c58bd8', key: 'fam_allium' },
  Amaranthaceae:  { color: '#d9a066', key: 'fam_amaranth' },
  Pedaliaceae:    { color: '#c9a227', key: 'fam_other' },
  Polygonaceae:   { color: '#e6a3b8', key: 'fam_other' },
};

const C = (o) => Object.assign({
  win: false, wk: false, ht: 0.5, dt: 0.5, wl: 0.3, kc: 1.05, rd: 1.0, ph: [5.5, 7.5],
  tex: [0.8, 1, 0.8], sal: 0.4, nfix: 0, ndem: 0, res: 3, rs: 0.3, cov: 0.6, dist: 1,
  yld: 3, gm: 400, lab: 1, brk: 2, per: false, hum: 0, home: null, hort: false, perc: 0, cover: false,
}, o);

export const CROPS = [
  // ---------- Cereals ----------
  C({ id: 'maize', ic: '🌽', fam: 'Poaceae', type: 'cereal', tb: 10, to1: 20, to2: 30, tx: 38, gdd: 1500, fr: 0, ht: 0.5, dt: 0.35, wl: 0.3, kc: 1.2, rd: 1.2, ph: [5.5, 7.5], tex: [0.7, 1, 0.8], sal: 0.3, ndem: 180, res: 7, cov: 0.55, yld: 9, gm: 600, brk: 1 }),
  C({ id: 'wheat', ic: '🌾', fam: 'Poaceae', type: 'cereal', tb: 3, to1: 15, to2: 22, tx: 32, gdd: 1800, fr: -28, win: true, ht: 0.3, dt: 0.5, wl: 0.3, kc: 1.15, rd: 1.4, ph: [6, 7.8], tex: [0.6, 1, 0.9], sal: 0.6, ndem: 130, res: 5, cov: 0.7, yld: 5, gm: 450, brk: 1 }),
  C({ id: 'rice', ic: '🍚', fam: 'Poaceae', type: 'cereal', tb: 10, to1: 22, to2: 32, tx: 38, gdd: 2200, fr: 5, ht: 0.55, dt: 0.05, wl: 1, kc: 1.2, rd: 0.5, ph: [5, 7.5], tex: [0.2, 0.8, 1], sal: 0.35, ndem: 120, res: 5, cov: 0.8, yld: 6, gm: 700, lab: 2, brk: 1, perc: 120 }),
  C({ id: 'sorghum', ic: '🌾', fam: 'Poaceae', type: 'cereal', tb: 10, to1: 24, to2: 33, tx: 41, gdd: 1500, fr: 0, ht: 0.8, dt: 0.75, wl: 0.45, kc: 1.0, rd: 1.6, ph: [5.5, 8.2], tex: [0.8, 1, 0.9], sal: 0.6, ndem: 100, res: 6, cov: 0.55, yld: 4.5, gm: 350, brk: 1 }),
  C({ id: 'millet', hum: 0.2, ic: '🌾', fam: 'Poaceae', type: 'cereal', tb: 12, to1: 25, to2: 35, tx: 43, gdd: 1200, fr: 2, ht: 0.9, dt: 0.9, wl: 0.2, kc: 0.95, rd: 1.6, ph: [5, 8], tex: [1, 0.9, 0.6], sal: 0.55, ndem: 60, res: 4, cov: 0.45, yld: 2.5, gm: 280, brk: 1 }),
  C({ id: 'barley', ic: '🌾', fam: 'Poaceae', type: 'cereal', tb: 2, to1: 12, to2: 20, tx: 30, gdd: 1500, fr: -15, win: true, ht: 0.35, dt: 0.6, wl: 0.25, kc: 1.15, rd: 1.3, ph: [6, 8.3], tex: [0.7, 1, 0.8], sal: 0.8, ndem: 100, res: 4, cov: 0.7, yld: 4.5, gm: 380, brk: 1 }),
  C({ id: 'oats', ic: '🌾', fam: 'Poaceae', type: 'cereal', tb: 2, to1: 12, to2: 20, tx: 29, gdd: 1450, fr: -8, ht: 0.25, dt: 0.45, wl: 0.4, kc: 1.15, rd: 1.0, ph: [5, 7.5], tex: [0.8, 1, 0.8], sal: 0.45, ndem: 90, res: 4, cov: 0.75, yld: 3.5, gm: 300, brk: 1 }),
  C({ id: 'teff', home: [3, 18, 33, 48], ic: '🌾', fam: 'Poaceae', type: 'cereal', tb: 10, to1: 15, to2: 27, tx: 34, gdd: 1100, fr: 2, ht: 0.45, dt: 0.6, wl: 0.65, kc: 1.0, rd: 0.6, ph: [5, 8], tex: [0.6, 1, 0.9], sal: 0.45, ndem: 60, res: 2.5, cov: 0.7, yld: 2, gm: 500, lab: 2, brk: 1 }),
  // ---------- Grain legumes ----------
  C({ id: 'soybean', ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 10, to1: 20, to2: 30, tx: 37, gdd: 1300, fr: 0, ht: 0.5, dt: 0.4, wl: 0.35, kc: 1.15, rd: 1.0, ph: [6, 7.5], tex: [0.7, 1, 0.8], sal: 0.45, nfix: 150, res: 3, cov: 0.5, yld: 3.2, gm: 550, brk: 2 }),
  C({ id: 'bean', hum: 0.15, ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 10, to1: 17, to2: 25, tx: 32, gdd: 950, fr: 1, ht: 0.25, dt: 0.3, wl: 0.15, kc: 1.1, rd: 0.7, ph: [5.5, 7.5], tex: [0.8, 1, 0.6], sal: 0.15, nfix: 40, ndem: 20, res: 1.5, cov: 0.45, yld: 2, gm: 600, lab: 2, brk: 2 }),
  C({ id: 'cowpea', ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 12, to1: 22, to2: 32, tx: 40, gdd: 1000, fr: 2, ht: 0.85, dt: 0.8, wl: 0.25, kc: 1.05, rd: 1.2, ph: [5.2, 7.5], tex: [1, 1, 0.6], sal: 0.4, nfix: 70, res: 2, cov: 0.65, yld: 1.5, gm: 450, brk: 2 }),
  C({ id: 'groundnut', hum: 0.1, ic: '🥜', fam: 'Fabaceae', type: 'legume', tb: 12, to1: 22, to2: 30, tx: 38, gdd: 1400, fr: 1, ht: 0.65, dt: 0.6, wl: 0.2, kc: 1.1, rd: 0.9, ph: [5.3, 7.3], tex: [1, 0.9, 0.35], sal: 0.35, nfix: 90, res: 1.8, cov: 0.6, dist: 1.15, yld: 2.5, gm: 650, lab: 2, brk: 2 }),
  C({ id: 'chickpea', hum: 0.6, ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 5, to1: 15, to2: 25, tx: 32, gdd: 1300, fr: -6, ht: 0.4, dt: 0.75, wl: 0.1, kc: 1.0, rd: 1.0, ph: [6, 8.5], tex: [0.7, 1, 0.9], sal: 0.35, nfix: 60, res: 1.5, cov: 0.4, yld: 1.8, gm: 550, brk: 2 }),
  C({ id: 'lentil', hum: 0.5, ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 4, to1: 13, to2: 22, tx: 30, gdd: 1200, fr: -10, win: true, ht: 0.3, dt: 0.65, wl: 0.1, kc: 1.05, rd: 0.8, ph: [6, 8.2], tex: [0.8, 1, 0.8], sal: 0.3, nfix: 70, res: 1.2, cov: 0.4, yld: 1.5, gm: 500, brk: 3 }),
  C({ id: 'pigeonpea', ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 12, to1: 22, to2: 32, tx: 40, gdd: 2600, fr: 1, ht: 0.8, dt: 0.85, wl: 0.15, kc: 1.0, rd: 2.0, ph: [5, 7.5], tex: [0.9, 1, 0.8], sal: 0.35, nfix: 100, res: 4, rs: 0.5, cov: 0.6, yld: 1.5, gm: 450, brk: 2 }),
  C({ id: 'pea', hum: 0.2, ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 4, to1: 12, to2: 20, tx: 28, gdd: 1100, fr: -10, win: true, ht: 0.2, dt: 0.4, wl: 0.15, kc: 1.1, rd: 0.8, ph: [6, 7.8], tex: [0.7, 1, 0.8], sal: 0.3, nfix: 90, res: 2.5, cov: 0.6, yld: 3, gm: 400, brk: 3 }),
  C({ id: 'faba', ic: '🌱', fam: 'Fabaceae', type: 'legume', tb: 3, to1: 12, to2: 20, tx: 27, gdd: 1300, fr: -12, win: true, ht: 0.2, dt: 0.35, wl: 0.5, kc: 1.1, rd: 0.9, ph: [6, 8], tex: [0.5, 1, 1], sal: 0.45, nfix: 150, res: 3, cov: 0.6, yld: 3.5, gm: 450, brk: 3 }),
  // ---------- Oilseeds & fibre ----------
  C({ id: 'canola', hum: 0.15, ic: '🌼', fam: 'Brassicaceae', type: 'oilseed', tb: 3, to1: 12, to2: 21, tx: 30, gdd: 1650, fr: -15, win: true, ht: 0.3, dt: 0.45, wl: 0.25, kc: 1.05, rd: 1.3, ph: [5.8, 7.8], tex: [0.6, 1, 0.9], sal: 0.65, ndem: 150, res: 4, cov: 0.65, yld: 2.8, gm: 500, brk: 3 }),
  C({ id: 'sunflower', hum: 0.25, ic: '🌻', fam: 'Asteraceae', type: 'oilseed', tb: 8, to1: 18, to2: 28, tx: 36, gdd: 1500, fr: -1, ht: 0.65, dt: 0.7, wl: 0.2, kc: 1.05, rd: 2.0, ph: [6, 8], tex: [0.7, 1, 0.8], sal: 0.55, ndem: 80, res: 4, cov: 0.5, yld: 2.5, gm: 420, brk: 3 }),
  C({ id: 'sesame', hum: 0.3, ic: '🌱', fam: 'Pedaliaceae', type: 'oilseed', tb: 15, to1: 25, to2: 32, tx: 40, gdd: 1300, fr: 3, ht: 0.85, dt: 0.8, wl: 0.05, kc: 1.0, rd: 1.0, ph: [5.5, 8], tex: [1, 1, 0.5], sal: 0.3, ndem: 50, res: 2, cov: 0.4, yld: 1, gm: 500, lab: 2, brk: 2 }),
  C({ id: 'cotton', ic: '🧶', fam: 'Malvaceae', type: 'fibre', tb: 15, to1: 22, to2: 32, tx: 40, gdd: 2200, fr: 1, ht: 0.75, dt: 0.65, wl: 0.25, kc: 1.15, rd: 1.5, ph: [5.8, 8], tex: [0.6, 1, 1], sal: 0.85, ndem: 120, res: 3, cov: 0.45, yld: 1.5, gm: 700, lab: 2, brk: 1 }),
  // ---------- Roots, tubers, vegetables ----------
  C({ id: 'potato', hum: 0.25, ic: '🥔', fam: 'Solanaceae', type: 'root', tb: 5, to1: 14, to2: 22, tx: 28, gdd: 1200, fr: -1, ht: 0.2, dt: 0.2, wl: 0.15, kc: 1.15, rd: 0.5, ph: [5, 6.8], tex: [1, 1, 0.5], sal: 0.35, ndem: 160, res: 1.5, cov: 0.45, dist: 1.3, yld: 35, gm: 1000, lab: 3, brk: 3 }),
  C({ id: 'cassava', ic: '🍠', fam: 'Euphorbiaceae', type: 'root', tb: 15, to1: 22, to2: 32, tx: 40, gdd: 3600, fr: 3, ht: 0.75, dt: 0.8, wl: 0.15, kc: 0.85, rd: 1.0, ph: [4.5, 7.5], tex: [1, 1, 0.5], sal: 0.3, ndem: 60, res: 3, cov: 0.45, dist: 1.2, yld: 25, gm: 700, lab: 2, brk: 1 }),
  C({ id: 'sweetpotato', ic: '🍠', fam: 'Convolvulaceae', type: 'root', tb: 12, to1: 20, to2: 30, tx: 38, gdd: 1500, fr: 2, ht: 0.6, dt: 0.55, wl: 0.2, kc: 1.15, rd: 1.0, ph: [5, 7], tex: [1, 1, 0.5], sal: 0.4, ndem: 60, res: 2, cov: 0.7, dist: 1.2, yld: 20, gm: 650, lab: 2, brk: 2 }),
  C({ hort: true, id: 'vegetables', hum: 0.25, ic: '🍅', fam: 'Solanaceae', type: 'vegetable', tb: 10, to1: 20, to2: 27, tx: 35, gdd: 1300, fr: 0, ht: 0.4, dt: 0.2, wl: 0.15, kc: 1.15, rd: 0.7, ph: [5.8, 7.2], tex: [0.9, 1, 0.7], sal: 0.35, ndem: 150, res: 2, cov: 0.4, dist: 1.1, yld: 40, gm: 2500, lab: 3, brk: 3 }),
  C({ hort: true, id: 'onion', hum: 0.3, ic: '🧅', fam: 'Amaryllidaceae', type: 'vegetable', tb: 6, to1: 13, to2: 24, tx: 30, gdd: 1600, fr: -5, ht: 0.35, dt: 0.3, wl: 0.15, kc: 1.05, rd: 0.4, ph: [6, 7.5], tex: [0.9, 1, 0.6], sal: 0.25, ndem: 120, res: 0.8, cov: 0.25, dist: 1.2, yld: 35, gm: 2200, lab: 3, brk: 3 }),
  C({ id: 'quinoa', home: [-25, 5, -80, -60], hum: 0.45, ic: '🌾', fam: 'Amaranthaceae', type: 'cereal', tb: 3, to1: 12, to2: 20, tx: 32, gdd: 1300, fr: -4, ht: 0.35, dt: 0.7, wl: 0.15, kc: 1.0, rd: 1.0, ph: [6, 8.5], tex: [0.9, 1, 0.7], sal: 0.9, ndem: 100, res: 2.5, cov: 0.5, yld: 2, gm: 700, lab: 2, brk: 2 }),
  // ---------- Perennial forage ----------
  C({ id: 'alfalfa', ic: '🍀', fam: 'Fabaceae', type: 'forage', per: true, tb: 5, to1: 15, to2: 28, tx: 38, gdd: 0, fr: -30, win: true, ht: 0.6, dt: 0.6, wl: 0.15, kc: 0.95, rd: 2.5, ph: [6.5, 8], tex: [0.7, 1, 0.8], sal: 0.55, nfix: 250, res: 3, rs: 1.0, cov: 0.9, yld: 10, gm: 600, brk: 0 }),
  // grass–clover ley: grouped with grasses for pest-break rules; its clover share supplies the N
  C({ id: 'ley', ic: '🌿', fam: 'Poaceae', type: 'forage', per: true, tb: 4, to1: 12, to2: 25, tx: 35, gdd: 0, fr: -30, win: true, ht: 0.45, dt: 0.5, wl: 0.6, kc: 0.95, rd: 1.0, ph: [5.5, 7.5], tex: [0.8, 1, 1], sal: 0.5, nfix: 100, ndem: 30, res: 4, rs: 1.0, cov: 0.95, yld: 8, gm: 350, brk: 0 }),
  // ---------- Cover crops (secondary slot only) ----------
  C({ id: 'rye', ic: '🌱', fam: 'Poaceae', type: 'cover', cover: true, tb: 2, to1: 10, to2: 20, tx: 30, gdd: 550, fr: -35, win: true, ht: 0.3, dt: 0.6, wl: 0.4, kc: 0.9, rd: 1.2, ph: [5, 7.5], tex: [1, 1, 0.9], sal: 0.5, res: 4, rs: 0.5, cov: 0.85, gm: -60, brk: 0 }),
  C({ id: 'covoats', ic: '🌱', fam: 'Poaceae', type: 'cover', cover: true, wk: true, tb: 2, to1: 12, to2: 20, tx: 29, gdd: 450, fr: -8, ht: 0.25, dt: 0.45, wl: 0.4, kc: 0.9, rd: 0.9, ph: [5, 7.5], res: 2.8, rs: 0.4, cov: 0.8, gm: -45, brk: 0 }),
  C({ id: 'vetch', ic: '🍀', fam: 'Fabaceae', type: 'cover', cover: true, win: true, tb: 3, to1: 12, to2: 22, tx: 30, gdd: 600, fr: -25, ht: 0.3, dt: 0.5, wl: 0.3, kc: 0.9, rd: 1.0, ph: [5.5, 7.5], nfix: 120, res: 3, rs: 0.4, cov: 0.8, gm: -80, brk: 0 }),
  C({ id: 'clover', ic: '🍀', fam: 'Fabaceae', type: 'cover', cover: true, win: true, tb: 4, to1: 12, to2: 22, tx: 30, gdd: 600, fr: -14, ht: 0.3, dt: 0.4, wl: 0.4, kc: 0.9, rd: 0.8, ph: [5.5, 7.5], nfix: 90, res: 3, rs: 0.4, cov: 0.8, gm: -70, brk: 0 }),
  C({ id: 'radish', ic: '🌱', fam: 'Brassicaceae', type: 'cover', cover: true, wk: true, tb: 3, to1: 12, to2: 22, tx: 30, gdd: 400, fr: -6, ht: 0.3, dt: 0.45, wl: 0.2, kc: 0.9, rd: 1.6, ph: [5.5, 7.8], res: 2.5, rs: 0.6, cov: 0.75, gm: -50, brk: 0 }),
  C({ id: 'sunnhemp', ic: '🌱', fam: 'Fabaceae', type: 'cover', cover: true, tb: 15, to1: 22, to2: 32, tx: 40, gdd: 650, fr: 2, ht: 0.8, dt: 0.65, wl: 0.3, kc: 0.95, rd: 1.5, ph: [5, 7.5], nfix: 120, res: 4.5, rs: 0.3, cov: 0.8, gm: -60, brk: 0 }),
  C({ id: 'covcowpea', ic: '🌱', fam: 'Fabaceae', type: 'cover', cover: true, tb: 12, to1: 22, to2: 32, tx: 40, gdd: 550, fr: 2, ht: 0.85, dt: 0.8, wl: 0.25, kc: 0.95, rd: 1.0, ph: [5.2, 7.5], nfix: 70, res: 3, rs: 0.3, cov: 0.8, gm: -50, brk: 0 }),
  C({ id: 'mucuna', ic: '🌱', fam: 'Fabaceae', type: 'cover', cover: true, tb: 15, to1: 22, to2: 32, tx: 40, gdd: 1300, fr: 3, ht: 0.75, dt: 0.6, wl: 0.3, kc: 1.0, rd: 1.2, ph: [4.5, 7.5], nfix: 150, res: 6, rs: 0.3, cov: 0.9, gm: -40, brk: 0 }),
  C({ id: 'lablab', ic: '🌱', fam: 'Fabaceae', type: 'cover', cover: true, tb: 12, to1: 20, to2: 30, tx: 38, gdd: 900, fr: 1, ht: 0.75, dt: 0.75, wl: 0.25, kc: 0.95, rd: 1.5, ph: [5, 7.8], nfix: 100, res: 4, rs: 0.35, cov: 0.8, gm: -45, brk: 0 }),
  C({ id: 'buckwheat', ic: '🌱', fam: 'Polygonaceae', type: 'cover', cover: true, tb: 8, to1: 16, to2: 26, tx: 34, gdd: 450, fr: 0, ht: 0.35, dt: 0.4, wl: 0.15, kc: 0.9, rd: 0.6, ph: [5, 7], res: 2, rs: 0.25, cov: 0.75, gm: -40, brk: 0 }),
];

export const CROP = Object.fromEntries(CROPS.map((c) => [c.id, c]));
export const MAIN_CROPS = CROPS.filter((c) => !c.cover);
export const COVER_CROPS = CROPS.filter((c) => c.cover);

export const famColor = (c) => (c === 'fallow' ? '#9a9890' : (FAMILIES[CROP[c]?.fam]?.color || '#2a78d6'));
