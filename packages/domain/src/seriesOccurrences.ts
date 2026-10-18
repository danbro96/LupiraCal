// Twin of cal-api's series rules, pinned to the server by test/fixtures/{series,series-follow,split}.json.
// An occurrence is identified by its start in the unmodified series (UTC; all-day at 00:00Z).

import { deterministicGuid } from './deterministicGuid';
import { expandRecurrence } from './recurrence';
import { fromWallMs, isValidTimeZone, toWallMs } from './zonedTime';

export type OccurrenceStatus = 'Tentative' | 'Confirmed' | 'Cancelled';

/** A change to one occurrence, keyed by its unmodified start. Null members inherit from the series; an all-day
 *  occurrence's times are dates at 00:00Z and its `endsAt` is the inclusive last day. */
export type OccurrenceChange = {
  originalStart: string;
  startsAt?: string | null;
  endsAt?: string | null;
  title?: string | null;
  description?: string | null;
  status?: OccurrenceStatus | null;
  locationLabel?: string | null;
};

/** What places a series' occurrences, and its per-occurrence deviations — the item's fields of the same names. */
export type SeriesShape = {
  isAllDay: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTimezone?: string | null;
  recurrenceRule?: string | null;
  excludedOccurrences?: readonly string[] | null;
  extraOccurrences?: readonly string[] | null;
  occurrenceOverrides?: readonly OccurrenceChange[] | null;
};

export type SeriesItem = SeriesShape & {
  title?: string | null;
  description?: string | null;
  status?: OccurrenceStatus | null;
};

export type SeriesOccurrence = { originalStart: string; start: string; change: OccurrenceChange | null };

export type OccurrenceScope = 'this' | 'following' | 'series';

export type OccurrenceEdit =
  | { kind: 'exclude' }
  | { kind: 'change'; change: OccurrenceChange }
  | { kind: 'restore' };

export type OccurrencePatch = Partial<Pick<OccurrenceChange, 'startsAt' | 'endsAt' | 'title' | 'description' | 'status'>>;

export type SeriesDeviations = {
  excludedOccurrences: string[] | null;
  occurrenceOverrides: OccurrenceChange[] | null;
};

export type OccurrenceView = {
  originalStart: string;
  start: string;
  /** Timed: the exclusive end instant; all-day: the inclusive last day at 00:00Z. */
  end: string | null;
  title: string | null;
  description: string | null;
  status: OccurrenceStatus | null;
  change: OccurrenceChange | null;
  excluded: boolean;
};

export type SeriesDeviationRow = {
  originalStart: string;
  kind: 'excluded' | 'cancelled' | 'changed';
  change: OccurrenceChange | null;
};

export type SeriesPart = Required<Omit<SeriesShape, 'excludedOccurrences' | 'extraOccurrences' | 'occurrenceOverrides'>> & {
  excludedOccurrences: string[] | null;
  extraOccurrences: string[] | null;
  occurrenceOverrides: OccurrenceChange[] | null;
};

export type SeriesSplit = { earlier: SeriesPart; following: SeriesPart };

