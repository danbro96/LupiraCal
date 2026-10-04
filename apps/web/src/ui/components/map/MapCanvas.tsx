import { Map as MapLibreMap, NavigationControl, ScaleControl } from 'maplibre-gl';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import '@danbro96/lupira-web-maplibre/maplibreSetup';
import { fallbackStyle, loadMapStyle } from '@danbro96/lupira-web-maplibre/mapStyle';
import { useMapTheme } from '@danbro96/lupira-web-maplibre/useMapTheme';
import { GEO_API_BASE_URL } from '../../../config';
import { MAP_HOME } from '@danbro96/lupira-domain-maps/mapZoom';
import Paper from '@mui/material/Paper';

const MapContext = createContext<MapLibreMap | null>(null);

/** The live map instance — usable only beneath MapCanvas. */
export function useMap(): MapLibreMap {
  const map = useContext(MapContext);
  if (!map) throw new Error('useMap must be used inside MapCanvas');
  return map;
}

export function MapCanvas({ children, center, zoom }: { children?: ReactNode; center?: [number, number]; zoom?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [basemapMissing, setBasemapMissing] = useState(false);
  const theme = useMapTheme();
  const themeRef = useRef(theme);
  // Initial view only — the map owns the camera after construction.
  const initialView = useRef({ center: center ?? MAP_HOME.center, zoom: zoom ?? MAP_HOME.zoom });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let created: MapLibreMap | undefined;
    (async () => {
      let style;
      try {
        style = await loadMapStyle(themeRef.current, GEO_API_BASE_URL);
      } catch {
        style = fallbackStyle(themeRef.current, GEO_API_BASE_URL);
        if (!disposed) setBasemapMissing(true);
      }
      if (disposed) return;
      created = new MapLibreMap({
        container,
        style,
        center: initialView.current.center,
        zoom: initialView.current.zoom,
        attributionControl: { compact: true },
      });
      created.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      created.addControl(new ScaleControl(), 'bottom-left');
      // The lazy route can mount mid-layout: a 0-width container at construction leaves MapLibre's
      // 400px fallback buffer behind, and its own observer misses the catch-up. One explicit resize heals it.
      requestAnimationFrame(() => { if (!disposed) created?.resize(); });
      created.once('load', () => { if (!disposed) created?.resize(); });
      if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = created;
      setMap(created);
    })();
    return () => {
      disposed = true;
      created?.remove();
      setMap(null);
    };
  }, []);

  // Theme flips restyle in place; data layers re-add themselves on styledata (useGeoJsonLayer).
  useEffect(() => {
    themeRef.current = theme;
    if (!map) return;
    let stale = false;
    (async () => {
      try {
        const style = await loadMapStyle(theme, GEO_API_BASE_URL);
        if (!stale) map.setStyle(style);
      } catch {
        if (!stale) map.setStyle(fallbackStyle(theme, GEO_API_BASE_URL));
      }
    })();
    return () => { stale = true; };
  }, [theme, map]);

  // maplibre-gl.css is unlayered, so overriding its own rules needs '!'.
  return (
    <div
      className="map-canvas [&_.maplibregl-map]:size-full dark:[&_.maplibregl-ctrl-attrib]:bg-[rgba(26,26,25,0.7)]! dark:[&_.maplibregl-ctrl-attrib]:text-[var(--mui-palette-text-secondary)]"
      ref={containerRef}
    >
      {basemapMissing && (
        <Paper
          elevation={2}
          sx={{
            position: 'absolute',
            bottom: 36,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            borderRadius: '8px',
            color: 'text.secondary',
            fontSize: 13,
            p: '4px 12px',
          }}
        >
          Basemap unavailable — pins and tracks still render.
        </Paper>
      )}
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </div>
  );
}
