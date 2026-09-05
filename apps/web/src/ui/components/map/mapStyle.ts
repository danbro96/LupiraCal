import type { StyleSpecification } from 'maplibre-gl';
import { fallbackStyle as sharedFallback, loadBasemapStyle } from '@lupira/cal-domain/mapStyle';
import { GEO_API_BASE_URL } from '../../../config';
import type { MapTheme } from '@lupira/cal-tokens/map';

/** The document logic is shared with the mobile app; only the cookie transport is this app's. */
const sameOrigin = (url: string, headers?: Record<string, string>) => fetch(url, { headers, credentials: 'include' });

// BasemapStyle is a slice of the spec, so the widening needs the detour through unknown.
export async function loadMapStyle(theme: MapTheme): Promise<StyleSpecification> {
  const style = await loadBasemapStyle(
    sameOrigin,
    `${GEO_API_BASE_URL}/basemap/style.json?theme=${theme}`,
    window.location.origin,
  );
  return style as unknown as StyleSpecification;
}

export function fallbackStyle(theme: MapTheme): StyleSpecification {
  return sharedFallback(theme, `${window.location.origin}${GEO_API_BASE_URL}`) as unknown as StyleSpecification;
}
