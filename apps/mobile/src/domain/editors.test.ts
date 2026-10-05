import { describe, expect, it } from 'vitest';
import type { ContactDoc, ItemDoc } from './docTypes';
import { emptyItemForm } from '@lupira/cal-domain/itemForm';
import {
  attendeeChanges, contactCoreFromDraft, contactCoreFromForm, contactFormFromDoc, contactFormFromDraft, coreOfDoc,
  emptyContactForm, filingChanges, itemCoreFromForm, itemFormFromDoc, itemFormFromDraft, metadataValueFromInput,
} from './editors';
import type { ContactDraft, ItemDraft } from './drafts';

const timedDoc: ItemDoc = {
  id: 'i1',
  title: 'Dentist',
  description: 'Annual check',
  status: 'Confirmed',
  category: 'Appointment',
  tags: ['health', 'kids'],
  isAllDay: false,
  startsAt: new Date(2026, 7, 3, 14, 30).toISOString(),
  endsAt: new Date(2026, 7, 3, 15, 0).toISOString(),
  recurrenceRule: null,
  parentItemId: 'parent-1',
  calendars: [{ calendarId: 'c1', status: 'Accepted' }],
};

describe('item editor', () => {
  it('round-trips a timed doc through form and core', () => {
    const form = itemFormFromDoc(timedDoc);
    expect(form.startDay).toBe('2026-08-03');
    expect(form.startTime).toBe('14:30');
    expect(form.tagsCsv).toBe('health, kids');

    const r = itemCoreFromForm(form, timedDoc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.startsAt).toBe(timedDoc.startsAt);
    expect(r.value.endsAt).toBe(timedDoc.endsAt);
    expect(r.value.startDate).toBeNull();
    expect(r.value.tags).toEqual(['health', 'kids']);
    expect(r.value.parentItemId).toBe('parent-1');   // unedited field survives the whole-section write
  });

  it('round-trips an all-day doc', () => {
    const doc: ItemDoc = { ...timedDoc, isAllDay: true, startsAt: null, endsAt: null, startDate: '2026-08-10', endDate: '2026-08-12' };
    const form = itemFormFromDoc(doc);
    expect(form.startDay).toBe('2026-08-10');
    expect(form.startTime).toBe('');

    const r = itemCoreFromForm(form, doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toMatchObject({ isAllDay: true, startDate: '2026-08-10', endDate: '2026-08-12', startsAt: null, endsAt: null });
  });

  it('flipping to all-day moves the schedule to the date fields', () => {
    const form = { ...itemFormFromDoc(timedDoc), isAllDay: true, startTime: '', endTime: '', endDay: '' };
    const r = itemCoreFromForm(form, timedDoc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.startDate).toBe('2026-08-03');
    expect(r.value.startsAt).toBeNull();
  });

  it('empty title/description mean keep (null), never clear', () => {
    const r = itemCoreFromForm({ ...emptyItemForm() }, undefined);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.title).toBeNull();
    expect(r.value.description).toBeNull();
    expect(r.value.tags).toEqual([]);   // tags DO clear — server replaces on non-null
  });

  it('rejects end before start, timed and all-day', () => {
    const timed = itemCoreFromForm({ ...emptyItemForm(), startDay: '2026-08-03', startTime: '15:00', endDay: '2026-08-03', endTime: '14:00' });
    expect(timed.ok).toBe(false);
    const allDay = itemCoreFromForm({ ...emptyItemForm(), isAllDay: true, startDay: '2026-08-03', endDay: '2026-08-01' });
    expect(allDay.ok).toBe(false);
  });

  it('rejects half-specified timed instants and recurrence without a start', () => {
    expect(itemCoreFromForm({ ...emptyItemForm(), startDay: '2026-08-03' }).ok).toBe(false);
    expect(itemCoreFromForm({ ...emptyItemForm(), endDay: '2026-08-03', endTime: '10:00' }).ok).toBe(false);
    expect(itemCoreFromForm({ ...emptyItemForm(), recurrenceRule: 'FREQ=DAILY' }).ok).toBe(false);
  });
});

