import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemAttendee } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { contactEvents } from './contactEvents';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-09-29T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(ITEM_DDL);
});

afterEach(() => vi.useRealTimers());

const on = (contactId: string, status = 'NeedsAction'): ItemAttendee => ({ participationId: `p-${contactId}`, contactId, role: 'RequiredParticipant', status });

const save = (id: string, day: string, attendees: ItemAttendee[]) =>
  db.exclusive((tx) => writeItemIndex(tx, id, {
    doc: { id, title: id, isAllDay: false, startsAt: `${day}T09:00:00.000Z`, calendars: [{ calendarId: 'cal-a', status: 'Accepted' }], attendees },
    guards: emptyItemGuards(),
  }));

describe('contactEvents', () => {
  it('lists the contact\'s items upcoming soonest-first, then past most-recent-first, with their RSVP', async () => {
    await save('later', '2026-11-01', [on('anna', 'Accepted')]);
    await save('soon', '2026-10-01', [on('anna'), on('bo')]);
    await save('old', '2026-01-01', [on('anna', 'Declined')]);
    await save('recent', '2026-08-01', [on('anna')]);
    await save('other', '2026-10-02', [on('bo')]);

    const rows = await contactEvents(db, 'anna', '2026-09-29');
    expect(rows.map((r) => [r.id, r.rsvp])).toEqual([['soon', 'NeedsAction'], ['later', 'Accepted'], ['recent', 'NeedsAction'], ['old', 'Declined']]);
    expect(rows[0]).toMatchObject({ next_utc: '2026-10-01T09:00:00.000Z', calendar_id: 'cal-a', color: null });
  });

  it('drops an attendance with its item, and one the item no longer lists', async () => {
    await save('a', '2026-10-01', [on('anna')]);
    await save('b', '2026-10-02', [on('anna')]);
    await save('b', '2026-10-02', []);
    await db.exclusive((tx) => writeItemIndex(tx, 'a', null));

    expect(await contactEvents(db, 'anna', '2026-09-29')).toEqual([]);
  });
});
