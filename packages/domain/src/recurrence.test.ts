import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandRecurrence, parseRecurrenceRule } from './recurrence';

type RecurrenceCase = {
  Name: string;
  Rule: string;
  Start: string;
  WindowStart: string;
  WindowEnd: string;
  Expected: string[];
  TimeZone?: string;
};

const cases = JSON.parse(
  readFileSync(new URL('../test/fixtures/recurrence.json', import.meta.url), 'utf8'),
) as RecurrenceCase[];

describe('expandRecurrence parity with the server expander', () => {
  it.each(cases.map((c) => [c.Name, c] as const))('%s', (_, c) => {
    const actual = expandRecurrence(c.Rule, new Date(c.Start), new Date(c.WindowStart), new Date(c.WindowEnd), c.TimeZone ?? null);
    expect(actual, `rule ${c.Rule} should be in the supported subset`).not.toBeNull();
    expect(actual!.map((d) => d.getTime())).toEqual(c.Expected.map((e) => Date.parse(e)));
  });
});

describe('unsupported rules degrade to null (caller renders first occurrence + flags)', () => {
  it.each([
    ['FREQ=HOURLY', 'sub-daily frequency'],
    ['FREQ=WEEKLY;BYSETPOS=1;BYDAY=MO', 'BYSETPOS'],
    ['FREQ=MONTHLY;BYMONTHDAY=-1', 'negative BYMONTHDAY'],
    ['INTERVAL=2', 'missing FREQ'],
    ['FREQ=DAILY;COUNT=x', 'malformed COUNT'],
  ])('%s (%s)', (rule) => {
    expect(parseRecurrenceRule(rule)).toBeNull();
  });

  it('rejects ordinal BYDAY outside monthly/yearly at expansion', () => {
    const d = new Date('2026-01-05T09:00:00Z');
    expect(expandRecurrence('FREQ=WEEKLY;BYDAY=2TU', d, d, new Date('2026-03-01T00:00:00Z'))).toBeNull();
  });
});

describe('rules that can never match', () => {
  it.each([
    'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30;COUNT=3',
    'FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=31;COUNT=3',
    'FREQ=MONTHLY;BYDAY=6MO;COUNT=3',
    'FREQ=YEARLY;INTERVAL=3;BYMONTH=2;BYMONTHDAY=30',
  ])('%s expands to nothing', (rule) => {
    const d = new Date('2026-01-30T09:00:00Z');
    expect(expandRecurrence(rule, d, d, new Date('2100-01-01T00:00:00Z'))).toEqual([]);
  });

  it('still finds a leap day on a three-yearly rule', () => {
    const d = new Date('2026-02-28T09:00:00Z');
    const leap = expandRecurrence('FREQ=YEARLY;INTERVAL=3;BYMONTH=2;BYMONTHDAY=29;COUNT=1', d, d, new Date('2100-01-01T00:00:00Z'));
    expect(leap?.map((x) => x.toISOString())).toEqual(['2032-02-29T09:00:00.000Z']);
  });
});
