import { contactNameError } from '@danbro96/lupira-domain-contacts/contactNames';
import { emptyItemForm, scheduleFromForm, parseList, type EditResult, type ItemForm } from '@lupira/cal-domain/itemForm';
import { birthdayFields, birthdayFromFields } from '@lupira/cal-domain/partialDate';
import { deviceTimeZone, eventZone, isoToWall } from '@lupira/cal-domain/zonedTime';
import type { CalendarMembership, ContactDoc, ItemAttendee, ItemDoc, ReachChannel } from './docTypes';
import type { ContactDraft, ItemDraft } from './drafts';
import type { ContactCore, ItemCore } from './ops';

/** Mirror doc ⇄ form ⇄ op-core translation: which empty field means "keep" (title/description/status/category
 *  have no REST clear) vs "clear" (the sentinel-backed schedule fields and tags). The form itself — defaults,
 *  schedule moves, validation — is `@lupira/cal-domain/itemForm`, shared with the web. Screens own only widgets
 *  and submission. */

/** A doc without a usable zone opens in the device's, and saving stamps that zone on it. */
export function itemFormFromDoc(doc: ItemDoc): ItemForm {
  const allDay = doc.isAllDay === true;
  const timeZone = (allDay ? deviceTimeZone() : eventZone(doc.startTimezone)) ?? '';
  const wall = (iso: string | null | undefined) => (!allDay && iso ? isoToWall(iso, timeZone) : { day: '', time: '' });
  const start = wall(doc.startsAt);
  const end = wall(doc.endsAt);
  return {
    title: doc.title ?? '',
    description: doc.description ?? '',
    status: doc.status ?? '',
    category: doc.category ?? '',
    tagsCsv: (doc.tags ?? []).join(', '),
    isAllDay: allDay,
    startDay: allDay ? (doc.startDate ?? '') : start.day,
    startTime: start.time,
    endDay: allDay ? (doc.endDate && doc.endDate >= (doc.startDate ?? '') ? doc.endDate : '') : end.day,
    endTime: end.time,
    recurrenceRule: doc.recurrenceRule ?? '',
    timeZone,
    place: doc.placeId ? { placeId: doc.placeId, label: doc.locationLabel ?? '' } : null,
  };
}

/** A draft opens as a new event; a timed draft without an end gets the new-event hour. A location without a
 *  place has no form field — the editor offers it as the hint for picking one. */
export function itemFormFromDraft(draft: ItemDraft): ItemForm {
  const text = {
    title: draft.title ?? '',
    description: draft.description ?? '',
    status: draft.status ?? '',
    category: draft.category ?? '',
    recurrenceRule: draft.recurrenceRule ?? '',
    place: draft.placeId ? { placeId: draft.placeId, label: draft.location ?? '' } : null,
  };
  if (draft.isAllDay) {
    return {
      ...emptyItemForm(), ...text, isAllDay: true,
      startDay: draft.startDate ?? '', endDay: draft.endDate ?? '', timeZone: deviceTimeZone() ?? '',
    };
  }
  const timeZone = eventZone(draft.startTimezone) ?? '';
  const start = draft.startsAt ? isoToWall(draft.startsAt, timeZone) : null;
  const end = draft.endsAt ? isoToWall(draft.endsAt, timeZone) : null;
  const form = emptyItemForm(start?.day, start?.time);
  return { ...form, ...text, endDay: end?.day ?? form.endDay, endTime: end?.time ?? form.endTime, timeZone };
}

export function itemCoreFromDraft(draft: ItemDraft): EditResult<ItemCore> {
  return itemCoreFromForm(itemFormFromDraft(draft));
}

/** `base` supplies the fields the form doesn't edit (parentItemId) so the whole-section write keeps them. */
export function itemCoreFromForm(form: ItemForm, base?: ItemDoc): EditResult<ItemCore> {
  const schedule = scheduleFromForm(form);
  if (!schedule.ok) return schedule;
  const { startTimezone, ...when } = schedule.value;
  return {
    ok: true,
    value: {
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      status: form.status || null,
      category: form.category || null,
      tags: parseList(form.tagsCsv),
      parentItemId: base?.parentItemId ?? null,
      ...when,
      startTimezone,
      endTimezone: startTimezone,
      recurrenceRule: form.recurrenceRule.trim() || null,
      placeId: form.place?.placeId ?? null,
      location: form.place?.label.trim() || null,
    },
  };
}

/** The doc's own core, verbatim — for one-field writes (cancel, restore) that must not touch the rest. */
export function coreOfDoc(doc: ItemDoc): ItemCore {
  return {
    title: doc.title ?? null,
    description: doc.description ?? null,
    status: doc.status ?? null,
    category: doc.category ?? null,
    tags: null,
    parentItemId: doc.parentItemId ?? null,
    isAllDay: doc.isAllDay === true,
    startsAt: doc.startsAt ?? null,
    endsAt: doc.endsAt ?? null,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    startTimezone: doc.startTimezone ?? null,
    endTimezone: doc.startTimezone ?? null,
    recurrenceRule: doc.recurrenceRule ?? null,
  };
}

export function acceptedCalendarIds(memberships: CalendarMembership[]): string[] {
  return memberships.filter((m) => m.status === 'Accepted').map((m) => m.calendarId);
}

