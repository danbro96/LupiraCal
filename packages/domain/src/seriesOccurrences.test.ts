import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  allDayKey,
  applyOccurrenceChange,
  continuationId,
  continuedParticipationId,
  expandSeries,
  followDeviations,
  instantList,
  isFirstOccurrence,
  occurrenceEdit,
  occurrenceKey,
  occurrenceScopes,
  occurrenceView,
  seriesDeviationRows,
  splitSeries,
  type OccurrenceChange,
  type OccurrenceStatus,
  type SeriesItem,
  type SeriesShape,
} from './seriesOccurrences';

type WireChange = {
  OriginalStart: string;
  StartsAt?: string;
  EndsAt?: string;
  Title?: string;
  Description?: string;
  Status?: number;
  LocationLabel?: string;
};

type WireSeries = {
  IsAllDay: boolean;
  StartsAt?: string;
  EndsAt?: string;
  StartDate?: string;
  EndDate?: string;
  StartTimezone?: string;
  RecurrenceRule?: string;
  ExcludedOccurrences?: string[];
  ExtraOccurrences?: string[];
  OccurrenceOverrides?: WireChange[];
};

type SeriesCase = {
  Name: string;
  Item: WireSeries;
  WindowStart: string;
  WindowEnd: string;
  Expected: { OriginalStart: string; Start: string; Change?: WireChange }[];
};

type FollowCase = {
  Name: string;
  Before: WireSeries;
  After: WireSeries;
  ExpectedRule?: string;
  ExpectedExcluded?: string[];
  ExpectedOverrides?: WireChange[];
};

type SplitCase = {
  Name: string;
  Item: WireSeries;
  At: string;
  Earlier?: WireSeries;
  Following?: WireSeries;
  SourceKey: string;
  ContinuationId: string;
  ParticipationId: string;
  ContinuedParticipationId: string;
};

const load = <T,>(name: string) => JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8')) as T[];

const STATUSES: OccurrenceStatus[] = ['Tentative', 'Confirmed', 'Cancelled'];

const change = (c: WireChange): OccurrenceChange => ({
  originalStart: c.OriginalStart,
  startsAt: c.StartsAt ?? null,
  endsAt: c.EndsAt ?? null,
  title: c.Title ?? null,
  description: c.Description ?? null,
  status: c.Status === undefined ? null : STATUSES[c.Status],
  locationLabel: c.LocationLabel ?? null,
});

const series = (w: WireSeries): SeriesShape => ({
  isAllDay: w.IsAllDay,
  startsAt: w.StartsAt ?? null,
  endsAt: w.EndsAt ?? null,
  startDate: w.StartDate ?? null,
  endDate: w.EndDate ?? null,
  startTimezone: w.StartTimezone ?? null,
  recurrenceRule: w.RecurrenceRule ?? null,
  excludedOccurrences: w.ExcludedOccurrences ?? null,
  extraOccurrences: w.ExtraOccurrences ?? null,
  occurrenceOverrides: w.OccurrenceOverrides?.map(change) ?? null,
});

const instant = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
const instants = (list: readonly string[] | null | undefined) => (list ?? []).map((s) => Date.parse(s));
const comparableChange = (c: OccurrenceChange) => ({
  originalStart: instant(c.originalStart),
  startsAt: instant(c.startsAt),
  endsAt: instant(c.endsAt),
  title: c.title ?? null,
  description: c.description ?? null,
  status: c.status ?? null,
});
const comparable = (s: SeriesShape) => ({
  isAllDay: s.isAllDay,
  startsAt: instant(s.startsAt),
  endsAt: instant(s.endsAt),
  startDate: s.startDate ?? null,
  endDate: s.endDate ?? null,
  startTimezone: s.startTimezone ?? null,
  recurrenceRule: s.recurrenceRule ?? null,
  excluded: instants(s.excludedOccurrences),
  extra: instants(s.extraOccurrences),
  overrides: (s.occurrenceOverrides ?? []).map(comparableChange),
});

describe('expandSeries parity with the server', () => {
  it.each(load<SeriesCase>('series.json').map((c) => [c.Name, c] as const))('%s', (_, c) => {
    const actual = expandSeries(series(c.Item), new Date(c.WindowStart), new Date(c.WindowEnd));
    expect(actual.map((o) => ({ originalStart: instant(o.originalStart), start: instant(o.start), change: o.change && comparableChange(o.change) }))).toEqual(
      c.Expected.map((e) => ({ originalStart: instant(e.OriginalStart), start: instant(e.Start), change: e.Change ? comparableChange(change(e.Change)) : null })),
    );
  });
});

describe('followDeviations parity with the server', () => {
  it.each(load<FollowCase>('series-follow.json').map((c) => [c.Name, c] as const))('%s', (_, c) => {
    const actual = followDeviations(series(c.Before), series(c.After));
    expect(actual.recurrenceRule).toBe(c.ExpectedRule ?? null);
    expect(instants(actual.excludedOccurrences)).toEqual(instants(c.ExpectedExcluded));
    expect((actual.occurrenceOverrides ?? []).map(comparableChange)).toEqual((c.ExpectedOverrides ?? []).map((o) => comparableChange(change(o))));
  });
});