/** An occurrence's identity in canonical form (UTC, whole seconds, `Z`) — for URLs, path parameters and keys. */
export function occurrenceKey(instant: string | number | Date): string {
  return new Date(typeof instant === 'string' ? Date.parse(instant) : instant).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The key of an all-day occurrence on `day` ('yyyy-MM-dd'). */
export function allDayKey(day: string): string {
  return `${day}T00:00:00Z`;
}

/** A wire list of instants as occurrence keys, in order; empty or absent = null. */
export function instantList(values: readonly unknown[] | null | undefined): string[] | null {
  const keys = (values ?? []).flatMap((v) => {
    const t = typeof v === 'string' ? Date.parse(v) : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : NaN;
    return Number.isNaN(t) ? [] : [occurrenceKey(t)];
  });
  return keys.length > 0 ? keys : null;
}

const MIN_MS = -8.64e15;
const MAX_MS = 8.64e15;
const DAY_MS = 86_400_000;

const ms = (iso: string) => Date.parse(iso);
const msList = (values: readonly string[] | null | undefined) => (values ?? []).map(ms);
const recurs = (s: SeriesShape) => !!s.recurrenceRule?.trim();
const orNull = <T>(xs: T[]) => (xs.length > 0 ? xs : null);

type Anchor = { at: number; zone: string | null };

function anchorOf(s: SeriesShape): Anchor | null {
  if (s.isAllDay) return s.startDate ? { at: ms(`${s.startDate}T00:00:00Z`), zone: null } : null;
  if (!s.startsAt) return null;
  return { at: ms(s.startsAt), zone: isValidTimeZone(s.startTimezone) && s.startTimezone !== 'UTC' ? s.startTimezone : null };
}

function starts(s: SeriesShape, from: number, to: number, limit?: number): number[] {
  const anchor = anchorOf(s);
  if (!anchor) return [];
  const anchorOnly = anchor.at >= from && anchor.at < to ? [anchor.at] : [];
  if (!recurs(s)) return anchorOnly;
  const expanded = expandRecurrence(s.recurrenceRule!, new Date(anchor.at), new Date(from), new Date(to), anchor.zone, limit);
  return expanded ? expanded.map((d) => d.getTime()) : anchorOnly;
}

const generates = (s: SeriesShape, t: number) => starts(s, t, t + 1).length > 0;

const firstStart = (s: SeriesShape): number | null => starts(s, MIN_MS, MAX_MS, 1)[0] ?? null;

function lastStartBefore(s: SeriesShape, at: number): number | null {
  const anchor = anchorOf(s);
  if (!anchor) return null;
  for (let span = DAY_MS; ; span *= 2) {
    const found = starts(s, at - span, at);
    if (found.length > 0) return found[found.length - 1];
    if (at - span <= anchor.at) return null;
  }
}

function changesOf(s: SeriesShape): Map<number, OccurrenceChange> {
  const changes = new Map<number, OccurrenceChange>();
  for (const c of s.occurrenceOverrides ?? []) if (!changes.has(ms(c.originalStart))) changes.set(ms(c.originalStart), c);
  return changes;
}

/** The occurrences starting in [windowStart, windowEnd), ordered by start: the series' starts and its extra ones less
 *  the excluded, each with its change. Cancelled ones are left out; two that start together both stay. */
export function expandSeries(item: SeriesShape, windowStart: Date, windowEnd: Date): SeriesOccurrence[] {
  const from = windowStart.getTime();
  const to = windowEnd.getTime();
  if (to <= from) return [];
  const inWindow = (t: number) => t >= from && t < to;
  const extras = msList(item.extraOccurrences);
  const changes = changesOf(item);
  const originals = new Set(starts(item, from, to));
  for (const e of extras) if (inWindow(e)) originals.add(e);
  for (const [key, c] of changes)
    if (!inWindow(key) && c.startsAt && inWindow(ms(c.startsAt)) && (extras.includes(key) || generates(item, key))) originals.add(key);
  for (const x of msList(item.excludedOccurrences)) originals.delete(x);

  return [...originals]
    .map((original) => {
      const change = changes.get(original) ?? null;
      return { original, start: change?.startsAt ? ms(change.startsAt) : original, change };
    })
    .filter((o) => o.change?.status !== 'Cancelled' && inWindow(o.start))
    .sort((a, b) => a.start - b.start || a.original - b.original)
    .map((o) => ({ originalStart: occurrenceKey(o.original), start: occurrenceKey(o.start), change: o.change }));
}

/** Whether the unmodified series (or one of its extra occurrences) starts an occurrence at `originalStart`. */
export function hasSeriesOccurrence(item: SeriesShape, originalStart: string): boolean {
  const at = ms(originalStart);
  return msList(item.extraOccurrences).includes(at) || generates(item, at);
}

export function overrideFor(item: SeriesShape, originalStart: string): OccurrenceChange | null {
  return changesOf(item).get(ms(originalStart)) ?? null;
}

/** Whether `originalStart` is the first of the series' rule occurrences — where "this and following" is the whole series. */
export function isFirstOccurrence(item: SeriesShape, originalStart: string): boolean {
  const at = ms(originalStart);
  return recurs(item) && generates(item, at) && firstStart(item) === at;
}

/** The scopes an edit of this occurrence can take: "this and following" only from a later rule occurrence. */
export function occurrenceScopes(item: SeriesShape, originalStart: string | null | undefined): OccurrenceScope[] {
  if (!originalStart || !recurs(item) || !hasSeriesOccurrence(item, originalStart)) return ['series'];
  return generates(item, ms(originalStart)) && !isFirstOccurrence(item, originalStart) ? ['this', 'following', 'series'] : ['this', 'series'];
}

function seriesLength(item: SeriesShape): number | null {
  if (item.startsAt && item.endsAt) return ms(item.endsAt) - ms(item.startsAt);
  if (item.isAllDay && item.startDate && item.endDate) return ms(`${item.endDate}T00:00:00Z`) - ms(`${item.startDate}T00:00:00Z`);
  return null;
}

/** One occurrence as it reads now: the series with its change applied. Null when the series has no such occurrence. */
export function occurrenceView(item: SeriesItem, originalStart: string): OccurrenceView | null {
  if (!hasSeriesOccurrence(item, originalStart)) return null;
  const change = overrideFor(item, originalStart);
  const start = change?.startsAt ? ms(change.startsAt) : ms(originalStart);
  const length = seriesLength(item);
  return {
    originalStart: occurrenceKey(originalStart),
    start: occurrenceKey(start),
    end: change?.endsAt ? occurrenceKey(change.endsAt) : length !== null ? occurrenceKey(start + length) : null,
    title: change?.title ?? item.title ?? null,
    description: change?.description ?? item.description ?? null,
    status: change?.status ?? item.status ?? null,
    change,
    excluded: msList(item.excludedOccurrences).includes(ms(originalStart)),
  };
}

/** The series' deviations after one occurrence is excluded, changed or restored; a change replaces its previous one. */
export function applyOccurrenceChange(item: SeriesShape, originalStart: string, edit: OccurrenceEdit): SeriesDeviations {
  const at = ms(originalStart);
  const excluded = msList(item.excludedOccurrences).filter((t) => t !== at);
  if (edit.kind === 'exclude') excluded.push(at);
  const overrides = (item.occurrenceOverrides ?? []).filter((o) => ms(o.originalStart) !== at);
  if (edit.kind === 'change') overrides.push({ ...edit.change, originalStart: occurrenceKey(at) });
  return {
    excludedOccurrences: orNull(excluded.sort((a, b) => a - b).map(occurrenceKey)),
    occurrenceOverrides: orNull(overrides.sort((a, b) => ms(a.originalStart) - ms(b.originalStart))),
  };
}

/** The edit that applies `patch` to one occurrence on top of its existing change (a change replaces the previous
 *  one whole). Members equal to the series inherit; nothing left is a restore. */
export function occurrenceEdit(item: SeriesItem, originalStart: string, patch: OccurrencePatch): OccurrenceEdit {
  const existing = overrideFor(item, originalStart);
  const pick = <K extends keyof OccurrencePatch>(k: K) => (k in patch ? patch[k] : existing?.[k]) ?? null;
  const original = ms(originalStart);
  const startsAt = pick('startsAt');
  const start = startsAt ? ms(startsAt) : original;
  const endsAt = pick('endsAt');
  const length = seriesLength(item);
  const title = pick('title');
  const description = pick('description');
  const status = pick('status');
  const change: OccurrenceChange = {
    originalStart: occurrenceKey(original),
    startsAt: startsAt && start !== original ? occurrenceKey(start) : null,
    endsAt: endsAt && !(length !== null && ms(endsAt) === start + length) ? occurrenceKey(endsAt) : null,
    title: title !== (item.title ?? null) ? title : null,
    description: description !== (item.description ?? null) ? description : null,
    status: status !== (item.status ?? null) ? status : null,
    locationLabel: existing?.locationLabel ?? null,
  };
  const changesSomething = change.startsAt || change.endsAt || change.title !== null || change.description !== null || change.status;
  return changesSomething ? { kind: 'change', change } : { kind: 'restore' };
}

/** The series' excluded, cancelled and changed occurrences, ordered by their unmodified start. */
export function seriesDeviationRows(item: SeriesShape): SeriesDeviationRow[] {
  const rows: SeriesDeviationRow[] = [
    ...msList(item.excludedOccurrences).map((t): SeriesDeviationRow => ({ originalStart: occurrenceKey(t), kind: 'excluded', change: null })),
    ...(item.occurrenceOverrides ?? []).map((c): SeriesDeviationRow => ({
      originalStart: occurrenceKey(c.originalStart), kind: c.status === 'Cancelled' ? 'cancelled' : 'changed', change: c,
    })),
  ];
  return rows.sort((a, b) => ms(a.originalStart) - ms(b.originalStart));
}

type Shift = { from: string | null; to: string | null; by: number };

const wallOf = (t: number, zone: string | null) => (zone ? toWallMs(t, zone) : t);
const instantOf = (wall: number, zone: string | null) => (zone ? fromWallMs(wall, zone) : wall);

function shiftBetween(before: SeriesShape, after: SeriesShape): Shift | null {
  const a = anchorOf(before);
  const b = anchorOf(after);
  return a && b ? { from: a.zone, to: b.zone, by: wallOf(b.at, b.zone) - wallOf(a.at, a.zone) } : null;
}

const shifted = (shift: Shift, t: number) => instantOf(wallOf(t, shift.from) + shift.by, shift.to);

function sameSeries(a: SeriesShape, b: SeriesShape): boolean {
  const at = (s?: string | null) => (s ? ms(s) : null);
  return a.isAllDay === b.isAllDay && at(a.startsAt) === at(b.startsAt) && (a.startDate ?? null) === (b.startDate ?? null)
    && (a.startTimezone ?? null) === (b.startTimezone ?? null) && (a.recurrenceRule ?? null) === (b.recurrenceRule ?? null);
}

/** Rule and deviations after the series moves: an unchanged bounded rule keeps its last occurrence, and each deviation
 *  follows its occurrence while the moved series still has it (extra-keyed ones stay put). */
export function followDeviations(before: SeriesShape, after: SeriesShape): { recurrenceRule: string | null } & SeriesDeviations {
  const shift = shiftBetween(before, after);
  const rule = after.recurrenceRule ?? null;
  const recurrenceRule = rule && recurs(after) && rule === before.recurrenceRule && shift && !sameSeries(before, after)
    ? shiftedRule(rule, shift)
    : rule;
  const moved: SeriesShape = { ...after, recurrenceRule };
  const deviations: SeriesDeviations = {
    excludedOccurrences: instantList(before.excludedOccurrences),
    occurrenceOverrides: before.occurrenceOverrides ? orNull([...before.occurrenceOverrides]) : null,
  };
  if (sameSeries(before, moved) || (!before.excludedOccurrences && !before.occurrenceOverrides)) return { recurrenceRule, ...deviations };
  if (!recurs(moved) || !shift) return { recurrenceRule, excludedOccurrences: null, occurrenceOverrides: null };

  const extras = msList(before.extraOccurrences);
  const rekey = (original: number): number | null => {
    if (extras.includes(original)) return original;
    const t = shifted(shift, original);
    return generates(moved, t) ? t : null;
  };
  const excluded = [...new Set(msList(before.excludedOccurrences).map(rekey).filter((t): t is number => t !== null))].sort((a, b) => a - b);
  const seen = new Set<number>();
  const overrides = (before.occurrenceOverrides ?? [])
    .flatMap((o) => {
      const key = rekey(ms(o.originalStart));
      if (key === null || seen.has(key)) return [];
      seen.add(key);
      return [{ ...o, originalStart: occurrenceKey(key) }];
    })
    .sort((a, b) => ms(a.originalStart) - ms(b.originalStart));
  return { recurrenceRule, excludedOccurrences: orNull(excluded.map(occurrenceKey)), occurrenceOverrides: orNull(overrides) };
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function formatWall(t: number): string {
  const d = new Date(t);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

const formatDate = (t: number) => formatWall(t).slice(0, 8);

function parseWall(text: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(text);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

function parseDate(text: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

const named = (part: string, name: string) => part.split('=')[0].trim().toUpperCase() === name;

function rulePart(rule: string, name: string): string | null {
  const part = rule.split(';').find((p) => p.includes('=') && named(p, name));
  return part ? part.slice(part.indexOf('=') + 1).trim() : null;
}

function withPart(rule: string, name: 'COUNT' | 'UNTIL', value: string): string {
  const other = name === 'COUNT' ? 'UNTIL' : 'COUNT';
  const parts = rule.split(';').filter((p) => !named(p, other));
  const at = parts.findIndex((p) => named(p, name));
  if (at >= 0) parts[at] = `${name}=${value}`;
  else parts.push(`${name}=${value}`);
  return parts.join(';');
}

function ruleCount(rule: string): number | null {
  const value = rulePart(rule, 'COUNT');
  return value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

function shiftedRule(rule: string, shift: Shift): string {
  const until = rulePart(rule, 'UNTIL');
  if (until === null) return rule;
  const utc = until.endsWith('Z') ? parseWall(until.slice(0, -1)) : null;
  if (utc !== null) return withPart(rule, 'UNTIL', `${formatWall(shifted(shift, utc))}Z`);
  const wall = parseWall(until);
  if (wall !== null) return withPart(rule, 'UNTIL', formatWall(wall + shift.by));
  const date = parseDate(until);
  if (date !== null) return withPart(rule, 'UNTIL', formatDate(date + shift.by));
  return rule;
}

/** The rules of a series cut at `originalStart`: the earlier part's ending before it, the following part's taking the
 *  rest. Null unless `originalStart` is one of the rule's occurrences after its first. */
export function capRule(item: SeriesShape, originalStart: string): { earlier: string; following: string } | null {
  const at = ms(originalStart);
  if (!recurs(item) || !generates(item, at) || isFirstOccurrence(item, originalStart)) return null;
  const rule = item.recurrenceRule!;
  const count = ruleCount(rule);
  if (count !== null) {
    const earlier = starts(item, MIN_MS, at, count).length;
    return { earlier: withPart(rule, 'COUNT', String(earlier)), following: withPart(rule, 'COUNT', String(count - earlier)) };
  }
  const last = lastStartBefore(item, at);
  if (last === null) return null;
  const roundedUp = Math.ceil(last / 1000) * 1000;
  return { earlier: withPart(rule, 'UNTIL', item.isAllDay ? formatDate(last) : `${formatWall(roundedUp)}Z`), following: rule };
}

/** The series cut at a rule occurrence after the first; deviations go with the part their unmodified start falls in. */
export function splitSeries(item: SeriesShape, originalStart: string): SeriesSplit | null {
  const rules = capRule(item, originalStart);
  if (!rules) return null;
  const at = ms(originalStart);
  const before = (t: number) => t < at;
  const part = (keep: (t: number) => boolean) => ({
    excludedOccurrences: orNull(msList(item.excludedOccurrences).filter(keep).map(occurrenceKey)),
    extraOccurrences: orNull(msList(item.extraOccurrences).filter(keep).map(occurrenceKey)),
    occurrenceOverrides: orNull((item.occurrenceOverrides ?? []).filter((o) => keep(ms(o.originalStart)))),
  });
  const series = {
    isAllDay: item.isAllDay,
    startsAt: item.startsAt ?? null,
    endsAt: item.endsAt ?? null,
    startDate: item.startDate ?? null,
    endDate: item.endDate ?? null,
    startTimezone: item.startTimezone ?? null,
  };
  const day = occurrenceKey(at).slice(0, 10);
  const following = item.isAllDay
    ? {
      ...series,
      startDate: day,
      endsAt: null,
      endDate: item.endDate && item.startDate ? occurrenceKey(ms(`${day}T00:00:00Z`) + ms(`${item.endDate}T00:00:00Z`) - ms(`${item.startDate}T00:00:00Z`)).slice(0, 10) : null,
    }
    : {
      ...series,
      startsAt: occurrenceKey(at),
      endsAt: item.startsAt && item.endsAt ? occurrenceKey(at + ms(item.endsAt) - ms(item.startsAt)) : null,
    };
  return {
    earlier: { ...series, recurrenceRule: rules.earlier, ...part(before) },
    following: { ...following, recurrenceRule: rules.following, ...part((t) => !before(t)) },
  };
}

/** The series that "this and following" from `originalStart` would continue as: its own fields, not the occurrence's
 *  change. Null where nothing precedes it. */
export function followingSeriesOf<T extends SeriesShape>(item: T, originalStart: string): T | null {
  const parts = splitSeries(item, originalStart);
  return parts ? { ...item, ...parts.following } : null;
}

/** The id the series continuing a split gets for `sourceKey`, so an offline client knows it up front. */
export function continuationId(sourceKey: string): string {
  return deterministicGuid(sourceKey.trim());
}

/** The id an attendee's participation gets on the series continuing its item. */
export function continuedParticipationId(continuation: string, participationId: string): string {
  return deterministicGuid(`participation:${continuation.toLowerCase()}:${participationId.toLowerCase()}`);
}
