import { beforeEach, describe, expect, it, vi } from 'vitest';

const geo = vi.hoisted(() => ({ lookupPlaces: vi.fn() }));
vi.mock('@lupira/cal-api/fetch/geo', () => geo);

const { residencyPlaceModule } = await import('./residencyPlace');

describe('residencyPlaceModule', () => {
  beforeEach(() => {
    geo.lookupPlaces.mockReset().mockImplementation(async ({ ids }: { ids: string[] }) =>
      ids.map((id) => ({ requestedId: id, place: id === 'gone' ? null : { id: id === 'merged' ? 'survivor' : id, name: `Place ${id}` } })));
  });

  it('snapshots the places residencies point at, keyed by the stored id', async () => {
    const module = residencyPlaceModule(async () => ['p1', 'merged', 'gone']);
    const page = await module.feed.fetch(null);

    expect(page).toMatchObject({ reset: true, hasMore: false, deleted: [] });
    expect(page.changed.map((c) => module.feed.fromWire(c))).toEqual([
      { id: 'p1', state: { doc: { id: 'p1', name: 'Place p1' }, guards: null } },
      { id: 'merged', state: { doc: { id: 'survivor', name: 'Place merged' }, guards: null } },
    ]);
  });

  it('asks in batches the lookup accepts, and not at all without residencies', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `p${i}`);
    await residencyPlaceModule(async () => ids).feed.fetch(null);
    expect(geo.lookupPlaces.mock.calls.map(([body]) => body.ids.length)).toEqual([200, 200, 50]);

    geo.lookupPlaces.mockClear();
    expect((await residencyPlaceModule(async () => []).feed.fetch(null)).changed).toEqual([]);
    expect(geo.lookupPlaces).not.toHaveBeenCalled();
  });
});
