import { describe, expect, it } from 'vitest';
import { contactDraftFromLink, itemDraftFromLink, withResolvedLocation, type ItemDraft } from './drafts';

const ZONE = 'Europe/Stockholm';

describe('itemDraftFromLink', () => {
  it('is null without draft params', () => {
    expect(itemDraftFromLink({}, ZONE)).toBeNull();
  });

  it('reads a timed event as instants in the device zone', () => {
    const begin = Date.UTC(2026, 9, 6, 12, 0);
    const end = Date.UTC(2026, 9, 6, 13, 30);
    expect(itemDraftFromLink({
      begin: String(begin), end: String(end), title: ' Lunch ', location: 'Torsby', description: 'Bring cake', recurrence: 'FREQ=WEEKLY',
    }, ZONE)).toEqual({
      title: 'Lunch',
      description: 'Bring cake',
      location: 'Torsby',
      isAllDay: false,
      startsAt: '2026-10-06T12:00:00.000Z',
      endsAt: '2026-10-06T13:30:00.000Z',
      startDate: null,
      endDate: null,
      startTimezone: ZONE,
      recurrenceRule: 'FREQ=WEEKLY',
    });
  });

  it('drops an end that is not after the start', () => {
    const begin = Date.UTC(2026, 9, 6, 12, 0);
    expect(itemDraftFromLink({ begin: String(begin), end: String(begin) }, ZONE)?.endsAt).toBeNull();
  });

  it('turns an all-day range into dates with an inclusive end', () => {
    const begin = Date.UTC(2026, 9, 5, 22, 0);   // 2026-10-06 00:00 in Stockholm
    const end = Date.UTC(2026, 9, 7, 22, 0);     // exclusive: midnight starting 2026-10-08
    expect(itemDraftFromLink({ begin: String(begin), end: String(end), allDay: 'true' }, ZONE)).toMatchObject({
      isAllDay: true,
      startDate: '2026-10-06',
      endDate: '2026-10-07',
      startsAt: null,
      endsAt: null,
      startTimezone: null,
    });
  });

  it('ignores unparseable times', () => {
    expect(itemDraftFromLink({ begin: 'soon', title: 'Party' }, ZONE)).toMatchObject({ title: 'Party', startsAt: null, endsAt: null });
  });
});

describe('contactDraftFromLink', () => {
  it('is null without draft params', () => {
    expect(contactDraftFromLink({})).toBeNull();
  });

  it('splits the name on its last word and keeps phone and email as channels', () => {
    expect(contactDraftFromLink({
      name: 'Anna Maria Svensson', phone: '+46 70 123', email: 'anna@example.com', company: 'Acme', notes: 'Met at fika',
    })).toEqual({
      givenName: 'Anna Maria',
      middleName: null,
      familyName: 'Svensson',
      nickname: null,
      organization: 'Acme',
      channels: [
        { medium: 'Phone', value: '+46 70 123', preferred: false },
        { medium: 'Email', value: 'anna@example.com', preferred: false },
      ],
      birthday: null,
      notes: 'Met at fika',
    });
  });

  it('reads a single word as the given name', () => {
    expect(contactDraftFromLink({ name: 'Cher' })).toMatchObject({ givenName: 'Cher', familyName: null });
  });

  it('has no name when only a company is given', () => {
    expect(contactDraftFromLink({ company: 'Acme' })).toMatchObject({ givenName: null, familyName: null, organization: 'Acme' });
  });
});

describe('withResolvedLocation', () => {
  const draft: ItemDraft = { isAllDay: false, description: 'Bring cake', location: 'Torsby bibliotek, Storgatan 1' };

  it('places the draft on a candidate with the location\'s name', () => {
    expect(withResolvedLocation(draft, [{ id: 'p0', name: 'Torsby' }, { id: 'p1', name: 'Torsby Bibliotek' }]))
      .toMatchObject({ placeId: 'p1', location: 'Torsby Bibliotek', description: 'Bring cake' });
  });

  it('moves an unmatched location into the description', () => {
    expect(withResolvedLocation(draft, [{ id: 'p0', name: 'Torsby' }])).toMatchObject({
      placeId: null, location: null, description: 'Bring cake\n\nLocation: Torsby bibliotek, Storgatan 1',
    });
  });

  it('leaves a draft without a location alone', () => {
    expect(withResolvedLocation({ isAllDay: true, location: ' ' }, [])).toEqual({ isAllDay: true, location: null });
  });
});
