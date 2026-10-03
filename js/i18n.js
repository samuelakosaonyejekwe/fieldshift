// Interface strings. English is built in; other languages load on demand from js/lang/<code>.js
export const LANGS = [
  ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['pt', 'Português'], ['sw', 'Kiswahili'], ['hi', 'हिन्दी'],
];

export const EN = {
  app_tag: 'Crop rotations for a changing climate, powered by NASA Earth observations',
  tab_farm: 'Farm', tab_climate: 'Climate', tab_goals: 'Goals', tab_plans: 'Plans', tab_lab: 'Crop lab',
  // landing
  hero_title: 'Plan rotations that protect your soil and survive tomorrow’s weather',
  hero_sub: '30 years of NASA satellite climate records, global soil maps and agronomic science — combined for your exact field in seconds. Free, offline-ready, in your language.',
  search_ph: 'Search a village, town or region…', use_gps: 'Use my location', pick_map: 'Pick on map',
  or_demo: 'Or explore a demo farm', demo_note: 'Demo farms work offline. Any point on Earth works when online.',
  coords: 'Coordinates', go: 'Go', lat: 'Latitude', lon: 'Longitude',
  loading_power: 'Downloading 30 years of NASA POWER climate data…', loading_soil: 'Reading SoilGrids soil profile…',
  loading_engine: 'Simulating thousands of rotations…', loading_done: 'Ready',
  err_fetch: 'Could not reach NASA servers. Check the connection or try a demo farm.', err_gps: 'Location unavailable. Search or pick on the map instead.',
  from_cache: 'Opened from offline cache', offline: 'You are offline — cached farms and demo farms still work.',
  // farm tab
  farm_title: 'Your farm', change_loc: 'Change location', soil_title: 'Soil', soil_src: 'Auto-filled from ISRIC SoilGrids (250 m). Replace with your own soil test if you have one.',
  soil_none: 'No SoilGrids data at this point (city or water). Typical values are used — please edit.',
  clay: 'Clay', sand: 'Sand', silt: 'Silt', soc: 'Organic carbon', ph: 'pH', bd: 'Bulk density', cec: 'CEC', texture: 'Texture',
  practices: 'How you farm', irrigation: 'Irrigation', irr_none: 'Rain-fed', irr_supplemental: 'Some (supplemental)', irr_full: 'Full irrigation',
  tillage: 'Tillage', till_conventional: 'Plough / conventional', till_reduced: 'Reduced', till_notill: 'No-till',
  residue: 'Crop residues', res_retained: 'Left on field', res_partial: 'Half removed', res_removed: 'Removed / burned',
  drainage: 'Drainage', dr_good: 'Good', dr_moderate: 'Moderate', dr_poor: 'Poor / floods',
  slope: 'Field slope', salinity: 'Salinity', sal_none: 'None', sal_moderate: 'Moderate', sal_high: 'High',
  manure: 'Manure / compost', t_ha_yr: 't/ha per year', conservation: 'Contours, terraces or strips',
  current_rot: 'What do you grow now?', current_hint: 'Your current sequence is the baseline every plan is compared with.',
  current_cover: 'I already plant cover crops', add_year: 'Add year', remove: 'Remove',
  // climate tab
  clim_title: 'What NASA sees at your farm', clim_sub: 'NASA POWER satellite-derived climate, {y0}–{y1}',
  k_temp: 'Mean temperature', k_rain: 'Annual rainfall', k_arid: 'Water balance', k_dry: 'Drought years', k_warm: 'Warming', k_rainTrend: 'Rainfall trend',
  k_soilw: 'Root-zone soil moisture', k_seasons: 'Rainy seasons',
  per_decade: 'per decade', of_years: 'of years', arid_idx: 'rain ÷ crop water demand',
  ch_rain: 'Monthly rainfall vs crop water demand', ch_temp: 'Temperature range', ch_trendT: 'Annual temperature since {y0}', ch_trendP: 'Annual rainfall since {y0}',
  rain: 'Rainfall', et0: 'Water demand (ET₀)', tmean: 'Mean', textreme: 'Monthly extremes', frost_days: 'frost days',
  ndvi_title: 'Satellite greenness at your field (MODIS NDVI)', ndvi_sub: 'Peaks show when vegetation actually grows here — a reality check for the plan.', ndvi_load: 'Load satellite greenness', ndvi_none: 'No greenness data returned for this point.',
  ndvi_peak: 'Greenness peaks in {m}',
  shift_title: 'Crop Shift — who wins and loses as the climate moves', shift_sub: 'Suitability of each crop under the NASA baseline, the last decade, and NASA-trend projections to 2040 and 2050.',
  era_base: 'Baseline', era_recent: 'Last 10 yrs', era_y2040: '2040', era_y2050: '2050',
  zone: 'Climate zone', sig: 'statistically significant', notsig: 'not significant',
  map_layers: 'NASA layers', l_true: 'True colour (VIIRS)', l_ndvi: 'Vegetation (MODIS NDVI)', l_smap: 'Root-zone soil moisture (SMAP)', l_osm: 'Street map',
  // goals tab
  goals_title: 'What matters most to you?', goals_sub: 'Move the sliders — plans re-rank instantly.',
  p_soil: 'Soil health', p_water: 'Save water', p_profit: 'Income', p_resil: 'Climate resilience', p_simple: 'Simplicity',
  pd_soil: 'Carbon, erosion, nitrogen, living roots', pd_water: 'Less irrigation, rain used well', pd_profit: 'Average yearly margin', pd_resil: 'Survive droughts, heat and frost', pd_simple: 'Fewer crops & operations',
  presets: 'Quick presets', pr_balanced: 'Balanced', pr_soil: 'Regenerate soil', pr_income: 'Maximise income', pr_drought: 'Drought-proof', pr_small: 'Smallholder',
  constraints: 'Options', rot_len: 'Rotation length', auto: 'Auto', years: 'years', yr: 'yr',
  allow_cover: 'Use cover crops between seasons', allow_double: 'Allow a second cash crop in the same year',
  allow_hort: 'I can sell vegetables / onions', allow_forage: 'I keep livestock or sell forage',
  must_grow: 'Must include', never_grow: 'Never grow', tap_crops: 'Tap crops to cycle: include → exclude → neutral',
  prices: 'Local prices', n_price: 'Nitrogen fertiliser (USD per kg N)', w_price: 'Irrigation water (USD per mm·ha)',
  // plans tab
  plans_title: 'Recommended rotations', plans_sub: '{n} rotations simulated against {y} years of NASA data in {ms} ms',
  lens: 'Climate lens', sc_base: 'NASA baseline', sc_recent: 'Last 10 years', sc_y2040: '2040 trend', sc_y2050: '2050 trend', sc_hotdry: '+2 °C, −15% rain', sc_custom: 'Custom',
  sc_note: 'Climate shifted by {dT} °C and {dP}% rainfall', dT: 'Temperature change', dP: 'Rainfall change',
  your_current: 'Your current rotation', vs_current: 'vs. now', best: 'Best match', score: 'Score',
  s_soil: 'Soil', s_water: 'Water', s_profit: 'Income', s_resil: 'Resilience', s_simple: 'Simple',
  m_soc: 'Soil carbon in 20 yrs', m_ero: 'Soil loss', m_fert: 'N fertiliser', m_irr: 'Irrigation', m_gm: 'Avg. margin', m_p10: 'Bad-year margin', m_fail: 'Crop failure risk', m_co2: 'Climate impact', m_living: 'Living roots',
  u_tha: 't/ha/yr', u_kgha: 'kg N/ha/yr', u_mm: 'mm/yr', u_usd: 'USD/ha/yr', u_co2: 't CO₂e/ha/yr',
  why: 'Why this plan', warnings: 'Watch out', details: 'Open plan', close: 'Close', compare: 'Compare',
  calendar: 'Field calendar', wheel: 'Rotation wheel', soc_chart: 'Soil carbon over 20 years', score_vs: 'Scores vs. your current rotation',
  tm_title: 'Time Machine — this plan replayed through real weather, {y0}–{y1}', tm_sub: 'Each square is one real year from NASA records. Green = good season, red = crop failure.',
  tm_cum: 'Cumulative margin', tm_plan: 'This plan', tm_cur: 'Current rotation', tm_fails: '{n} failed seasons',
  year_table: 'Year by year', crop: 'Crop', sow: 'Sow', harvest: 'Harvest', exp_yield: 'Expected yield', then: 'Then',
  fallow: 'Fallow', cover: 'Cover crop', double: 'Second crop', none: '—',
  share: 'Share', print: 'Report / PDF', speak: 'Read aloud', stop: 'Stop', whatsapp: 'WhatsApp', copied: 'Link copied',
  no_plans: 'No workable rotation found. Try allowing irrigation, more crops, or a different climate lens.',
  cur_fail: 'Your current crops cannot complete a season under this climate.',
  computing: 'Computing…',
  // reasons
  r_ncredit: '{crop} leaves ~{n} kg N/ha for the next crop — worth about ${usd}/ha in fertiliser.',
  r_fert: 'Cuts nitrogen fertiliser by {n} kg/ha/yr vs. now (≈{co2} kg CO₂e avoided).',
  r_soc: 'Builds {pct}% more soil carbon than your current rotation over 20 years.',
  r_erosion: 'Reduces soil erosion by {pct}% ({t} t/ha/yr kept on the field).',
  r_water: 'Needs {mm} mm/yr less irrigation water.',
  r_risk: 'Lowers crop-failure risk by {pct} points across the 30-year NASA record.',
  r_cover: '{crop} protects the soil {from}–{to}, when {mm} mm of rain would otherwise hit bare ground.',
  r_double: 'Adds a second harvest ({crop}) in the same year.',
  r_drought: '{crop} tolerates the dry years NASA recorded in {pct}% of seasons.',
  r_pests: '{n} different plant families break pest and disease cycles.',
  w_fail: '{crop} failed in {pct}% of the historical years — consider a drought/heat-tolerant variety.',
  w_erosion: 'Soil loss stays high (~{t} t/ha/yr): add contours, mulch or no-till.',
  w_irr: 'Relies on ~{mm} mm/yr of irrigation.',
  w_repeat: '{crop} follows itself — watch for pests and disease.',
  act_title: 'Action plan — what to do and when',
  act_sub: 'Month-by-month field operations for this rotation. Add them to your phone calendar as reminders.',
  act_sow: 'Prepare the seedbed and sow {crop}.',
  act_inoc: 'Inoculate {crop} seed with rhizobium before sowing — free nitrogen.',
  act_fert: 'Apply about {n} kg N/ha to {crop}: half at sowing, half 4–6 weeks later.',
  act_irr: 'Plan about {mm} of irrigation for {crop} in the driest weeks.',
  act_variety: 'Choose a drought- and heat-tolerant {crop} variety; consider crop insurance.',
  act_harvest: 'Harvest {crop}; leave the residues on the soil surface.',
  act_cover: 'Right after harvest, sow the cover crop {crop}.',
  act_term: 'End the cover crop {crop} (roll, mow or graze) 2–3 weeks before the next sowing.',
  act_double: 'Sow the second crop {crop} straight after harvest.',
  ics: 'Add to phone calendar',
  // crop lab
  lab_title: 'Crop lab', lab_sub: 'How every crop fits your farm, and a builder to test your own rotation.',
  builder: 'Rotation builder', builder_sub: 'Pick a crop for each year and compare with the recommendations.',
  suit_title: 'Crop suitability on this farm', limit_by: 'Limited by', yield_local: 'Your yield (t/ha)', gm_local: 'Your margin (USD/ha)',
  lim_temp: 'temperature', lim_frost: 'frost', lim_heat: 'heat', lim_water: 'water', lim_wet: 'waterlogging', lim_soil: 'soil', lim_disease: 'humid-season disease', lim_season: 'season too short',
  excellent: 'Excellent', good: 'Good', marginal: 'Marginal', poor: 'Poor', unsuitable: 'Not suited',
  type_cereal: 'Cereal', type_legume: 'Legume', type_oilseed: 'Oilseed', type_fibre: 'Fibre', type_root: 'Root & tuber', type_vegetable: 'Vegetable', type_forage: 'Forage', type_cover: 'Cover crop',
  fails_in: 'fails {pct}% of years', auto_sec: 'Auto', evaluate: 'Evaluate',
  // settings / about
  settings: 'Settings', language: 'Language', units: 'Units', metric: 'Metric', imperial: 'Imperial', theme: 'Theme', th_auto: 'Auto', th_light: 'Light', th_dark: 'Dark',
  text_size: 'Text size', install: 'Install app', about: 'About & data', saved_farms: 'Saved farms', save_farm: 'Save farm', reset: 'Reset',
  about_body: 'FieldShift combines NASA Earth observations with soil maps and crop science to help farmers explore crop rotations that strengthen soil health and adapt to changing conditions. All calculations run on your device.',
  data_sources: 'Data sources', method: 'How it works', disclaimer: 'Decision support, not a guarantee. Combine with local knowledge and extension advice.',
  // families
  fam_grass: 'Grass family', fam_legume: 'Legume (fixes N)', fam_brassica: 'Brassica', fam_nightshade: 'Nightshade', fam_aster: 'Sunflower family', fam_mallow: 'Mallow', fam_root: 'Root crop', fam_allium: 'Allium', fam_amaranth: 'Amaranth', fam_other: 'Other',
  // crops
  c_maize: 'Maize', c_wheat: 'Wheat', c_rice: 'Rice', c_sorghum: 'Sorghum', c_millet: 'Pearl millet', c_barley: 'Barley', c_oats: 'Oats', c_teff: 'Teff',
  c_soybean: 'Soybean', c_bean: 'Common bean', c_cowpea: 'Cowpea', c_groundnut: 'Groundnut', c_chickpea: 'Chickpea', c_lentil: 'Lentil', c_pigeonpea: 'Pigeon pea', c_pea: 'Field pea', c_faba: 'Faba bean',
  c_canola: 'Canola / rapeseed', c_sunflower: 'Sunflower', c_sesame: 'Sesame', c_cotton: 'Cotton', c_potato: 'Potato', c_cassava: 'Cassava', c_sweetpotato: 'Sweet potato',
  c_vegetables: 'Vegetables (tomato etc.)', c_onion: 'Onion', c_quinoa: 'Quinoa', c_alfalfa: 'Alfalfa', c_ley: 'Grass-clover ley',
  c_rye: 'Cereal rye', c_covoats: 'Oats (cover)', c_vetch: 'Hairy vetch', c_clover: 'Crimson clover', c_radish: 'Tillage radish', c_sunnhemp: 'Sunn hemp', c_covcowpea: 'Cowpea (cover)', c_mucuna: 'Velvet bean (mucuna)', c_lablab: 'Lablab', c_buckwheat: 'Buckwheat',
  // zones
  z_tropical: 'Tropical', z_subtropical: 'Subtropical', z_temperate: 'Temperate', z_cold: 'Cold-winter',
  z_arid: 'arid', z_semiarid: 'semi-arid', z_subhumid_dry: 'dry sub-humid', z_subhumid: 'sub-humid', z_humid: 'humid',
};

let dict = EN;
let code = 'en';
export async function setLang(c) {
  code = LANGS.some(([k]) => k === c) ? c : 'en';
  if (code === 'en') { dict = EN; return; }
  try { const m = await import(`./lang/${code}.js`); dict = { ...EN, ...m.default }; } catch { dict = EN; code = 'en'; }
}
export const lang = () => code;
export function t(k, p) {
  let s = dict[k] ?? EN[k] ?? k;
  if (p) s = s.replace(/\{(\w+)\}/g, (_, x) => (p[x] ?? ''));
  return s;
}
export const cropName = (id) => t('c_' + id);
export function monthName(m, style = 'short') {
  try { return new Intl.DateTimeFormat(code, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2021, ((m % 12) + 12) % 12, 15))); } catch { return 'JFMAMJJASOND'[((m % 12) + 12) % 12]; }
}
export function guessLang() {
  const n = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS.some(([k]) => k === n) ? n : 'en';
}
