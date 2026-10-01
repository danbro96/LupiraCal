import type { FeatureCollection, Point } from 'geojson';
import { useEffect, useRef } from 'react';
import { bboxOf, mapViewport, padBbox, type GeoPoint, type MapViewport } from '@lupira/cal-domain/geo';
import { placeSpanM, zoomForSpan } from '@lupira/cal-domain/mapZoom';
import { useGeoPlace } from '../../../state/usePlaces';
import { useMap } from './MapCanvas';

/** Fly to the selected gazetteer place whenever ?place= changes, framed by the kind of place, and say where
 *  it is so the screen can pin it. */
export function FlyToPlace({ placeId, onLocated }: { placeId: string | undefined; onLocated: (point: [number, number]) => void }) {
  const map = useMap();
  const { data: place } = useGeoPlace(placeId);
  const flownTo = useRef<string>(undefined);

  useEffect(() => {
    if (!placeId) { flownTo.current = undefined; return; }
    if (!place || place.latitude == null || place.longitude == null || flownTo.current === placeId) return;
    flownTo.current = placeId;
    const zoom = zoomForSpan(placeSpanM(place), map.getContainer().clientWidth, place.latitude);
    map.flyTo({ center: [place.longitude, place.latitude], zoom });
    onLocated([place.longitude, place.latitude]);
  }, [map, placeId, place, onLocated]);
  return null;
}

/** Reports the viewport (bbox + zoom) on every settled move. */
export function ViewportReporter({ onChange }: { onChange: (viewport: MapViewport) => void }) {
  const map = useMap();
  useEffect(() => {
    const report = () => {
      const b = map.getBounds();
      onChange(mapViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom()));
    };
    report();
    map.on('moveend', report);
    return () => {
      map.off('moveend', report);
    };
  }, [map, onChange]);
  return null;
}

/** One-time fit to the first non-empty data, unless a deep link already aimed the camera. */
export function FitToData({ collections, skip }: { collections: FeatureCollection[]; skip: boolean }) {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || skip) return;
    const points: GeoPoint[] = collections.flatMap((fc) =>
      fc.features
        .filter((f): f is GeoJSON.Feature<Point> => f.geometry.type === 'Point')
        .map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })));
    if (points.length === 0) return;
    done.current = true;
    const [minLon, minLat, maxLon, maxLat] = padBbox(bboxOf(points)!, 0.15);
    map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { maxZoom: 14, duration: 600 });
  }, [map, collections, skip]);
  return null;
}
