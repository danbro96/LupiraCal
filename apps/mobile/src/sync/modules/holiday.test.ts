import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { HolidaySyncDto } from '@lupira/cal-api/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { holidayModule } from './holiday';

const holiday = (id: string, dates: string[], over: Partial<HolidaySyncDto> = {}): HolidaySyncDto =>
  ({ id, name: `Holiday ${id}`, kind: 'PublicHoliday', calendarIds: ['hol'], dates, ...over });

let db: Db;
let snapshot: HolidaySyncDto[];

const module = {
  ...holidayModule,
  feed: { ...holidayModule.feed, fetch: async () => ({ cursor: '', hasMore: false, reset: true, changed: snapshot, deleted: [] }) },
};

const rows = () => db.all<{ holiday_id: string; start_day: string }>(
  'SELECT holiday_id, calendar_ids, start_utc, start_day, title, kind FROM holiday_occurrences ORDER BY holiday_id, start_utc',
);

beforeEach(() => {
  db = openNodeDb();
});

describe('holiday module', () => {
  it('indexes each date at UTC midnight on its own day', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    snapshot = [holiday('jul', ['2026-12-25', '2027-12-25'], { name: 'Juldagen' }), holiday('eve', ['2026-12-24'], { name: 'Julafton', kind: 'Eve' })];
    await e.sync();
    expect(await rows()).toEqual([
      { holiday_id: 'eve', calendar_ids: '["hol"]', start_utc: '2026-12-24T00:00:00.000Z', start_day: '2026-12-24', title: 'Julafton', kind: 'Eve' },
      { holiday_id: 'jul', calendar_ids: '["hol"]', start_utc: '2026-12-25T00:00:00.000Z', start_day: '2026-12-25', title: 'Juldagen', kind: 'PublicHoliday' },
      { holiday_id: 'jul', calendar_ids: '["hol"]', start_utc: '2027-12-25T00:00:00.000Z', start_day: '2027-12-25', title: 'Juldagen', kind: 'PublicHoliday' },
    ]);
  });

  it('replaces a holiday\'s dates as the window moves and drops one the next snapshot leaves out', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    snapshot = [holiday('jul', ['2025-12-25', '2026-12-25']), holiday('gone', ['2026-01-01'])];
    await e.sync();

    snapshot = [holiday('jul', ['2026-12-25', '2027-12-25'])];
    await e.sync();
    expect((await rows()).map((r) => [r.holiday_id, r.start_day])).toEqual([['jul', '2026-12-25'], ['jul', '2027-12-25']]);
  });
});
