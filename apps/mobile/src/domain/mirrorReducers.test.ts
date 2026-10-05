import { describe, expect, it } from 'vitest';
import type { ContactDoc, ItemDoc } from './docTypes';
import { emptyContactGuards, emptyItemGuards } from './docTypes';
import type { MirrorContact, MirrorItem } from './mirrorReducers';
import { applyContactOp, applyItemOp } from './mirrorReducers';
import type { ClientOp } from './ops';

const T = (m: number) => `2026-07-01T12:${String(m).padStart(2, '0')}:00.000Z`;
const cmd = (n: number) => `0198c0de-0000-7000-8000-${String(n).padStart(12, '0')}`;

const baseItem = (): MirrorItem => ({
  doc: {
    id: 'item-1', title: 'Original', isAllDay: false, startsAt: '2026-08-01T09:00:00Z',
    calendars: [{ calendarId: 'cal-1', status: 'Accepted' }],
  } as ItemDoc,
  guards: emptyItemGuards(),
});

const revise = (title: string, minute: number, n: number): ClientOp => ({
  aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.revise', itemId: 'item-1', occurredAt: T(minute), commandId: cmd(n),
  core: { title, isAllDay: false, startsAt: '2026-08-01T09:00:00Z' },
});

describe('applyItemOp', () => {
  it('applies a newer core revise and stamps the guard', () => {
    const after = applyItemOp(baseItem(), revise('Edited', 5, 1))!;
    expect(after.doc.title).toBe('Edited');
    expect(after.guards.core).toEqual({ ts: T(5), cmd: cmd(1) });
  });

  it('rejects a core revise staler than the guard (server-seeded)', () => {
    const state = baseItem();
    state.guards.core = { ts: T(10), cmd: cmd(9) };
    const after = applyItemOp(state, revise('Stale', 5, 1))!;
    expect(after.doc.title).toBe('Original');
  });

  it('keeps sections independent: a core guard never blocks metadata', () => {
    const state = baseItem();
    state.guards.core = { ts: T(10), cmd: cmd(9) };
    const after = applyItemOp(state, {
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.metadata', itemId: 'item-1', occurredAt: T(5), commandId: cmd(1), patch: { note: 'x' },
    })!;
    expect(after.doc.metadata).toEqual({ note: 'x' });
  });

  it('files per-calendar with independent guards', () => {
    const state = baseItem();
    state.guards.filing['cal-1'] = { ts: T(10), cmd: cmd(9) };
    const stale = applyItemOp(state, {
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.unfile', itemId: 'item-1', calendarId: 'cal-1', occurredAt: T(5), commandId: cmd(1),
    })!;
    expect(stale.doc.calendars[0].status).toBe('Accepted');   // stale unfile lost

    const other = applyItemOp(stale, {
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.file', itemId: 'item-1', calendarId: 'cal-2', entryStatus: 'proposed', occurredAt: T(5), commandId: cmd(2),
    })!;
    expect(other.doc.calendars).toContainEqual({ calendarId: 'cal-2', status: 'Proposed' });
  });

  it('delete absorbs later revisions', () => {
    const deleted = applyItemOp(baseItem(), { aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.delete', itemId: 'item-1', occurredAt: T(5), commandId: cmd(1) });
    expect(deleted).toBeNull();
    expect(applyItemOp(deleted, revise('Zombie', 20, 2))).toBeNull();
  });

  it('create is an idempotent hit over a live item', () => {
    const state = baseItem();
    const after = applyItemOp(state, {
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.create', itemId: 'item-1', sourceKey: 'k', calendarId: 'cal-9',
      occurredAt: T(5), commandId: cmd(1), core: { title: 'Dupe', isAllDay: false },
    });
    expect(after).toBe(state);
  });
});

const baseContact = (): MirrorContact => ({
  doc: {
    id: 'c-1', addressBookId: 'book-1', givenName: 'Jane', familyName: 'Doe',
    channels: [{ medium: 'Email', value: 'jane@x', preferred: true }],
    tags: ['friend'],
  } as ContactDoc,
  guards: emptyContactGuards(),
});

describe('applyContactOp', () => {
  it('revise merges (null keeps, channels/tags union) — mirroring ReviseContact', () => {
    const after = applyContactOp(baseContact(), {
      aggregate: 'contact', aggregateId: 'c-1', kind: 'contact.revise', contactId: 'c-1', occurredAt: T(5), commandId: cmd(1),
      core: { nickname: 'JJ', channels: [{ medium: 'Phone', value: '+4670', preferred: true }], tags: ['ski'] },
    })!;
    expect(after.doc.givenName).toBe('Jane');   // null = keep
    expect(after.doc.nickname).toBe('JJ');
    expect(after.doc.channels).toHaveLength(2);   // union, not replace
    expect(after.doc.tags).toEqual(['friend', 'ski']);
  });

  it('channels/tags wholesale ops share the core guard (one server event type)', () => {
    const first = applyContactOp(baseContact(), {
      aggregate: 'contact', aggregateId: 'c-1', kind: 'contact.channels', contactId: 'c-1', occurredAt: T(10), commandId: cmd(2),
      channels: [{ medium: 'Email', value: 'new@x', preferred: true }],
    })!;
    expect(first.doc.channels).toEqual([{ medium: 'Email', value: 'new@x', preferred: true }]);

    const stale = applyContactOp(first, {
      aggregate: 'contact', aggregateId: 'c-1', kind: 'contact.tags', contactId: 'c-1', occurredAt: T(5), commandId: cmd(1), tags: ['stale'],
    })!;
    expect(stale.doc.tags).toEqual(['friend']);   // lost to the newer channels write on the shared guard
  });

  it('profiles keep their own guard', () => {
    const state = baseContact();
    state.guards.core = { ts: T(10), cmd: cmd(9) };
    const after = applyContactOp(state, {
      aggregate: 'contact', aggregateId: 'c-1', kind: 'contact.profiles', contactId: 'c-1', occurredAt: T(5), commandId: cmd(1),
      profiles: [{ service: 'github', handle: 'jane', preferred: true }],
    })!;
    expect(after.doc.profiles).toHaveLength(1);
  });
});

describe('availability creates', () => {
  it('materializes presence status onto the doc and keeps it off the core fields', () => {
    const state = applyItemOp(null, {
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.create', itemId: 'a1', sourceKey: 'k', calendarId: 'avail-cal',
      commandId: '0198c0de-0000-7000-8000-000000000001', occurredAt: '2026-08-01T00:00:00.000Z',
      core: {
        title: 'Vacation', isAllDay: true, startDate: '2026-08-01', endDate: '2026-08-15',
        availability: 'Vacation',
      },
    });
    expect(state?.doc.details).toEqual({ presence: { status: 'Vacation' } });
    expect(state?.doc).not.toHaveProperty('availability');
  });
});

describe('places', () => {
  const withPlace = (placeId: string | null | undefined, location: string | null | undefined, n: number): ClientOp => ({
    aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.revise', itemId: 'item-1', occurredAt: T(n), commandId: cmd(n),
    core: { title: null, isAllDay: false, startsAt: '2026-08-01T09:00:00Z', placeId, location },
  });

  it('sets the place and its label', () => {
    const after = applyItemOp(baseItem(), withPlace('p1', 'Folkets Park', 1))!;
    expect(after.doc).toMatchObject({ placeId: 'p1', locationLabel: 'Folkets Park' });
  });

  it('undefined keeps the place, null clears it', () => {
    const placed = applyItemOp(baseItem(), withPlace('p1', 'Folkets Park', 1))!;
    expect(applyItemOp(placed, withPlace(undefined, undefined, 2))!.doc).toMatchObject({ placeId: 'p1', locationLabel: 'Folkets Park' });
    expect(applyItemOp(placed, withPlace(null, null, 3))!.doc).toMatchObject({ placeId: null, locationLabel: null });
  });

  it('the same place without a label keeps the old one', () => {
    const placed = applyItemOp(baseItem(), withPlace('p1', 'Folkets Park', 1))!;
    expect(applyItemOp(placed, withPlace('p1', null, 2))!.doc.locationLabel).toBe('Folkets Park');
    expect(applyItemOp(placed, withPlace('p2', null, 3))!.doc.locationLabel).toBeNull();
  });

  it('a create carries the place', () => {
    const create: ClientOp = {
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.create', itemId: 'item-2', sourceKey: 'sk', calendarId: 'cal-1', occurredAt: T(1), commandId: cmd(1),
      core: { title: 'Picnic', isAllDay: false, placeId: 'p1', location: 'Park' },
    };
    const doc = applyItemOp(null, create)!.doc;
    expect(doc).toMatchObject({ placeId: 'p1', locationLabel: 'Park' });
    expect(doc).not.toHaveProperty('location');
  });
});

describe('attendees', () => {
  const invite = (contactIds: string[], n: number): ClientOp => ({ aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.invite', itemId: 'item-1', contactIds, occurredAt: T(n), commandId: cmd(n) });
  const uninvite = (contactId: string, n: number): ClientOp => ({ aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.uninvite', itemId: 'item-1', contactId, occurredAt: T(n), commandId: cmd(n) });

  it('invites once per contact, pending a participation id', () => {
    const once = applyItemOp(baseItem(), invite(['c1', 'c2', 'c1'], 1))!;
    const twice = applyItemOp(once, invite(['c2'], 2))!;
    expect(twice.doc.attendees).toEqual([
      { participationId: '', contactId: 'c1', role: 'RequiredParticipant', status: 'NeedsAction' },
      { participationId: '', contactId: 'c2', role: 'RequiredParticipant', status: 'NeedsAction' },
    ]);
  });

  it('marks the invitees who accept on the spot as going', () => {
    const op: ClientOp = { aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.invite', itemId: 'item-1', contactIds: ['me', 'c1'], accept: ['me'], occurredAt: T(1), commandId: cmd(1) };
    expect(applyItemOp(baseItem(), op)!.doc.attendees?.map((a) => [a.contactId, a.status])).toEqual([
      ['me', 'Accepted'],
      ['c1', 'NeedsAction'],
    ]);
  });

  it('applies in outbox order, with no guard', () => {
    const invited = applyItemOp(baseItem(), invite(['c1'], 5))!;
    const removed = applyItemOp(invited, uninvite('c1', 1))!;
    expect(removed.doc.attendees).toEqual([]);
  });
});
