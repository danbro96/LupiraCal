import { deviceTimeZone, isoToWall } from '@lupira/cal-domain/zonedTime';
import type { ReachChannel } from './docTypes';

/** An event proposed from outside — another app's "add to calendar" or a shared file — before it is saved.
 *  Timed drafts carry instants, all-day drafts dates (end inclusive). */
export type ItemDraft = {
  /** Stable across re-imports of the same event, so importing twice lands on one item. */
  sourceKey?: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  category?: string | null;
  isAllDay: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startTimezone?: string | null;
  recurrenceRule?: string | null;
  location?: string | null;
  /** Set once `location` matched a place. */
  placeId?: string | null;
};

export type PlaceCandidate = { id: string; name: string };

/** A contact proposed from outside. An Organization carries its name in `givenName`; a person's
 *  `organization` is their employer. */
export type ContactDraft = {
  sourceKey?: string;
  kind?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
  organization?: string | null;
  channels: ReachChannel[];
  birthday?: { year?: number | null; month: number; day: number } | null;
  notes?: string | null;
  pronouns?: string | null;
};

/** The `draft/event` deep link's query: times as epoch ms, `allDay` as 'true'/'false'. */
export type ItemDraftLink = {
  begin?: string;
  end?: string;
  allDay?: string;
  title?: string;
  location?: string;
  description?: string;
  recurrence?: string;
};

export type ContactDraftLink = {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
};

const ITEM_LINK_KEYS: (keyof ItemDraftLink)[] = ['begin', 'end', 'allDay', 'title', 'location', 'description', 'recurrence'];
const CONTACT_LINK_KEYS: (keyof ContactDraftLink)[] = ['name', 'phone', 'email', 'company', 'notes'];

/** null when the params carry no draft (a plain "new event"). */
export function itemDraftFromLink(params: ItemDraftLink, zone: string | null = deviceTimeZone()): ItemDraft | null {
  if (!ITEM_LINK_KEYS.some((k) => params[k])) return null;
  const begin = epochMs(params.begin);
  const end = epochMs(params.end);
  const isAllDay = params.allDay === 'true';
  const day = (ms: number) => isoToWall(new Date(ms).toISOString(), zone).day;
  const base = {
    title: text(params.title),
    description: text(params.description),
    location: text(params.location),
    startTimezone: isAllDay ? null : zone,
    recurrenceRule: text(params.recurrence),
  };
  if (isAllDay) {
    const startDate = begin === null ? null : day(begin);
    // The sender's end is exclusive (the next midnight); ours is the last day.
    const endDate = begin !== null && end !== null && end > begin ? day(end - 1) : startDate;
    return { ...base, isAllDay, startsAt: null, endsAt: null, startDate, endDate };
  }
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  return {
    ...base,
    isAllDay,
    startsAt: iso(begin),
    endsAt: begin !== null && end !== null && end > begin ? iso(end) : null,
    startDate: null,
    endDate: null,
  };
}

/** A single name string splits on its last word: "Anna Maria Svensson" → given "Anna Maria", family "Svensson". */
export function contactDraftFromLink(params: ContactDraftLink): ContactDraft | null {
  if (!CONTACT_LINK_KEYS.some((k) => params[k])) return null;
  const words = (params.name ?? '').trim().split(/\s+/).filter(Boolean);
  const channels: ReachChannel[] = [];
  if (text(params.phone)) channels.push({ medium: 'Phone', value: params.phone!.trim(), preferred: false });
  if (text(params.email)) channels.push({ medium: 'Email', value: params.email!.trim(), preferred: false });
  return {
    givenName: (words.length > 1 ? words.slice(0, -1).join(' ') : words[0]) ?? null,
    middleName: null,
    familyName: words.length > 1 ? words[words.length - 1] : null,
    nickname: null,
    organization: text(params.company),
    channels,
    birthday: null,
    notes: text(params.notes),
  };
}

/** The part of a location text that names the place: "Torsby bibliotek, Storgatan 1" → "Torsby bibliotek". */
export function locationName(location: string): string {
  return location.split(',')[0].trim();
}

/** A location is only kept with a place: a candidate with the location's name places the draft, otherwise the
 *  text moves into the description. */
export function withResolvedLocation(draft: ItemDraft, candidates: PlaceCandidate[]): ItemDraft {
  const location = draft.location?.trim();
  if (!location) return { ...draft, location: null };
  const name = locationName(location).toLocaleLowerCase();
  const place = candidates.find((c) => c.name.trim().toLocaleLowerCase() === name);
  if (place) return { ...draft, placeId: place.id, location: place.name };
  const description = [draft.description?.trim(), `Location: ${location}`].filter(Boolean).join('\n\n');
  return { ...draft, location: null, placeId: null, description };
}

function text(value: string | undefined): string | null {
  return value?.trim() || null;
}

function epochMs(value: string | undefined): number | null {
  const ms = value ? Number(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
