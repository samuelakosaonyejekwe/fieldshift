# FieldShift — Adapting Farms with NASA Data

**Live app:** https://samuelakosaonyejekwe.github.io/fieldshift/

FieldShift is a free, offline-capable, multilingual decision-support tool that helps farmers anywhere on Earth explore crop rotations that strengthen soil health and adapt their farms to changing conditions. Built for the **2026 NASA Space Apps Challenge — “Field Shift: Adapting Farms with NASA Data.”**

Pick a field (search, GPS, map or demo farm) → FieldShift pulls 30 years of NASA Earth observations and a global soil profile for that exact point, combines them with farmer priorities and crop science, and simulates thousands of rotations in the browser in about a second.

## What makes it different
- **Rotation Time Machine** — every recommended plan is replayed through each real year of the NASA record (1995 → last year), showing which seasons would have failed and the cumulative income versus the farmer's current rotation.
- **Crop Shift** — projects NASA-observed temperature and rainfall trends to 2040 and 2050 to show which crops are gaining or losing ground on *this* field.
- **Climate lenses** — re-rank all plans under the full baseline, the last decade, 2040/2050 trends, a +2 °C / −15 % rain stress test, or a custom scenario.
- **Satellite reality check** — MODIS NDVI greenness at the field confirms when vegetation actually grows.
- **Holistic 20-year simulation** — soil organic carbon, RUSLE erosion with NASA-derived rainfall erosivity, nitrogen budget with legume credits, irrigation demand, nitrate-leaching exposure, margins, bad-year income, greenhouse-gas balance and pest/disease breaks.
- **Farmer-weighted** — sliders for soil health, water, income, resilience and simplicity; must-include / never-grow crops; local yields and prices.
- **Explains itself** — plain-language reasons for every plan, read aloud in the farmer's language, shareable by link or WhatsApp, printable as a report.
- **Season so far** — the last 90 days of NASA POWER near-real-time data versus normal, with advice for the current season.
- **Practical action plan** — month-by-month tasks (sow, inoculate, fertilise, irrigate, cover crop, harvest) exportable to any phone calendar.
- **Runs everywhere, for everyone** — no server, no sign-up, no framework; ~60 KB gzipped; installable on Android, iPhone/iPad and desktop; works offline and in airplane mode (23 demo farms pre-cached); NASA data refreshes automatically when online.
- **38 languages** — English, 中文, हिन्दी, Español, Français, العربية, বাংলা, Português, Русский, اردو, Bahasa Indonesia, Deutsch, 日本語, Kiswahili, मराठी, తెలుగు, Türkçe, தமிழ், Tiếng Việt, فارسی, Hausa, ਪੰਜਾਬੀ, Italiano, Yorùbá, Igbo, አማርኛ, Ελληνικά, 한국어, ไทย, Українська, Polski, Nederlands, Filipino, Bahasa Melayu, नेपाली, Soomaali, isiZulu, Afaan Oromoo — with right-to-left layouts and a warm baritone read-aloud voice.
- **Report builder** — choose sections (farm, soil, NASA climate, season so far, crop suitability, plan comparison, plan detail, action plan, Time Machine, methods), the plan to feature and how many plans to compare; export as print/PDF, CSV spreadsheet or JSON.
- **Secure & private** — no accounts, no tracking, no backend; strict Content Security Policy, integrity-checked map library, sanitised share links, anti-clickjacking, HTTPS/HSTS. See [SECURITY.md](SECURITY.md).
- **Self-healing updates** — version-stamped files, automatic updates, on-screen diagnostics, and a clean-start link (`?reset`).
- **In-app guide** (❓ in the top bar) lists every feature and where to find it.

## NASA & open data used
| Source | Used for |
|---|---|
| **NASA POWER** monthly (1995 → last year) & climatology | Temperature & extremes, corrected precipitation, solar radiation, humidity, wind, root-zone & surface soil wetness, frost days |
| **NASA GIBS** | VIIRS true colour, MODIS NDVI, SMAP L4 root-zone soil moisture map layers |
| **MODIS MOD13Q1 NDVI** (ORNL DAAC) | Observed growing seasons at the field |
| **ISRIC SoilGrids 2.0** | Texture, organic carbon, pH, bulk density, CEC, nitrogen |
| FAO Ecocrop / FAO-56 | Crop temperature, water and soil parameters |

## How it works
1. Reference evapotranspiration (Hargreaves radiation method) and effective rainfall from NASA POWER.
2. Each of ~40 crops (incl. 10 cover crops) is placed in the calendar using growing-degree days, frost/heat probabilities from 30 years of monthly extremes, a FAO-56 water balance seeded with NASA root-zone soil wetness, waterlogging, humidity-driven disease, pH, texture and salinity.
3. Every placement is replayed against each historical year to estimate failure risk.
4. Thousands of rotation sequences are generated; gaps are filled with the best cover crop, second cash crop or fallow for the farmer's priorities.
5. Each rotation is simulated for 20 years (two-pool equilibrium-calibrated SOC, RUSLE, N budget, water, economics, GHG) and scored.

All computation runs on the user's device in a Web Worker. Data is fetched directly from NASA and ISRIC by the user's browser and cached for offline use.

## Release
```
python3 tools_release.py <version>   # stamps all module URLs + service-worker cache, then commit & push
```

## Run locally
Any static server works:
```
python3 -m http.server 8000
```
Then open http://localhost:8000.

*Decision support, not a guarantee — combine with local knowledge and extension advice. NASA does not endorse this tool.*