describe('contact editor', () => {
  const doc: ContactDoc = {
    id: 'c1', addressBookId: 'b1',
    givenName: 'Alva', familyName: 'B', nickname: null,
    birthday: { year: 2019, month: 3, day: 7 },
    channels: [{ medium: 'Phone', value: '070', preferred: true }],
    tags: ['family'],
  };

  it('round-trips core fields and keeps channels/tags out of revise', () => {
    const form = contactFormFromDoc(doc);
    expect(form.birthday).toBe('2019-03-07');
    expect(form.birthdayYearKnown).toBe(true);

    const r = contactCoreFromForm(form);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.givenName).toBe('Alva');
    expect(r.value.birthday).toEqual({ year: 2019, month: 3, day: 7 });
    expect(r.value.channels).toBeNull();   // UNION-merge wart: never send via revise
    expect(r.value.tags).toBeNull();
  });

  it('year-unknown birthdays come from month/day fields — no fake year anywhere', () => {
    const form = { ...emptyContactForm(), givenName: 'X', birthdayYearKnown: false, birthdayMonth: '6', birthdayDay: '15' };
    const r = contactCoreFromForm(form);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.birthday).toEqual({ year: null, month: 6, day: 15 });

    const incomplete = contactCoreFromForm({ ...form, birthdayDay: '' });
    if (!incomplete.ok) throw new Error(incomplete.error);
    expect(incomplete.value.birthday).toBeNull();   // half-filled = keep
  });

  it('year-unknown docs round-trip into month/day fields, never the date input', () => {
    const yearless: ContactDoc = { id: 'c2', addressBookId: 'b1', givenName: 'Y', birthday: { year: null, month: 3, day: 7 } };
    const form = contactFormFromDoc(yearless);
    expect(form).toMatchObject({ birthday: '', birthdayYearKnown: false, birthdayMonth: '3', birthdayDay: '7' });
  });

  it('requires some name', () => {
    expect(contactCoreFromForm(emptyContactForm()).ok).toBe(false);
  });
});

describe('all-day end is the inclusive last day', () => {
  it('reads and writes the stored last day unchanged', () => {
    const doc: ItemDoc = { ...timedDoc, isAllDay: true, startsAt: null, endsAt: null, startDate: '2026-08-10', endDate: '2026-08-12' };
    const form = itemFormFromDoc(doc);
    expect(form.endDay).toBe('2026-08-12');
    const r = itemCoreFromForm({ ...form, endDay: '2026-08-10' }, doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.endDate).toBe('2026-08-10');
  });

  it('an end before the start opens as a single day', () => {
    const doc: ItemDoc = { ...timedDoc, isAllDay: true, startsAt: null, endsAt: null, startDate: '2026-08-10', endDate: '2026-08-09' };
    expect(itemFormFromDoc(doc).endDay).toBe('');
  });
});

