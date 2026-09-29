// Local string unions, not generated DTO types (purity). Consumers re-type these records against the
// API enums — a compile error at that assignment is the drift tripwire.
export type CalendarKindName =
  | 'Personal'
  | 'Group'
  | 'Birthdays'
  | 'Availability'
  | 'Inbox'
  | 'LlmPrompts'
  | 'UserCheckIn'
  | 'DevOps'
  | 'FoodPlan'
  | 'Generic';

export type AvailabilityStatusName = 'Office' | 'Home' | 'Vacation' | 'Sick' | 'Leave';

/** Fallback calendar colors by kind (used when the container has no stored color). */
export const KIND_COLORS: Record<CalendarKindName, string> = {
  Personal: '#1d6feb',
  Group: '#0e7490',
  Birthdays: '#db2777',
  Availability: '#16a34a',
  Inbox: '#6b7280',
  LlmPrompts: '#9333ea',
  UserCheckIn: '#ea580c',
  DevOps: '#475569',
  FoodPlan: '#65a30d',
  Generic: '#64748b',
};

export const AVAILABILITY_COLORS: Record<AvailabilityStatusName, string> = {
  Office: '#2563eb',
  Home: '#16a34a',
  Vacation: '#f59e0b',
  Sick: '#dc2626',
  Leave: '#9333ea',
};

/** Narrows the free-form status strings carried by mirror rows and DTOs. */
export function isAvailabilityStatus(s: string | null | undefined): s is AvailabilityStatusName {
  return s != null && s in AVAILABILITY_COLORS;
}

const UNKNOWN_AVAILABILITY = '#94a3b8';

/** A status's band colour; a status this build doesn't know yet draws neutral rather than not at all. */
export function availabilityColor(status: string | null | undefined): string {
  return isAvailabilityStatus(status) ? AVAILABILITY_COLORS[status] : UNKNOWN_AVAILABILITY;
}

const isKind = (k: string | null | undefined): k is CalendarKindName => k != null && k in KIND_COLORS;

/** A calendar's colour: its own when it set one, else its kind's. Both apps draw with this one rule, so a
 *  calendar — and the birthdays it carries — is the same colour everywhere. */
export function calendarColor(c: { color?: string | null; kind?: string | null } | null | undefined): string {
  return c?.color || (isKind(c?.kind) ? KIND_COLORS[c.kind] : KIND_COLORS.Generic);
}

/** Accents for parent/child item families — a separate color channel from calendar colors. */
export const FAMILY_ACCENTS = [
  '#e11d48', // rose
  '#d97706', // amber
  '#7c3aed', // violet
  '#059669', // emerald
  '#c026d3', // fuchsia
  '#0284c7', // sky
  '#ca8a04', // dark yellow
  '#dc2626', // red
] as const;

export function familyAccent(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;
  return FAMILY_ACCENTS[h % FAMILY_ACCENTS.length];
}

/** Contact avatar fills, picked per id so a person keeps their colour. */
export const AVATAR_COLORS = [
  '#4457c2',
  '#0e7490',
  '#b45309',
  '#15803d',
  '#a21caf',
  '#be123c',
  '#4d7c0f',
  '#0f766e',
] as const;

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
