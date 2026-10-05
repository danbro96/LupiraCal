import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDoc } from '../../domain/docTypes';
import { emptyItemGuards } from '../../domain/docTypes';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import { searchItems } from './search';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-09-29T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(ITEM_DDL);
});

afterEach(() => vi.useRealTimers());

const save = (id: string, fields: Partial<ItemDoc>, day: string, calendarId = 'cal-a') =>
  db.exclusive((tx) => writeItemIndex(tx, id, {
    doc: { id, isAllDay: false, startsAt: `${day}T09:00:00.000Z`, calendars: [{ calendarId, status: 'Accepted' }], ...fields },
    guards: emptyItemGuards(),
  }));

describe('searchItems', () => {
  it('matches every term across title, description and tags, folding Swedish capitals', async () => {
    await save('a', { title: 'Årsmöte', description: 'Föreningen', tags: ['styrelse'] }, '2026-10-01');
    await save('b', { title: 'Årsmöte' }, '2026-10-02');

    expect((await searchItems(db, 'års', '2026-09-29')).map((r) => r.id)).toEqual(['a', 'b']);
    expect((await searchItems(db, 'ÅRS styrelse', '2026-09-29')).map((r) => r.id)).toEqual(['a']);
    expect(await searchItems(db, '   ', '2026-09-29')).toEqual([]);
  });

  it('treats LIKE wildcards in the query literally', async () => {
    await save('pct', { title: '50% off' }, '2026-10-01');
    await save('plain', { title: '500 off' }, '2026-10-01');

    expect((await searchItems(db, '50%', '2026-09-29')).map((r) => r.id)).toEqual(['pct']);
  });

  it('lists upcoming soonest-first, then past most-recent-first', async () => {
    await save('later', { title: 'Dentist later' }, '2026-11-01');
    await save('soon', { title: 'Dentist soon', recurrenceRule: 'FREQ=DAILY;INTERVAL=9;COUNT=2' }, '2026-09-20');
    await save('old', { title: 'Dentist old' }, '2026-01-01');
    await save('recent', { title: 'Dentist recent' }, '2026-08-01');

    const rows = await searchItems(db, 'dentist', '2026-09-29');
    expect(rows.map((r) => r.id)).toEqual(['soon', 'later', 'recent', 'old']);
    expect(rows[0]).toMatchObject({ next_utc: '2026-09-29T09:00:00.000Z', last_utc: '2026-09-20T09:00:00.000Z', calendar_id: 'cal-a' });
  });

  it('finds only items accepted into a shown calendar when filtered', async () => {
    await save('sys', { title: 'Plan' }, '2026-10-01', 'sys');
    await save('mine', { title: 'Plan' }, '2026-10-02');

    expect((await searchItems(db, 'plan', '2026-09-29', { calendarIds: ['cal-a'], birthdays: true })).map((r) => r.id)).toEqual(['mine']);
    expect((await searchItems(db, 'plan', '2026-09-29')).map((r) => r.id)).toEqual(['sys', 'mine']);
  });
});
