import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authPort, setAuthPort } from '@danbro96/lupira-http/authPort';
import { createBearerMutator } from '@danbro96/lupira-http/mutator';
import { setApiTransport } from '@danbro96/lupira-http/transport';
import { fallbackStyle, loadMapStyle, type BasemapStyle } from './mapStyle';

const ORIGIN = 'http://10.0.2.2:5181';

setAuthPort({
  getApiUrl: () => `${ORIGIN}/`, // trailing slash: the loader must not emit '//geo-api'
  getToken: () => 'tok',
  refresh: async () => 'tok',
  onSignIn: () => () => {},
});
setApiTransport(createBearerMutator({ auth: authPort, timeoutMs: 1_000 }));

const style: BasemapStyle = {
  version: 8,
  glyphs: '/geo-api/basemap/fonts/{fontstack}/{range}.pbf',
  sources: { basemap: { url: 'pmtiles:///geo-api/basemap/tiles.pmtiles' } },
  layers: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

// The document handling is @danbro96/lupira-domain-maps/mapStyle's and tested there; this covers the wiring.
describe('loadMapStyle', () => {
  it('sends the bearer on both requests through the shared transport, against the normalized origin', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(style), { status: 200 }))
      .mockResolvedValueOnce(new Response('x', { status: 206 }));

    const out = await loadMapStyle('dark');

    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/geo-api/basemap/style.json?theme=dark`);
    expect(out.glyphs).toBe(`${ORIGIN}/geo-api/basemap/fonts/{fontstack}/{range}.pbf`);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    }
  });
});

describe('fallbackStyle', () => {
  it('points glyphs at this origin\'s geo-api mount', () => {
    expect(fallbackStyle('light').glyphs).toBe(`${ORIGIN}/geo-api/basemap/fonts/{fontstack}/{range}.pbf`);
  });
});
