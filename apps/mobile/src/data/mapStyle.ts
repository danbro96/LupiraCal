import { fallbackStyle as sharedFallback, loadBasemapStyle, type BasemapStyle } from '@danbro96/lupira-domain-maps/mapStyle';
import type { MapTheme } from '@danbro96/lupira-tokens-map/map';
import { authPort } from '@danbro96/lupira-http/authPort';

export type { BasemapStyle };

const apiOrigin = () => authPort().getApiUrl().replace(/\/$/, '');

/** The document logic is shared with the web; only the bearer transport is this app's. */
async function authedFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const token = authPort().getToken();
  return fetch(url, { headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers });
}

export function loadMapStyle(theme: MapTheme): Promise<BasemapStyle> {
  const origin = apiOrigin();
  return loadBasemapStyle(authedFetch, `${origin}/geo-api/basemap/style.json?theme=${theme}`, origin);
}

export function fallbackStyle(theme: MapTheme): BasemapStyle {
  return sharedFallback(theme, `${apiOrigin()}/geo-api`);
}
