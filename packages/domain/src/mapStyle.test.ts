import { describe, expect, it, vi } from 'vitest';
import { absolutizeStyle, fallbackStyle, loadBasemapStyle, type BasemapStyle, type FetchLike } from './mapStyle';

const ORIGIN = 'http://bff.test';

const style = (over: Partial<BasemapStyle> = {}): BasemapStyle => ({
  version: 8,
  glyphs: '/geo-api/basemap/fonts/{fontstack}/{range}.pbf',
  sprite: '/geo-api/basemap/sprite',
  sources: { basemap: { url: 'pmtiles:///geo-api/basemap/tiles.pmtiles' } },
  layers: [],
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const status = (code: number) => ({ ok: code < 400, status: code, json: () => Promise.resolve(undefined) });

describe('absolutizeStyle', () => {
  it('makes root-relative glyph, sprite and pmtiles URLs absolute and returns the tiles URL', () => {
    const s = style();
    const tiles = absolutizeStyle(s, ORIGIN);
    expect(s.glyphs).toBe(`${ORIGIN}/geo-api/basemap/fonts/{fontstack}/{range}.pbf`);
    expect(s.sprite).toBe(`${ORIGIN}/geo-api/basemap/sprite`);
    expect(s.sources.basemap.url).toBe(`pmtiles://${ORIGIN}/geo-api/basemap/tiles.pmtiles`);
    expect(tiles).toBe(`${ORIGIN}/geo-api/basemap/tiles.pmtiles`);
  });

  it('leaves already-absolute URLs alone and reports no tiles without a pmtiles source', () => {
    const absolute = 'https://cdn.example/sprite';
    const s = style({ sprite: absolute, sources: {} });
    expect(absolutizeStyle(s, ORIGIN)).toBeUndefined();
    expect(s.sprite).toBe(absolute);
  });
});

describe('loadBasemapStyle', () => {
  it('Range-probes the tiles so an unprovisioned volume fails loudly instead of stalling the map', async () => {
    const fetchLike = vi.fn<FetchLike>().mockResolvedValueOnce(ok(style())).mockResolvedValueOnce(status(404));
    await expect(loadBasemapStyle(fetchLike, `${ORIGIN}/style.json`, ORIGIN)).rejects.toThrow(/assets unavailable \(404\)/);
    expect(fetchLike.mock.calls[1]).toEqual([`${ORIGIN}/geo-api/basemap/tiles.pmtiles`, { Range: 'bytes=0-0' }]);
  });

  it('skips the probe when the style declares no pmtiles source', async () => {
    const fetchLike = vi.fn<FetchLike>().mockResolvedValueOnce(ok(style({ sources: {} })));
    await loadBasemapStyle(fetchLike, `${ORIGIN}/style.json`, ORIGIN);
    expect(fetchLike).toHaveBeenCalledTimes(1);
  });

  it('throws when the style itself is unavailable', async () => {
    const fetchLike = vi.fn<FetchLike>().mockResolvedValueOnce(status(503));
    await expect(loadBasemapStyle(fetchLike, `${ORIGIN}/style.json`, ORIGIN)).rejects.toThrow(/style unavailable \(503\)/);
  });
});

describe('fallbackStyle', () => {
  it('keeps a real glyph URL so symbol layers stay valid', () => {
    expect(fallbackStyle('light', `${ORIGIN}/geo-api`).glyphs).toBe(`${ORIGIN}/geo-api/basemap/fonts/{fontstack}/{range}.pbf`);
  });

  it('washes the background per theme', () => {
    const paint = (t: 'light' | 'dark') =>
      (fallbackStyle(t, ORIGIN).layers[0] as { paint: Record<string, string> }).paint['background-color'];
    expect(paint('dark')).not.toBe(paint('light'));
  });
});
