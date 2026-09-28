import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, LayerSpecification, Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

export type LayerSpecSansSource = Omit<LayerSpecification, 'source'>;

interface GeoJsonLayerOptions {
  cluster?: boolean;
  /** Insert under the other GeoJSON layers, so area marks never cover the pins. */
  beneathData?: boolean;
  /** layerId → click handler. Bound layers also get a pointer cursor. */
  onClick?: Record<string, (feature: MapGeoJSONFeature, e: MapMouseEvent) => void>;
}

/**
 * The one fiddly piece of MapLibre/React glue, kept in one place: add source+layers once the style
 * is ready, re-add after every setStyle (styledata wipes them), push data changes via setData, and
 * tear down on unmount. `layers` must be referentially stable (module const or useMemo).
 */
export function useGeoJsonLayer(
  map: MapLibreMap,
  sourceId: string,
  data: FeatureCollection,
  layers: readonly LayerSpecSansSource[],
  options?: GeoJsonLayerOptions,
) {
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const ensure = () => {
      try {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: dataRef.current,
            ...(options?.cluster ? { cluster: true, clusterMaxZoom: 14, clusterRadius: 48 } : {}),
          });
        }
        const beforeId = options?.beneathData ? firstDataLayerId(map, sourceId) : undefined;
        for (const spec of layers) {
          if (!map.getLayer(spec.id)) map.addLayer({ ...spec, source: sourceId } as LayerSpecification, beforeId);
        }
      } catch {
        // Style mid-transition — the next styledata tick retries.
      }
    };

    if (map.isStyleLoaded()) ensure();
    map.on('load', ensure);
    map.on('styledata', ensure);
    return () => {
      map.off('load', ensure);
      map.off('styledata', ensure);
      try {
        for (const spec of layers) if (map.getLayer(spec.id)) map.removeLayer(spec.id);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Map already removed.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options identity is irrelevant to setup
  }, [map, sourceId, layers]);

  useEffect(() => {
    (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(data);
  }, [map, sourceId, data]);

  const clicks = options?.onClick;
  useEffect(() => {
    if (!clicks) return;
    const bound: [string, (e: MapMouseEvent) => void][] = [];
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    for (const [layerId, handler] of Object.entries(clicks)) {
      const onClick = (e: MapMouseEvent) => {
        const feature = (e as MapMouseEvent & { features?: MapGeoJSONFeature[] }).features?.[0];
        if (feature) handler(feature, e);
      };
      map.on('click', layerId, onClick);
      map.on('mouseenter', layerId, enter);
      map.on('mouseleave', layerId, leave);
      bound.push([layerId, onClick]);
    }
    return () => {
      for (const [layerId, onClick] of bound) {
        map.off('click', layerId, onClick);
        map.off('mouseenter', layerId, enter);
        map.off('mouseleave', layerId, leave);
      }
    };
  }, [map, clicks]);
}

function firstDataLayerId(map: MapLibreMap, ownSourceId: string): string | undefined {
  return map.getStyle().layers.find((l) =>
    'source' in l && l.source !== ownSourceId && map.getSource(l.source as string)?.type === 'geojson')?.id;
}

/** Feature properties round-trip through MapLibre as JSON strings when nested — parse them back. */
export function featureProp<T>(feature: MapGeoJSONFeature, key: string): T | undefined {
  const value = feature.properties?.[key];
  if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
    try { return JSON.parse(value) as T; } catch { /* plain string */ }
  }
  return value as T | undefined;
}
