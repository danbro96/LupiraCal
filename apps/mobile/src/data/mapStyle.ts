import { fallbackStyle as sharedFallback, loadBasemapStyle, type BasemapStyle, type FetchLike } from '@danbro96/lupira-domain-maps/mapStyle';
import type { MapTheme } from '@danbro96/lupira-tokens-map/map';
import { authPort } from '@danbro96/lupira-http/authPort';
import { apiRequest } from '@danbro96/lupira-http/transport';

export type { BasemapStyle };

const apiOrigin = () => authPort().getApiUrl().replace(/\/$/, '');

/** The document logic is shared with the web; the transport resolves only on success and throws ApiError otherwise. */
const viaTransport: FetchLike = async (url, headers) => {
  const body = await apiRequest<unknown>(url.slice(apiOrigin().length), { headers });
  return { ok: true, status: 200, json: async () => body };
};

export function loadMapStyle(theme: MapTheme): Promise<BasemapStyle> {
  const origin = apiOrigin();
  return loadBasemapStyle(viaTransport, `${origin}/geo-api/basemap/style.json?theme=${theme}`, origin);
}

export function fallbackStyle(theme: MapTheme): BasemapStyle {
  return sharedFallback(theme, `${apiOrigin()}/geo-api`);
}
