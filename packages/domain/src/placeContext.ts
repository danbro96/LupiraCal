import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import type { ItemCategory } from './itemCategory';

/** What a place is being picked for; it decides what is predicted and how a pin must be named. */
export type PlaceContext =
  | { kind: 'event'; category: ItemCategory; attendeeIds: string[]; day: string; origin?: GeoPoint }
  | { kind: 'residency'; contactId: string; householdContactIds: string[] }
  | { kind: 'free'; near?: GeoPoint };

/** An event's pin needs a name to read as its location; a contact's address is named by the server. */
export function pinNameRequired(ctx: PlaceContext): boolean {
  return ctx.kind === 'event';
}
