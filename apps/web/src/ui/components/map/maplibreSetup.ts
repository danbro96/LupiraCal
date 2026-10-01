import { addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// Imported for its effect by every module that constructs a map. MapLibre's default worker URL (a sibling of
// the entry module) 404s under bundlers, and bundling the worker ourselves gets tree-shaken to an empty file
// (maplibre's sideEffects allowlist). The worker + its shared-module import are served verbatim from
// public/maplibre/ instead (sync:maplibre script).
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
addProtocol('pmtiles', new Protocol().tile);
