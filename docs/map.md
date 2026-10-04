# Map (web + mobile)

## Web

Route `/locations`, nav label "Map". Lazy (`React.lazy`) so maplibre-gl stays in its own chunk.

- **Data**: occurrences + contacts hydrate placeIds via geo `POST /places/lookup` (`usePlaceCoords`, key `/geo-api/places/lookup` — a hand-written query over a POST, which orval generates as a mutation). GPS via the `/location-api` prefix (`@lupira/cal-api/query/location`).
- **Basemap**: geo-api `/basemap/style.json?theme=` + pmtiles. The client rewrites URLs absolute in `mapStyle.ts`; a fallback wash shows when unprovisioned.
- **Layer palette** is `@lupira/cal-tokens/map`, dataviz-validated — don't tweak hues casually. Unknown activity = dashed gray, never a fifth hue.
- **Glue**: MapLibre/React glue is centralized in `useGeoJsonLayer` (re-adds sources/layers on `styledata`; layers only declare which ids are `interactive`, for the cursor).
- **Clicks are the screen's, not the layers'**: `MapClicks` queries every interactive layer under the pointer at once → `@lupira/cal-domain/mapHits` → `MapHitsCard` in `MapPopover` (one hit = card, several = list; text and actions from `mapHitLabels`), with a `SelectionMarker` on what was picked. Per-layer handlers fired several at once on stacked pins.
- **Range bar** (Today … Year/All, default 30 days) bounds every dated layer — events, photos, hotspots, movement (`trackBucketSeconds`). Layers (`layers=none` is a choice, not an absence) and the range preset are remembered in `state/localPrefs` for when the URL names none.
- `?at=` pins at zoom 16, and a deep link (`at`/`place`/`item`) stops `FitToData` pulling the camera away.
- A jump strip (`useQuickPlaces` → `@lupira/cal-domain/quickPlaces`) lists your home, work and next placed events.
- **Photo layer is clustered by photo-api, not MapLibre**: `/photos/map` takes the viewport's `zoom` and answers per-cell counts (a feature with `count > 1`, tap = fit `photoCellBounds`) or single photos. Never add client clustering: it would re-cluster the cells, and any client-side cap brings back the bug where newer photos crowd older places off the map.

### maplibre-gl v6 worker

maplibre-gl v6's default worker URL (sibling of the entry module) 404s under bundlers, and bundling the worker yourself (`?worker&url`) emits an EMPTY file in prod (tree-shaken — maplibre's `sideEffects` allowlist). Symptom: FF "Attempting to create a Worker from an empty source", gray map, zero `sourcedata`.

Fix, both halves required:

- The `sync:maplibre` script vendors `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` verbatim into `public/maplibre/` (gitignored, runs predev/prebuild).
- `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` in `@danbro96/lupira-web-maplibre/maplibreSetup`, a side-effect module every map constructor imports (`MapCanvas`, the package `MiniMap`).

A missing basemap *sprite* is equally fatal (style stuck loading); `loadMapStyle` Range-probes the pmtiles and falls back to `fallbackStyle` when assets are unprovisioned.

## Mobile Map tab

`apps/mobile/src/ui/screens/MapScreen.tsx`, on `@maplibre/maplibre-react-native`. MapLibre Native reads `pmtiles://https://` sources directly (no worker/protocol shims).

- **Style handling** (absolutize URLs, Range-probe the tiles, fall back) is `@lupira/cal-domain/mapStyle`; each app's `mapStyle.ts` supplies only its transport — cookie on web, bearer on mobile. The bearer for native tile/glyph/sprite requests rides `TransformRequestManager.addHeader` with a stable id (in-place token rotation) and a `match` scoped to the BFF origin — never let that header reach presigned or third-party URLs.
- Layers split into `apps/mobile/src/ui/map/layers.tsx`; chrome (layers sheet + locate FAB) in `MapChrome.tsx`.
- **Taps are the map's, not the sources'**: `queryRenderedFeatures` per layer under the finger → `@lupira/cal-domain/mapHits` → `MapPreviewSheet` (one hit = card with its Open, several = list); a cluster that can't split past `clusterMaxZoom` lists its leaves. The tapped or handed-over point gets `SelectionPin`.
- An `at` target waits for `onDidFinishLoadingMap` — the map mounts after its style loads, so an early `easeTo` is silently dropped.
- One age limit (`prefs.mapSince`, `@lupira/cal-domain/mapWindow`) bounds events, photos, hotspots and movement; layer toggles persist in `prefs.mapLayers`.
- A jump strip under the header (`QuickPlacesStrip`, `useQuickPlaces`) lists your current Home/Work residencies and your parents' home, then the next placed events (`upcomingPlacedEvents`); a jump frames by place type (`@lupira/cal-domain/mapZoom`) and an event opens its preview card.

## Location uploader (mobile)

The phone is the estate's only GPS uploader. `sync/locationRecorder.ts` records under an Android foreground service into `location_fix_queue`; `sync/locationUploader.ts` drains it.

- Ingest is the one call that does NOT ride the BFF: it authenticates with `Authorization: DeviceKey …`, which the BFF's OIDC-only policy rejects, so it posts straight to `LOCATION_INGEST_URL` and must stay hand-written (the OpenAPI doc declares only a Bearer scheme).
- NDJSON lines are snake_case and must never carry principal/device ids — the server rejects the whole line.
- Cadence adapts to speed but **accuracy stays High in every profile**: Balanced is ~100 m, above the server's 50 m cutoff, and still-mode is exactly when visits (80 m / ≥8 min) are detected — a cheap still profile silently yields zero visits.
- Cadence changes call `startLocationUpdatesAsync` again rather than stop+start (Android 12+ forbids restarting a location FGS from the background).
- The task is registered in `index.ts`, not from a React effect — a headless restart has no App component.
