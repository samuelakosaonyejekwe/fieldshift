# Security & privacy

FieldShift is a static web app (GitHub Pages). There is no backend, database, account system or analytics.

- **Data flow:** the user's browser sends only field coordinates directly to NASA POWER, NASA/ORNL MODIS, ISRIC SoilGrids, Open-Meteo geocoding and OpenStreetMap Nominatim. All analysis runs on the device (Web Worker). Settings and cached data live in the browser's local storage / Cache Storage and can be erased with `?reset`.
- **Transport:** HTTPS enforced with HSTS (GitHub Pages).
- **Content Security Policy** (meta): scripts only from the app origin and the pinned Leaflet build on unpkg; network access limited to the data providers above; no inline scripts, no plugins/objects, restricted `base-uri` and `form-action`.
- **Subresource Integrity** on the Leaflet script and stylesheet.
- **Untrusted input:** shared-link state and stored state are rebuilt field by field (numbers clamped, enums whitelisted, crop ids checked); all dynamic text is HTML-escaped; prototype-pollution keys are ignored.
- **Clickjacking:** the app refuses to run inside a foreign frame.
- **Supply chain:** zero runtime npm dependencies.

Please report vulnerabilities via a private GitHub security advisory on this repository.
