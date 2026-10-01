import type { CalendarKindName } from './kinds.ts';

export type ItemCategoryName =
  | 'General'
  | 'Meeting'
  | 'Appointment'
  | 'Meal'
  | 'Occasion'
  | 'Outing'
  | 'Trip'
  | 'Stay'
  | 'Activity'
  | 'Focus'
  | 'Chore';

/**
 * Concept names, not glyphs — this package stays dependency-free, so it cannot hold components.
 * Each surface resolves these through its own `ui/icons.ts`: web to `@mui/icons-material`,
 * mobile to `MaterialIcons`. Both resolvers are `Record<IconName, …>`, so adding a name here
 * fails their builds until they map it.
 */
export type IconName =
  | 'cake'
  | 'calendar'
  | 'celebration'
  | 'checkBox'
  | 'cleaning'
  | 'event'
  | 'group'
  | 'hotel'
  | 'inbox'
  | 'luggage'
  | 'medical'
  | 'person'
  | 'photo'
  | 'restaurant'
  | 'robot'
  | 'run'
  | 'saved'
  | 'schedule'
  | 'target'
  | 'timeline'
  | 'tools'
  | 'walk';

export const CALENDAR_KIND_ICONS: Record<CalendarKindName, IconName> = {
  Personal: 'person',
  Group: 'group',
  Birthdays: 'cake',
  Availability: 'schedule',
  Inbox: 'inbox',
  LlmPrompts: 'robot',
  UserCheckIn: 'checkBox',
  DevOps: 'tools',
  FoodPlan: 'restaurant',
  Generic: 'calendar',
};

export const ITEM_CATEGORY_ICONS: Record<ItemCategoryName, IconName> = {
  General: 'event',
  Meeting: 'group',
  Appointment: 'medical',
  Meal: 'restaurant',
  Occasion: 'celebration',
  Outing: 'walk',
  Trip: 'luggage',
  Stay: 'hotel',
  Activity: 'run',
  Focus: 'target',
  Chore: 'cleaning',
};