/** Selecting a proposed calendar accepts it; a proposal left unselected stays a proposal. */
export function filingChanges(memberships: CalendarMembership[], selected: string[]): { file: string[]; unfile: string[] } {
  const accepted = new Set(acceptedCalendarIds(memberships));
  return {
    file: selected.filter((id) => !accepted.has(id)),
    unfile: [...accepted].filter((id) => !selected.includes(id)),
  };
}

export function attendeeChanges(attendees: ItemAttendee[], selected: string[]): { invite: string[]; uninvite: string[] } {
  const current = new Set(attendees.map((a) => a.contactId));
  return {
    invite: selected.filter((id) => !current.has(id)),
    uninvite: [...current].filter((id) => !selected.includes(id)),
  };
}

export function metadataInputOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** A key keeps its JSON type: text stays text, and anything else must parse — editing `3` must not store "3". */
export function metadataValueFromInput(input: string, previous: unknown): EditResult<unknown> {
  if (previous === undefined || typeof previous === 'string') return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch {
    return { ok: false, error: 'This key holds JSON — enter a valid JSON value' };
  }
}

export type ContactForm = {
  givenName: string;
  middleName: string;
  familyName: string;
  nickname: string;
  displayNameFormat: string;   // '' = keep unset
  kind: string;
  /** Two input shapes: with a known year, `birthday` holds 'yyyy-MM-dd' (date picker); without one,
   *  month/day live in their own fields and no fake year ever exists anywhere. */
  birthday: string;
  birthdayYearKnown: boolean;
  birthdayMonth: string;       // '1'..'12' when the year is unknown
  birthdayDay: string;         // '1'..'31'
  notes: string;
  pronouns: string;
};

export function emptyContactForm(): ContactForm {
  return {
    givenName: '', middleName: '', familyName: '', nickname: '', displayNameFormat: '', kind: '',
    birthday: '', birthdayYearKnown: true, birthdayMonth: '', birthdayDay: '', notes: '', pronouns: '',
  };
}

export function contactFormFromDoc(doc: ContactDoc): ContactForm {
  const b = birthdayFields(doc.birthday);
  return {
    givenName: doc.givenName ?? '',
    middleName: doc.middleName ?? '',
    familyName: doc.familyName ?? '',
    nickname: doc.nickname ?? '',
    displayNameFormat: doc.displayNameFormat ?? '',
    kind: doc.kind ?? '',
    birthday: b.date,
    birthdayYearKnown: b.yearKnown,
    birthdayMonth: b.month,
    birthdayDay: b.day,
    notes: doc.notes ?? '',
    pronouns: doc.pronouns ?? '',
  };
}

/** Channels and tags stay null here — ReviseContact UNION-merges them (adds, never removes), so editing
 *  them goes through the wholesale contact.channels / contact.tags ops instead. */
export function contactCoreFromForm(form: ContactForm): EditResult<ContactCore> {
  const nameError = contactNameError(form);
  if (nameError) return { ok: false, error: nameError };
  return {
    ok: true,
    value: {
      givenName: form.givenName.trim() || null,
      middleName: form.middleName.trim() || null,
      familyName: form.familyName.trim() || null,
      nickname: form.nickname.trim() || null,
      displayNameFormat: form.displayNameFormat || null,
      kind: form.kind || null,
      // null = keep (no REST clear).
      birthday: birthdayFromFields({
        yearKnown: form.birthdayYearKnown, date: form.birthday, month: form.birthdayMonth, day: form.birthdayDay,
      }),
      notes: form.notes.trim() || null,
      pronouns: form.pronouns.trim() || null,
      channels: null,
      tags: null,
    },
  };
}

/** Contacts have no organization field: an organization alone makes an Organization contact named after it,
 *  and a person's employer is kept in the notes. */
export function contactFormFromDraft(draft: ContactDraft): { form: ContactForm; channels: ReachChannel[] } {
  const named = !!(draft.givenName || draft.familyName || draft.nickname);
  const organizationOnly = !named && !!draft.organization;
  const employer = named && draft.kind !== 'Organization' ? draft.organization : null;
  const birthday = birthdayFields(draft.birthday && { ...draft.birthday, year: draft.birthday.year ?? null });
  return {
    form: {
      ...emptyContactForm(),
      givenName: (organizationOnly ? draft.organization : draft.givenName) ?? '',
      middleName: draft.middleName ?? '',
      familyName: draft.familyName ?? '',
      nickname: draft.nickname ?? '',
      displayNameFormat: 'FirstLast',
      kind: organizationOnly ? 'Organization' : (draft.kind ?? ''),
      birthday: birthday.date,
      birthdayYearKnown: birthday.yearKnown,
      birthdayMonth: birthday.month,
      birthdayDay: birthday.day,
      notes: [draft.notes, employer && `Organization: ${employer}`].filter(Boolean).join('\n\n'),
      pronouns: draft.pronouns ?? '',
    },
    channels: draft.channels.map((ch) => ({ ...ch })),
  };
}

export function contactCoreFromDraft(draft: ContactDraft): EditResult<ContactCore> {
  const { form, channels } = contactFormFromDraft(draft);
  const core = contactCoreFromForm(form);
  return core.ok ? { ok: true, value: { ...core.value, channels: channels.filter((ch) => ch.value.trim()) } } : core;
}
