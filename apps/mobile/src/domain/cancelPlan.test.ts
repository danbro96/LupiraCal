import { describe, expect, it } from 'vitest';
import { cancelPlan } from './cancelPlan';
import type { ItemDoc } from './docTypes';

const weekly = {
  id: 'item-1', title: 'Training', isAllDay: false, startsAt: '2026-08-03T17:00:00Z', endsAt: '2026-08-03T18:00:00Z',
  recurrenceRule: 'FREQ=WEEKLY;COUNT=4', calendars: [{ calendarId: 'cal-1', status: 'Accepted' }],
} as ItemDoc;

describe('cancelPlan', () => {
  it('cancels the whole item for the series scope or without an occurrence', () => {
    expect(cancelPlan(weekly, 'series', '2026-08-10T17:00:00Z')).toEqual({ kind: 'series' });
    expect(cancelPlan(weekly, 'following', null)).toEqual({ kind: 'series' });
  });

  it('cancels one occurrence the series has', () => {
    expect(cancelPlan(weekly, 'this', '2026-08-10T17:00:00Z')).toEqual({ kind: 'occurrence' });
  });

  it('cancels this and following as a cancelled continuation', () => {
    const plan = cancelPlan(weekly, 'following', '2026-08-17T17:00:00Z');
    expect(plan).toMatchObject({ kind: 'following', core: { status: 'Cancelled', startsAt: '2026-08-17T17:00:00Z' } });
  });

  it('cancels the series from its first occurrence', () => {
    expect(cancelPlan(weekly, 'following', '2026-08-03T17:00:00Z')).toEqual({ kind: 'series' });
  });

  it('is gone once the occurrence has left the series', () => {
    expect(cancelPlan(weekly, 'this', '2026-08-31T17:00:00Z')).toEqual({ kind: 'gone' });
    expect(cancelPlan(weekly, 'following', '2026-08-31T17:00:00Z')).toEqual({ kind: 'gone' });
  });
});
