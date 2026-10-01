import type { AvailabilityStatus, CalendarKind, ContainerDto, ItemCategory, ParticipationStatus } from '@lupira/cal-api/models';
import {
  AVAILABILITY_COLORS as TOKEN_AVAILABILITY_COLORS,
  FAMILY_ACCENTS,
  KIND_COLORS as TOKEN_KIND_COLORS,
  calendarColor as tokenCalendarColor,
  familyAccent,
} from '@lupira/cal-tokens/kinds';
import {
  CALENDAR_KIND_ICONS as TOKEN_CALENDAR_KIND_ICONS,
  ITEM_CATEGORY_ICONS as TOKEN_ITEM_CATEGORY_ICONS,
  type IconName,
} from '@lupira/cal-tokens/icons';
import type { SvgIconComponent } from '@mui/icons-material';
import * as Icons from '../icons';

// Re-typing the token records against the generated enums is the drift tripwire: when the API adds a
// kind/status/category the tokens package doesn't know, these assignments stop compiling.
export const KIND_COLORS: Record<CalendarKind, string> = TOKEN_KIND_COLORS;
export const CALENDAR_KIND_ICONS: Record<CalendarKind, IconName> = TOKEN_CALENDAR_KIND_ICONS;
export const ITEM_CATEGORY_ICONS: Record<ItemCategory, IconName> = TOKEN_ITEM_CATEGORY_ICONS;

// The second half of the tripwire: a concept named in tokens that nothing here resolves is a
// compile error, not a glyph that silently fails to render.
export const ICON_BY_NAME: Record<IconName, SvgIconComponent> = {
  cake: Icons.CakeIcon,
  calendar: Icons.CalendarIcon,
  celebration: Icons.CelebrationIcon,
  checkBox: Icons.CheckboxIcon,
  cleaning: Icons.CleaningIcon,
  event: Icons.EventIcon,
  group: Icons.GroupIcon,
  hotel: Icons.HotelIcon,
  inbox: Icons.InboxIcon,
  luggage: Icons.LuggageIcon,
  medical: Icons.MedicalIcon,
  person: Icons.PersonIcon,
  photo: Icons.PhotoIcon,
  restaurant: Icons.RestaurantIcon,
  robot: Icons.RobotIcon,
  run: Icons.RunIcon,
  saved: Icons.SavedPlaceIcon,
  schedule: Icons.ScheduleIcon,
  target: Icons.TargetIcon,
  timeline: Icons.TimelineIcon,
  tools: Icons.ToolsIcon,
  walk: Icons.WalkIcon,
};
export const AVAILABILITY_COLORS: Record<AvailabilityStatus, string> = TOKEN_AVAILABILITY_COLORS;
export { FAMILY_ACCENTS, familyAccent };

export function calendarColor(c: ContainerDto): string {
  return tokenCalendarColor(c);
}

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  NeedsAction: 'invited',
  Accepted: 'accepted',
  Declined: 'declined',
  Tentative: 'tentative',
  Delegated: 'delegated',
};
