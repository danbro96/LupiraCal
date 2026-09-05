/** Minimal slice of the MapLibre style spec the loader touches. Both renderers consume the document as
 *  opaque JSON; the web widens it to `StyleSpecification` at its own boundary. */
export type BasemapStyle = {
  version: number;
  glyphs?: string;
  sprite?: string;
  sources: Record<string, Record<string, unknown>>;
  layers: unknown[];
};

/** The transport is the one thing the two clients do differently (cookie vs bearer), so it is injected. */
export type FetchLike = (
  url: string,
  headers?: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Root-relative URLs absolute against `origin` — a fetched style has no origin of its own, so glyph,
 *  sprite and tile URLs would otherwise resolve against nothing. Returns the tiles URL to probe, if any. */
export function absolutizeStyle(style: BasemapStyle, origin: string): string | undefined {
  const abs = (url: string) => (url.startsWith('/') ? `${origin}${url}` : url);
  if (typeof style.glyphs === 'string') style.glyphs = abs(style.glyphs);
  if (typeof style.sprite === 'string') style.sprite = abs(style.sprite);
  let pmtilesUrl: string | undefined;
  for (const source of Object.values(style.sources)) {
    const url = source.url;
    if (typeof url === 'string' && url.startsWith('pmtiles://')) {
      pmtilesUrl = abs(url.slice('pmtiles://'.length));
      source.url = `pmtiles://${pmtilesUrl}`;
    }
  }
  return pmtilesUrl;
}

/** style.json serves even when the assets volume isn't provisioned (bundled template), but a missing
 *  sprite or tiles stalls the style load on both renderers. One Range probe on the tiles decides. */
export async function loadBasemapStyle(fetchLike: FetchLike, styleUrl: string, origin: string): Promise<BasemapStyle> {
  const res = await fetchLike(styleUrl);
  if (!res.ok) throw new Error(`Basemap style unavailable (${res.status})`);
  const style = (await res.json()) as BasemapStyle;
  const pmtilesUrl = absolutizeStyle(style, origin);
  if (pmtilesUrl) {
    const probe = await fetchLike(pmtilesUrl, { Range: 'bytes=0-0' });
    if (!probe.ok) throw new Error(`Basemap assets unavailable (${probe.status})`);
  }
  return style;
}

/** Blank fallback when the basemap isn't provisioned — data layers still render on a flat wash. */
export function fallbackStyle(theme: 'light' | 'dark', geoApiBase: string): BasemapStyle {
  return {
    version: 8,
    // Real glyph URL so cluster-count symbol layers stay valid; a 404 just drops the text.
    glyphs: `${geoApiBase}/basemap/fonts/{fontstack}/{range}.pbf`,
    sources: {},
    layers: [{
      id: 'background',
      type: 'background',
      paint: { 'background-color': theme === 'dark' ? '#1a1a19' : '#e8e6e0' },
    }],
  };
}
