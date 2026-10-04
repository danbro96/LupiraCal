# Maps in Cal

The map screen, movement history and GPS upload live in Lupira Maps (maps.lupira.com, repo LupiraMaps). Cal keeps two map pieces, both on MapLibre:

- **Place tile thumbnail** (web `places/PlaceTile` → `@danbro96/lupira-web-maplibre` `MiniMap`; mobile `ui/map/MiniMap`): a small gesture-less map framed by place type (`@danbro96/lupira-domain-maps/mapZoom`). Tapping the tile opens Maps at that point (`mapsAtUrl`).
- **Pin dialog** (web `MapPinDialog`, from the place picker): drop a pin when address search can't find the place.

## Basemap

geo-api `/basemap/style.json?theme=` + pmtiles, proxied through the BFF's `static` group (GET-only file subtree). The style loader absolutizes URLs and falls back to a wash when assets are unprovisioned (`@danbro96/lupira-web-maplibre/mapStyle`, `@danbro96/lupira-domain-maps/mapStyle`); each app supplies only its transport — cookie on web, bearer on mobile. The mobile bearer for native tile/glyph/sprite requests rides `TransformRequestManager.addHeader` with a stable id and a `match` scoped to the BFF origin — never let that header reach presigned or third-party URLs.

## maplibre-gl v6 worker (web)

maplibre-gl v6's default worker URL 404s under bundlers, and bundling the worker yourself (`?worker&url`) emits an EMPTY file in prod (tree-shaken). Symptom: FF "Attempting to create a Worker from an empty source", gray map, zero `sourcedata`.

Fix, both halves required:

- The `sync:maplibre` script (`lupira-sync-maplibre public/maplibre`, predev/prebuild) vendors `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` verbatim into `public/maplibre/` (gitignored).
- `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` in `@danbro96/lupira-web-maplibre/maplibreSetup`, a side-effect module every map constructor imports.

A missing basemap *sprite* is equally fatal (style stuck loading).
