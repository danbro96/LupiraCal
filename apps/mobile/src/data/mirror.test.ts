import type { RelationshipRecord } from '@lupira/cal-domain/contactRelations';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemDoc } from '../domain/docTypes';
import { emptyContactGuards, emptyItemGuards } from '../domain/docTypes';
import type { OccurrenceRow } from '../domain/materialize';
import { openNodeDb } from './db/nodeDb';
import { migrate } from './db/schema';
import type { Db } from './db/types';
import { mapEventRowsBetween, relationshipsOf, removeRelationships, replaceContainers, saveContact, saveItem, saveRelationships, searchItems, upcomingPlacedEvents } from './mirror';

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await migrate(db);
});

const doc = (id: string, placeId: string | null, calendars: { calendarId: string; status: string }[]): ItemDoc => ({
  id, title: `Item ${id}`, isAllDay: false, placeId,
  calendars: calendars as ItemDoc['calendars'],
});

const occ = (sourceId: string, day: string, time = '09:00'): OccurrenceRow => ({
  source: 'item', sourceId, startUtc: `${day}T${time}:00.000Z`, endUtc: null, startDay: day, allDay: false,
});

describe('upcomingPlacedEvents', () => {
  const accepted = [{ calendarId: 'cal-a', status: 'Accepted' }];
  const put = (d: ItemDoc, occurrences: OccurrenceRow[]) => db.exclusive((tx) =>
    saveItem(tx, { doc: d, guards: emptyItemGuards(), deleted: false }, occurrences));

  it('lists the next placed events, a series by its next occurrence, an ongoing one included', async () => {
    await put(doc('series', 'p1', accepted), [occ('series', '2026-09-23'), occ('series', '2026-10-07'), occ('series', '2026-10-14')]);
    await put(doc('later', 'p2', accepted), [occ('later', '2026-10-20')]);
    await put(doc('past', 'p3', accepted), [occ('past', '2026-09-01')]);
    await put(doc('now', 'p4', accepted), [{ ...occ('now', '2026-09-30', '11:00'), endUtc: '2026-09-30T13:00:00.000Z' }]);
    await put({ ...doc('cancelled', 'p5', accepted), status: 'Cancelled' }, [occ('cancelled', '2026-10-01')]);

    const rows = await upcomingPlacedEvents(db, '2026-09-30T12:00:00.000Z', 10);
    expect(rows.map((r) => [r.source_id, r.start_utc.slice(0, 10)])).toEqual([
      ['now', '2026-09-30'], ['series', '2026-10-07'], ['later', '2026-10-20'],
    ]);
  });
});