describe('splitSeries parity with the server', () => {
  it.each(load<SplitCase>('split.json').map((c) => [c.Name, c] as const))('%s', (_, c) => {
    const actual = splitSeries(series(c.Item), c.At);
    if (!c.Earlier || !c.Following) {
      expect(actual).toBeNull();
    } else {
      expect(actual).not.toBeNull();
      expect(comparable(actual!.earlier)).toEqual(comparable(series(c.Earlier)));
      expect(comparable(actual!.following)).toEqual(comparable(series(c.Following)));
    }
    expect(continuationId(c.SourceKey)).toBe(c.ContinuationId);
    expect(continuedParticipationId(c.ContinuationId, c.ParticipationId)).toBe(c.ContinuedParticipationId);
  });

  it('the parts together have the series\' occurrences', () => {
    const c = load<SplitCase>('split.json').find((x) => x.Name === 'deviations-go-with-their-part')!;
    const item = series(c.Item);
    const split = splitSeries(item, c.At)!;
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-09-01T00:00:00Z');
    const keys = (s: SeriesShape) => expandSeries(s, from, to).map((o) => `${instant(o.originalStart)}>${instant(o.start)}`);
    expect([...keys(split.earlier), ...keys(split.following)].sort()).toEqual(keys(item).sort());
  });
});

const weekly: SeriesItem = {
  isAllDay: false,
  startsAt: '2026-07-06T09:00:00+00:00',
  endsAt: '2026-07-06T11:00:00+00:00',
  startTimezone: 'UTC',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
  title: 'Class',
  description: null,
  status: 'Confirmed',
};

describe('occurrence keys', () => {
  it('canonicalises to UTC whole seconds with Z', () => {
    expect(occurrenceKey('2026-07-06T11:00:00+02:00')).toBe('2026-07-06T09:00:00Z');
    expect(occurrenceKey('2026-07-06T09:00:00.000Z')).toBe('2026-07-06T09:00:00Z');
    expect(allDayKey('2026-07-04')).toBe('2026-07-04T00:00:00Z');
  });

  it('reads wire lists, empty as null', () => {
    expect(instantList(['2026-07-06T09:00:00+00:00', 'nope'])).toEqual(['2026-07-06T09:00:00Z']);
    expect(instantList([])).toBeNull();
    expect(instantList(undefined)).toBeNull();
  });
});

describe('scopes', () => {
  it('offers following only from a later rule occurrence', () => {
    expect(occurrenceScopes(weekly, '2026-07-06T09:00:00Z')).toEqual(['this', 'series']);
    expect(occurrenceScopes(weekly, '2026-07-13T09:00:00Z')).toEqual(['this', 'following', 'series']);
    expect(occurrenceScopes({ ...weekly, extraOccurrences: ['2026-07-15T12:00:00Z'] }, '2026-07-15T12:00:00Z')).toEqual(['this', 'series']);
    expect(occurrenceScopes(weekly, '2026-07-14T09:00:00Z')).toEqual(['series']);
    expect(occurrenceScopes({ ...weekly, recurrenceRule: null }, null)).toEqual(['series']);
    expect(isFirstOccurrence(weekly, '2026-07-06T09:00:00+00:00')).toBe(true);
  });
});

describe('occurrence views and edits', () => {
  const moved: SeriesItem = {
    ...weekly,
    occurrenceOverrides: [{ originalStart: '2026-07-13T09:00:00+00:00', startsAt: '2026-07-13T10:00:00+00:00', title: 'Moved', locationLabel: 'Hall' }],
  };

  it('reads an occurrence with its change', () => {
    expect(occurrenceView(moved, '2026-07-13T09:00:00Z')).toMatchObject({
      start: '2026-07-13T10:00:00Z', end: '2026-07-13T12:00:00Z', title: 'Moved', status: 'Confirmed', excluded: false,
    });
    expect(occurrenceView(weekly, '2026-07-14T09:00:00Z')).toBeNull();
  });

  it('merges a patch into the existing change and keeps its place label', () => {
    expect(occurrenceEdit(moved, '2026-07-13T09:00:00Z', { description: 'Bring shoes' })).toEqual({
      kind: 'change',
      change: {
        originalStart: '2026-07-13T09:00:00Z', startsAt: '2026-07-13T10:00:00Z', endsAt: null, title: 'Moved',
        description: 'Bring shoes', status: null, locationLabel: 'Hall',
      },
    });
  });

  it('drops members equal to the series and restores when nothing is left', () => {
    expect(occurrenceEdit(moved, '2026-07-13T09:00:00Z', { startsAt: '2026-07-13T09:00:00Z', title: 'Class' })).toEqual({ kind: 'restore' });
    expect(occurrenceEdit(weekly, '2026-07-20T09:00:00Z', { startsAt: '2026-07-20T10:00:00Z', endsAt: '2026-07-20T12:00:00Z' })).toMatchObject({
      kind: 'change', change: { startsAt: '2026-07-20T10:00:00Z', endsAt: null },
    });
  });

  it('applies an exclusion, a change and a restore like the server', () => {
    const excluded = applyOccurrenceChange(moved, '2026-07-13T09:00:00Z', { kind: 'exclude' });
    expect(excluded).toEqual({ excludedOccurrences: ['2026-07-13T09:00:00Z'], occurrenceOverrides: null });
    const changed = applyOccurrenceChange({ ...weekly, ...excluded }, '2026-07-13T09:00:00Z', {
      kind: 'change', change: { originalStart: '2026-07-13T09:00:00Z', status: 'Cancelled' },
    });
    expect(changed).toEqual({ excludedOccurrences: null, occurrenceOverrides: [{ originalStart: '2026-07-13T09:00:00Z', status: 'Cancelled' }] });
    expect(seriesDeviationRows({ ...weekly, ...changed })).toEqual([
      { originalStart: '2026-07-13T09:00:00Z', kind: 'cancelled', change: { originalStart: '2026-07-13T09:00:00Z', status: 'Cancelled' } },
    ]);
    expect(applyOccurrenceChange({ ...weekly, ...changed }, '2026-07-13T09:00:00Z', { kind: 'restore' })).toEqual({
      excludedOccurrences: null, occurrenceOverrides: null,
    });
  });
});
