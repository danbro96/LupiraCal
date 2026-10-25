import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Aggregate } from '../../domain/aggregates';
import type { ItemAttendee, ItemDoc } from '../../domain/docTypes';
import { emptyContactGuards, emptyItemGuards } from '../../domain/docTypes';
import { CALENDAR_DDL, writeCalendarIndex } from '../indexes/calendars';
import { CONTACT_DDL, writeContactIndex } from '../indexes/contacts';
import { ITEM_DDL, writeItemIndex } from '../indexes/items';
import {
  birthdaysBetween, calendarsForVisibility, myContactIdOf, myOccurrences, myShownOccurrences, pendingInvites,
} from './notificationSources';
import { DOCS_DDL, putDoc } from './testDocs';

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  await db.exec(DOCS_DDL + ITEM_DDL + CONTACT_DDL + CALENDAR_DDL);
});

afterEach(() => vi.useRealTimers());

const on = (contactId: string, over: Partial<ItemAttendee> & Record<string, unknown> = {}): ItemAttendee =>
  ({ participationId: `p-${contactId}`, contactId, role: 'RequiredParticipant', status: 'Accepted', ...over });

const item = (id: string, startsAt: string, attendees: ItemAttendee[], over: Partial<ItemDoc> = {}) =>
  db.exclusive((tx) => putDoc(tx, Aggregate.item, id, {
    doc: { id, title: id, isAllDay: false, startsAt, calendars: [{ calendarId: 'personal', status: 'Accepted' }], attendees, ...over },
    guards: emptyItemGuards(),
  }, writeItemIndex));

const calendar = (id: string, kind: string, cls = 'Agenda', access = 'Owner') =>
  db.exclusive((tx) => putDoc(tx, Aggregate.calendar, id, { doc: { id, kind, class: cls, access }, guards: null }, writeCalendarIndex));

const contact = (id: string, givenName: string, over: Record<string, unknown> = {}) =>
  db.exclusive((tx) => putDoc(tx, Aggregate.contact, id, { doc: { id, addressBookId: 'ab', givenName, ...over }, guards: emptyContactGuards() }, writeContactIndex));

