import { describe, expect, it } from 'vitest';
import { daysLeft, fmtBytes, fmtDimensions, fmtDuration, groupByDay, linkedEventIds, photoEventLinks, topPlaces } from './photoFormat';

describe('fmtBytes', () => {
  it('scales through the binary units', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1024)).toBe('1 kB');
    expect(fmtBytes(1536)).toBe('1.5 kB');
    expect(fmtBytes(4.2 * 1024 * 1024)).toBe('4.2 MB');
    expect(fmtBytes(3 * 1024 ** 3)).toBe('3 GB');
  });

  it('drops the decimal once it is noise', () => {
    expect(fmtBytes(742 * 1024)).toBe('742 kB');
  });

  it('handles zero and rejects nonsense', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(-1)).toBe('—');
    expect(fmtBytes(Number.NaN)).toBe('—');
  });
});

describe('fmtDuration', () => {
  it('reads as a clock', () => {
    expect(fmtDuration(9)).toBe('0:09');
    expect(fmtDuration(83)).toBe('1:23');
    expect(fmtDuration(600)).toBe('10:00');
  });

  it('grows an hours field only when needed', () => {
    expect(fmtDuration(3723)).toBe('1:02:03');
    expect(fmtDuration(3599)).toBe('59:59');
  });

  it('rounds fractional seconds and rejects nonsense', () => {
    expect(fmtDuration(12.4)).toBe('0:12');
    expect(fmtDuration(-5)).toBe('—');
    expect(fmtDuration(Number.NaN)).toBe('—');
  });
});

describe('fmtDimensions', () => {
  it('formats a pair and nothing else', () => {
    expect(fmtDimensions(4032, 3024)).toBe('4032 × 3024');
    // An unprocessed asset has no dimensions yet — the caller renders nothing rather than "null × null".
    expect(fmtDimensions(null, 3024)).toBeNull();
    expect(fmtDimensions(undefined, undefined)).toBeNull();
  });
});

describe('groupByDay', () => {
  const at = (iso: string) => ({ takenAt: iso, id: iso });

  it('groups consecutive same-day items and preserves the incoming order', () => {
    const days = groupByDay(
      [at('2026-03-02T18:00:00'), at('2026-03-02T09:00:00'), at('2026-03-01T23:00:00')],
      () => 'label',
    );
    expect(days.map((d) => d.key)).toEqual(['2026-03-02', '2026-03-01']);
    expect(days[0].items.map((i) => i.id)).toEqual(['2026-03-02T18:00:00', '2026-03-02T09:00:00']);
  });

  // The server sorts, so grouping only watches for a change of date — a day that recurs later in
  // the list is a separate group rather than merging backwards.
  it('does not merge a day that reappears after another', () => {
    const days = groupByDay([at('2026-03-02T10:00:00'), at('2026-03-01T10:00:00'), at('2026-03-02T08:00:00')], () => 'l');
    expect(days.map((d) => d.key)).toEqual(['2026-03-02', '2026-03-01', '2026-03-02']);
  });

  it('takes its label from the caller', () => {
    const days = groupByDay([at('2026-03-02T10:00:00')], (d) => `day ${d.getDate()}`);
    expect(days[0].label).toBe('day 2');
  });
});

describe('photoEventLinks', () => {
  it('collects every calendar item linked to a photo', () => {
    const links = photoEventLinks([
      { toRef: 'p1', fromId: 'i1' },
      { toRef: 'p2', fromId: 'i2' },
      { toRef: 'p1', fromId: 'i3' },
    ]);
    expect(links.get('p1')).toEqual(['i1', 'i3']);
    expect(links.get('p2')).toEqual(['i2']);
    expect(links.has('p3')).toBe(false);
  });
});

describe('topPlaces', () => {
  it('ranks by photo count and keeps first-seen order on ties', () => {
    const items = [{ placeLabel: 'Visby' }, { placeLabel: 'Fårö' }, { placeLabel: 'Fårö' }, { placeLabel: null }, { placeLabel: 'Slite' }];
    expect(topPlaces(items, 2)).toEqual(['Fårö', 'Visby']);
    expect(topPlaces([], 2)).toEqual([]);
  });
});

describe('linkedEventIds', () => {
  it('collects distinct events across the photos', () => {
    const links = new Map([['p1', ['e1']], ['p2', ['e1', 'e2']]]);
    expect(linkedEventIds(['p1', 'p2', 'p3'], links)).toEqual(['e1', 'e2']);
  });
});

describe('daysLeft', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  it('rounds a partial day up and floors at zero', () => {
    expect(daysLeft('2026-09-30T13:00:00Z', now)).toBe(3);
    expect(daysLeft('2026-09-28T12:00:01Z', now)).toBe(1);
    expect(daysLeft('2026-09-27T00:00:00Z', now)).toBe(0);
  });
});