describe('time zones', () => {
  const tokyoDoc: ItemDoc = {
    ...timedDoc, startsAt: '2026-10-02T01:00:00.000Z', endsAt: '2026-10-02T02:30:00.000Z', startTimezone: 'Asia/Tokyo',
  };

  it('reads the fields in the event zone and writes them back unchanged', () => {
    const form = itemFormFromDoc(tokyoDoc);
    expect(form).toMatchObject({ timeZone: 'Asia/Tokyo', startDay: '2026-10-02', startTime: '10:00', endTime: '11:30' });
    const r = itemCoreFromForm(form, tokyoDoc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toMatchObject({ startsAt: tokyoDoc.startsAt, endsAt: tokyoDoc.endsAt, startTimezone: 'Asia/Tokyo', endTimezone: 'Asia/Tokyo' });
  });

  it('changing the zone keeps the wall clock and moves the instant', () => {
    const r = itemCoreFromForm({ ...itemFormFromDoc(tokyoDoc), timeZone: 'Europe/London' }, tokyoDoc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.startsAt).toBe('2026-10-02T09:00:00.000Z');
  });

  it('an unknown zone opens in the device zone', () => {
    expect(itemFormFromDoc({ ...tokyoDoc, startTimezone: 'Not/AZone' }).timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('all-day events carry no zone', () => {
    const r = itemCoreFromForm({ ...emptyItemForm(), isAllDay: true, startDay: '2026-10-02', timeZone: 'Asia/Tokyo' });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.startTimezone).toBeNull();
  });
});

describe('place', () => {
  it('round-trips the place and its label', () => {
    const doc: ItemDoc = { ...timedDoc, placeId: 'p1', locationLabel: 'Folkets Park' };
    const form = itemFormFromDoc(doc);
    expect(form.place).toEqual({ placeId: 'p1', label: 'Folkets Park' });
    const r = itemCoreFromForm(form, doc);
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toMatchObject({ placeId: 'p1', location: 'Folkets Park' });
  });

  it('removing it clears, not keeps', () => {
    const r = itemCoreFromForm({ ...itemFormFromDoc({ ...timedDoc, placeId: 'p1' }), place: null });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.placeId).toBeNull();
  });
});

describe('coreOfDoc', () => {
  it('copies the core verbatim and keeps tags', () => {
    const doc: ItemDoc = { ...timedDoc, startTimezone: 'Europe/Stockholm', recurrenceRule: 'FREQ=WEEKLY' };
    expect(coreOfDoc(doc)).toMatchObject({
      title: 'Dentist', startsAt: doc.startsAt, startTimezone: 'Europe/Stockholm', recurrenceRule: 'FREQ=WEEKLY',
      parentItemId: 'parent-1', tags: null,
    });
    expect(coreOfDoc(doc).placeId).toBeUndefined();
  });
});

describe('filingChanges', () => {
  const memberships = [
    { calendarId: 'a', status: 'Accepted' },
    { calendarId: 'b', status: 'Accepted' },
    { calendarId: 'p', status: 'Proposed' },
    { calendarId: 'r', status: 'Removed' },
  ];

  it('files the new, unfiles the dropped, and leaves proposals alone', () => {
    expect(filingChanges(memberships, ['a', 'r'])).toEqual({ file: ['r'], unfile: ['b'] });
  });

  it('selecting a proposal accepts it', () => {
    expect(filingChanges(memberships, ['a', 'b', 'p'])).toEqual({ file: ['p'], unfile: [] });
  });

  it('a create files everything selected, in order', () => {
    expect(filingChanges([], ['b', 'a'])).toEqual({ file: ['b', 'a'], unfile: [] });
  });
});

describe('attendeeChanges', () => {
  it('diffs by contact', () => {
    const attendees = [
      { participationId: 'x', contactId: 'c1', role: 'RequiredParticipant', status: 'Accepted' },
      { participationId: 'y', contactId: 'c2', role: 'RequiredParticipant', status: 'NeedsAction' },
    ];
    expect(attendeeChanges(attendees, ['c2', 'c3'])).toEqual({ invite: ['c3'], uninvite: ['c1'] });
  });
});

describe('metadataValueFromInput', () => {
  it('keeps text as text', () => {
    expect(metadataValueFromInput('42', 'old')).toEqual({ ok: true, value: '42' });
    expect(metadataValueFromInput('42', undefined)).toEqual({ ok: true, value: '42' });
  });

  it('keeps a non-string key typed', () => {
    expect(metadataValueFromInput('43', 42)).toEqual({ ok: true, value: 43 });
    expect(metadataValueFromInput('{"a":[1]}', { a: [] })).toEqual({ ok: true, value: { a: [1] } });
    expect(metadataValueFromInput('true', null)).toEqual({ ok: true, value: true });
  });

  it('rejects text where JSON is held', () => {
    expect(metadataValueFromInput('forty-three', 42).ok).toBe(false);
  });
});

const timedDraft: ItemDraft = {
  title: 'Lunch',
  description: 'Bring cake',
  location: 'Torsby',
  isAllDay: false,
  startsAt: new Date(2026, 9, 6, 12, 0).toISOString(),
  endsAt: null,
  startDate: null,
  endDate: null,
  startTimezone: null,
  recurrenceRule: 'FREQ=WEEKLY',
};

describe('editors from drafts', () => {
  it('opens a timed draft without an end as a one-hour event', () => {
    const form = itemFormFromDraft(timedDraft);
    expect(form).toMatchObject({
      title: 'Lunch', description: 'Bring cake', recurrenceRule: 'FREQ=WEEKLY', isAllDay: false,
      startDay: '2026-10-06', startTime: '12:00', endDay: '2026-10-06', endTime: '13:00', place: null,
    });
  });

  it('carries a placed location into the form', () => {
    expect(itemFormFromDraft({ ...timedDraft, placeId: 'p1' }).place).toEqual({ placeId: 'p1', label: 'Torsby' });
  });

  it('keeps an all-day draft on its dates', () => {
    const form = itemFormFromDraft({ ...timedDraft, isAllDay: true, startsAt: null, startDate: '2026-10-06', endDate: '2026-10-07' });
    expect(form).toMatchObject({ isAllDay: true, startDay: '2026-10-06', endDay: '2026-10-07', startTime: '', endTime: '' });
  });

  const contactDraft: ContactDraft = {
    sourceKey: 'import-1', kind: 'Individual', givenName: 'Anna', familyName: 'Svensson', organization: 'Acme',
    channels: [{ medium: 'Phone', value: '+46 70 123', preferred: false }, { medium: 'Email', value: ' ', preferred: false }],
    birthday: { year: null, month: 7, day: 7 }, notes: 'Met at fika',
  };

  it('keeps a person\'s organization in the notes', () => {
    const { form, channels } = contactFormFromDraft(contactDraft);
    expect(form).toMatchObject({
      givenName: 'Anna', familyName: 'Svensson', kind: 'Individual', notes: 'Met at fika\n\nOrganization: Acme',
      birthdayYearKnown: false, birthdayMonth: '7', birthdayDay: '7',
    });
    expect(channels).toHaveLength(2);
  });

  it('names an organization-only draft after the organization', () => {
    const { form } = contactFormFromDraft({ ...contactDraft, kind: null, givenName: null, familyName: null, notes: null });
    expect(form).toMatchObject({ givenName: 'Acme', kind: 'Organization', notes: '' });
  });

  it('builds a create core with the non-empty channels', () => {
    const r = contactCoreFromDraft(contactDraft);
    expect(r.ok && r.value.channels).toEqual([{ medium: 'Phone', value: '+46 70 123', preferred: false }]);
  });

  it('rejects a draft without any name', () => {
    expect(contactCoreFromDraft({ ...contactDraft, givenName: null, familyName: null, organization: null }).ok).toBe(false);
  });
});