describe('mapEventRowsBetween', () => {
  it('returns placed items in range with the Accepted calendar preferred', async () => {
    await db.exclusive(async (tx) => {
      await saveItem(tx, { doc: doc('a', 'place-1', [
        { calendarId: 'cal-z', status: 'Proposed' },
        { calendarId: 'cal-a', status: 'Accepted' },
      ]), guards: emptyItemGuards(), deleted: false }, [occ('a', '2026-08-10')]);
    });

    const rows = await mapEventRowsBetween(db, '2026-08-01', '2026-08-31');
    expect(rows).toEqual([{
      source_id: 'a', start_utc: '2026-08-10T09:00:00.000Z', title: 'Item a',
      place_id: 'place-1', calendar_id: 'cal-a',
    }]);
  });

  it('keeps only items accepted into a shown calendar when filtered', async () => {
    await db.exclusive(async (tx) => {
      await saveItem(tx, { doc: doc('shown', 'place-1', [{ calendarId: 'cal-a', status: 'Accepted' }]),
        guards: emptyItemGuards(), deleted: false }, [occ('shown', '2026-08-10')]);
      await saveItem(tx, { doc: doc('hidden', 'place-2', [{ calendarId: 'cal-b', status: 'Accepted' }]),
        guards: emptyItemGuards(), deleted: false }, [occ('hidden', '2026-08-11')]);
    });

    const filter = { calendarIds: ['cal-a'], birthdays: true };
    expect((await mapEventRowsBetween(db, '2026-08-01', '2026-08-31', filter)).map((r) => r.source_id)).toEqual(['shown']);
    expect((await upcomingPlacedEvents(db, '2026-08-01T00:00:00.000Z', 10, filter)).map((r) => r.source_id)).toEqual(['shown']);
  });

  it('collapses a recurring item to its earliest occurrence in the window', async () => {
    await db.exclusive(async (tx) => {
      await saveItem(tx, { doc: doc('r', 'place-1', [{ calendarId: 'cal-a', status: 'Accepted' }]),
        guards: emptyItemGuards(), deleted: false },
      [occ('r', '2026-08-20'), occ('r', '2026-08-06'), occ('r', '2026-08-13')]);
    });

    const rows = await mapEventRowsBetween(db, '2026-08-01', '2026-08-31');
    expect(rows).toHaveLength(1);
    expect(rows[0].start_utc).toBe('2026-08-06T09:00:00.000Z');
  });

  it('excludes unplaced items, deleted items, and occurrences outside the range', async () => {
    await db.exclusive(async (tx) => {
      await saveItem(tx, { doc: doc('unplaced', null, [{ calendarId: 'cal-a', status: 'Accepted' }]),
        guards: emptyItemGuards(), deleted: false }, [occ('unplaced', '2026-08-10')]);
      await saveItem(tx, { doc: doc('deleted', 'place-2', [{ calendarId: 'cal-a', status: 'Accepted' }]),
        guards: emptyItemGuards(), deleted: true }, [occ('deleted', '2026-08-11')]);
      await saveItem(tx, { doc: doc('outside', 'place-3', [{ calendarId: 'cal-a', status: 'Accepted' }]),
        guards: emptyItemGuards(), deleted: false }, [occ('outside', '2026-09-05')]);
    });

    expect(await mapEventRowsBetween(db, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('searchItems', () => {
  const save = (id: string, fields: Partial<ItemDoc>, occurrences: OccurrenceRow[], deleted = false, calendarId = 'cal-a') =>
    db.exclusive(async (tx) => {
      await saveItem(tx, { doc: { ...doc(id, null, [{ calendarId, status: 'Accepted' }]), ...fields },
        guards: emptyItemGuards(), deleted }, occurrences);
    });

  it('matches every term across title, description and tags, folding Swedish capitals', async () => {
    await save('a', { title: 'Årsmöte', description: 'Föreningen', tags: ['styrelse'] }, [occ('a', '2026-10-01')]);
    await save('b', { title: 'Årsmöte' }, [occ('b', '2026-10-02')]);

    expect((await searchItems(db, 'års', '2026-09-29')).map((r) => r.id)).toEqual(['a', 'b']);
    expect((await searchItems(db, 'ÅRS styrelse', '2026-09-29')).map((r) => r.id)).toEqual(['a']);
    expect(await searchItems(db, '   ', '2026-09-29')).toEqual([]);
  });

  it('treats LIKE wildcards in the query literally', async () => {
    await save('pct', { title: '50% off' }, [occ('pct', '2026-10-01')]);
    await save('plain', { title: '500 off' }, [occ('plain', '2026-10-01')]);

    expect((await searchItems(db, '50%', '2026-09-29')).map((r) => r.id)).toEqual(['pct']);
  });

  it('lists upcoming soonest-first, then past most-recent-first, and skips deleted items', async () => {
    await save('later', { title: 'Dentist later' }, [occ('later', '2026-11-01')]);
    await save('soon', { title: 'Dentist soon' }, [occ('soon', '2026-09-20'), occ('soon', '2026-09-29')]);
    await save('old', { title: 'Dentist old' }, [occ('old', '2026-01-01')]);
    await save('recent', { title: 'Dentist recent' }, [occ('recent', '2026-08-01')]);
    await save('gone', { title: 'Dentist gone' }, [occ('gone', '2026-10-01')], true);

    const rows = await searchItems(db, 'dentist', '2026-09-29');
    expect(rows.map((r) => r.id)).toEqual(['soon', 'later', 'recent', 'old']);
    expect(rows[0]).toMatchObject({ next_utc: '2026-09-29T09:00:00.000Z', last_utc: '2026-09-20T09:00:00.000Z', calendar_id: 'cal-a' });
  });

  it('finds only items accepted into a shown calendar when filtered', async () => {
    const calendars = [{ id: 'sys', class: 'System' }, { id: 'cal-a', class: 'Personal' }];
    await db.exclusive((tx) => replaceContainers(tx, 'calendars', calendars));
    await save('sys', { title: 'Plan' }, [occ('sys', '2026-10-01')], false, 'sys');
    await save('mine', { title: 'Plan' }, [occ('mine', '2026-10-02')]);

    expect((await searchItems(db, 'plan', '2026-09-29', { calendarIds: ['cal-a'], birthdays: true })).map((r) => r.id)).toEqual(['mine']);
    expect((await searchItems(db, 'plan', '2026-09-29')).map((r) => r.id)).toEqual(['sys', 'mine']);
  });
});

describe('relationshipsOf', () => {
  const person = (id: string, givenName: string, deleted = false) =>
    db.exclusive((tx) => saveContact(tx, { doc: { id, addressBookId: 'ab', givenName }, guards: emptyContactGuards(), deleted }, []));
  const rel = (id: string, lowId: string, highId: string, kind: RelationshipRecord['kind']): RelationshipRecord => ({ id, lowId, highId, kind });

  it("returns a contact's relationships from either end with the other's name, and none whose other is deleted", async () => {
    await person('x', 'Xavier');
    await person('y', 'Yara');
    await person('z', 'Zoe');
    await person('gone', 'Gone', true);
    await db.exclusive((tx) => saveRelationships(tx, [
      rel('xy', 'x', 'y', 'Child'), rel('yz', 'y', 'z', 'Friend'), rel('gy', 'gone', 'y', 'Friend'), rel('xz', 'x', 'z', 'Friend'),
    ]));

    const rows = await relationshipsOf(db, 'y');
    expect(rows.map((r) => [r.record.id, r.otherId, r.otherName]).sort()).toEqual([
      ['xy', 'x', 'Xavier'],
      ['yz', 'z', 'Zoe'],
    ]);
  });

  it('forgets removed relationships', async () => {
    await person('x', 'Xavier');
    await person('y', 'Yara');
    await db.exclusive(async (tx) => {
      await saveRelationships(tx, [rel('xy', 'x', 'y', 'Friend')]);
      await removeRelationships(tx, ['xy']);
    });
    expect(await relationshipsOf(db, 'y')).toEqual([]);
  });
});
