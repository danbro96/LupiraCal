// cal-api's ItemCategory names in declaration order — the server's tie-break order; consumers re-type against the enum.
export const ITEM_CATEGORIES = [
  'General', 'Meeting', 'Appointment', 'Meal', 'Occasion', 'Outing', 'Trip', 'Stay', 'Activity', 'Focus', 'Chore',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export function isItemCategory(value: string | null | undefined): value is ItemCategory {
  return (ITEM_CATEGORIES as readonly (string | null | undefined)[]).includes(value);
}
