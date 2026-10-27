import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { SubscribedEventSyncDto } from '@lupira/cal-api/models';
import { beforeEach, describe, expect, it } from 'vitest';
import { subscribedEventModule } from './subscribedEvent';

const event = (id: string, occurrences: SubscribedEventSyncDto['occurrences'], over: Partial<SubscribedEventSyncDto> = {}) =>
  ({ id, subscriptionId: 'sub', calendarId: 'cal', title: `Event ${id}`, isAllDay: false, status: 'Confirmed', etag: id, occurrences, ...over }) as SubscribedEventSyncDto;

let db: Db;
let snapshot: SubscribedEventSyncDto[];

const module = {
  ...subscribedEventModule,
  feed: { ...subscribedEventModule.feed, fetch: async () => ({ cursor: '', hasMore: false, reset: true, changed: snapshot, deleted: [] }) },
};

const rows = () => db.all('SELECT event_id, start_utc, end_utc, start_day, all_day FROM subscribed_occurrences ORDER BY event_id, start_utc');

beforeEach(() => {
  db = openNodeDb();
});

describe('subscribedEvent module', () => {
  it('indexes each occurrence, all-day ones on their date with the inclusive last day as their end', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    snapshot = [
      event('timed', [{ start: '2026-08-04T16:00:00+00:00', end: '2026-08-04T18:00:00+00:00' }]),
      event('camp', [{ start: '2026-08-10T00:00:00+00:00', end: '2026-08-12T00:00:00+00:00' }], { isAllDay: true }),
      event('day', [{ start: '2026-08-15T00:00:00+00:00', end: '2026-08-15T00:00:00+00:00' }], { isAllDay: true }),
    ];
    await e.sync();
    expect(await rows()).toEqual([
      { event_id: 'camp', start_utc: '2026-08-10T00:00:00.000Z', end_utc: '2026-08-12T00:00:00.000Z', start_day: '2026-08-10', all_day: 1 },
      { event_id: 'day', start_utc: '2026-08-15T00:00:00.000Z', end_utc: null, start_day: '2026-08-15', all_day: 1 },
      { event_id: 'timed', start_utc: '2026-08-04T16:00:00.000Z', end_utc: '2026-08-04T18:00:00.000Z', start_day: '2026-08-04', all_day: 0 },
    ]);
  });

  it('replaces an event\'s occurrences on change and drops an event the next snapshot leaves out', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    snapshot = [
      event('weekly', [{ start: '2026-08-04T16:00:00Z', originalStart: '2026-08-04T16:00:00Z' }, { start: '2026-08-11T16:00:00Z', originalStart: '2026-08-11T16:00:00Z' }]),
      event('gone', [{ start: '2026-08-05T09:00:00Z' }]),
    ];
    await e.sync();

    snapshot = [event('weekly', [{ start: '2026-08-12T16:00:00Z', originalStart: '2026-08-11T16:00:00Z' }], { title: 'Moved', etag: 'v2' })];
    await e.sync();
    expect(await db.all('SELECT event_id, original_start, start_utc, title FROM subscribed_occurrences')).toEqual([
      { event_id: 'weekly', original_start: '2026-08-11T16:00:00Z', start_utc: '2026-08-12T16:00:00.000Z', title: 'Moved' },
    ]);
  });
});