describe('notification sources', () => {
  it('reads your contact id and the calendars as stored', async () => {
    await db.exclusive((tx) => tx.run('INSERT INTO docs (aggregate, id, local) VALUES (?, ?, ?)', [Aggregate.me, 'me', JSON.stringify({ doc: { contactId: 'me' } })]));
    await calendar('personal', 'Personal');
    expect(await myContactIdOf(db)).toBe('me');
    expect(await calendarsForVisibility(db)).toEqual([{ id: 'personal', class: 'Agenda', kind: 'Personal' }]);
  });

  it('lists your occurrences with your RSVP and reminder', async () => {
    await item('a', '2026-10-14T09:00:00.000Z', [on('me', { reminder: { mode: 'Before', minutesBefore: 30 } }), on('anna')], { locationLabel: 'Home' });
    await item('b', '2026-10-15T09:00:00.000Z', [on('me', { status: 'Tentative' })]);
    await item('c', '2026-10-15T09:00:00.000Z', [on('anna')]);

    const rows = await myOccurrences(db, 'me', '2026-10-13', '2026-10-28');
    expect(rows.map((r) => [r.itemId, r.rsvp, r.reminder, r.place])).toEqual([
      ['a', 'Accepted', { mode: 'Before', minutesBefore: 30 }, 'Home'],
      ['b', 'Tentative', null, null],
    ]);
  });

  it('reads a moved occurrence at its new time and title, and leaves excluded and cancelled ones out', async () => {
    await item('w', '2026-10-14T09:00:00.000Z', [on('me')], {
      recurrenceRule: 'FREQ=DAILY;COUNT=4',
      excludedOccurrences: ['2026-10-15T09:00:00Z'],
      occurrenceOverrides: [
        { originalStart: '2026-10-16T09:00:00Z', startsAt: '2026-10-16T13:00:00Z', endsAt: null, title: 'Later', description: null, status: null, locationLabel: null },
        { originalStart: '2026-10-17T09:00:00Z', startsAt: null, endsAt: null, title: null, description: null, status: 'Cancelled', locationLabel: null },
      ],
    });

    const rows = await myOccurrences(db, 'me', '2026-10-13', '2026-10-28');
    expect(rows.map((r) => [r.originalStart, r.startUtc, r.title])).toEqual([
      ['2026-10-14T09:00:00Z', '2026-10-14T09:00:00.000Z', 'w'],
      ['2026-10-16T09:00:00Z', '2026-10-16T13:00:00.000Z', 'Later'],
    ]);
  });

  it('leaves out an occurrence you have left', async () => {
    await item('a', '2026-10-14T09:00:00.000Z', [on('me', { leftAt: '2026-10-12T09:00:00Z' })]);
    expect(await myOccurrences(db, 'me', '2026-10-13', '2026-10-28')).toEqual([]);
  });

  it('lists shown calendars only, never availability, with your RSVP where you are on it', async () => {
    await calendar('personal', 'Personal');
    await calendar('avail', 'Availability');
    await item('mine', '2026-10-14T09:00:00.000Z', [on('me', { status: 'Declined' })]);
    await item('other', '2026-10-14T10:00:00.000Z', []);
    await item('away', '2026-10-14T00:00:00.000Z', [], { calendars: [{ calendarId: 'personal', status: 'Accepted' }, { calendarId: 'avail', status: 'Accepted' }] });
    await item('hidden', '2026-10-14T11:00:00.000Z', [], { calendars: [{ calendarId: 'work', status: 'Accepted' }] });

    const rows = await myShownOccurrences(db, '2026-10-13', '2026-10-28', ['personal', 'avail'], 'me');
    expect(rows.map((r) => [r.itemId, r.rsvp])).toEqual([['mine', 'Declined'], ['other', null]]);
  });

  it('lists only your events in a shared calendar, and your own calendar\'s events you are not on', async () => {
    await calendar('personal', 'Personal');
    await calendar('family', 'Shared', 'Agenda', 'ReadWrite');
    const family = { calendars: [{ calendarId: 'family', status: 'Accepted' }] };
    await item('own', '2026-10-14T09:00:00.000Z', [on('anna')]);
    await item('others', '2026-10-14T10:00:00.000Z', [on('anna')], family);
    await item('going', '2026-10-14T11:00:00.000Z', [on('me'), on('anna')], family);
    await item('left', '2026-10-14T12:00:00.000Z', [on('me', { leftAt: '2026-10-12T09:00:00Z' })], family);
    await item('leftOwn', '2026-10-14T13:00:00.000Z', [on('me', { leftAt: '2026-10-12T09:00:00Z' })]);
    await item('declined', '2026-10-14T14:00:00.000Z', [on('me', { status: 'Declined' })], family);
    await item('pending', '2026-10-14T15:00:00.000Z', [], { calendars: [{ calendarId: 'personal', status: 'NeedsAction' }, { calendarId: 'family', status: 'Accepted' }] });

    const rows = await myShownOccurrences(db, '2026-10-13', '2026-10-28', ['personal', 'family'], 'me');
    expect(rows.map((r) => [r.itemId, r.rsvp])).toEqual([['own', null], ['going', 'Accepted'], ['declined', 'Declined']]);
  });

  it('lists birthdays with the birth year, leaving out those who have died', async () => {
    await contact('a', 'Anna', { birthday: { year: 1986, month: 10, day: 14 } });
    await contact('b', 'Bo', { birthday: { year: null, month: 10, day: 15 } });
    await contact('c', 'Cia', { birthday: { year: 1950, month: 10, day: 15 }, deceased: true });

    expect(await birthdaysBetween(db, '2026-10-13', '2026-10-28')).toEqual([
      { contactId: 'a', name: 'Anna', day: '2026-10-14', birthYear: 1986 },
      { contactId: 'b', name: 'Bo', day: '2026-10-15', birthYear: null },
    ]);
  });

  it('lists invitations waiting on you with their next occurrence, invite time and organiser', async () => {
    await contact('anna', 'Anna');
    await item('weekly', '2026-10-06T16:00:00.000Z', [on('me', { status: 'NeedsAction', invitedAt: '2026-10-13T10:00:00Z' }), on('anna', { role: 'Chair' })],
      { recurrenceRule: 'FREQ=WEEKLY' });
    await item('picnic', '2026-10-20T00:00:00.000Z', [on('me', { status: 'NeedsAction' })], { isAllDay: true, startsAt: null, startDate: '2026-10-20' });
    await item('past', '2026-10-01T16:00:00.000Z', [on('me', { status: 'NeedsAction' })]);
    await item('answered', '2026-10-20T16:00:00.000Z', [on('me')]);

    const rows = await pendingInvites(db, 'me', '2026-10-13', '2026-10-13T12:00:00.000Z');
    expect(rows.sort((a, b) => a.itemId.localeCompare(b.itemId))).toEqual([
      { itemId: 'past', title: 'past', itemStatus: null, allDay: false, nextStartUtc: null, nextStartDay: null, invitedAt: null, inviter: null },
      { itemId: 'picnic', title: 'picnic', itemStatus: null, allDay: true, nextStartUtc: '2026-10-20T00:00:00.000Z', nextStartDay: '2026-10-20', invitedAt: null, inviter: null },
      { itemId: 'weekly', title: 'weekly', itemStatus: null, allDay: false, nextStartUtc: '2026-10-13T16:00:00.000Z', nextStartDay: null, invitedAt: '2026-10-13T10:00:00Z', inviter: 'Anna' },
    ]);
  });
});
