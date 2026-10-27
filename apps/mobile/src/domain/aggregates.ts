/** The sync engine's module names; each is also the query-key root its mirror reads nest under. */
export const Aggregate = {
  item: 'cal.item',
  calendar: 'cal.calendar',
  contact: 'contact',
  addressBook: 'contact.addressBook',
  contactGroup: 'contact.group',
  relationship: 'contact.relationship',
  residency: 'contact.residency',
  placeEntry: 'contact.placeEntry',
  residencyPlace: 'geo.place',
  me: 'contact.me',
  taskList: 'tasks.list',
  taskItem: 'tasks.item',
  subscribedEvent: 'cal.subscribedEvent',
  holiday: 'cal.holiday',
} as const;

/** How the sync progress line names each aggregate's docs. */
export const AGGREGATE_LABELS: Record<string, string> = {
  [Aggregate.item]: 'events',
  [Aggregate.calendar]: 'calendars',
  [Aggregate.contact]: 'contacts',
  [Aggregate.addressBook]: 'address books',
  [Aggregate.contactGroup]: 'groups',
  [Aggregate.relationship]: 'relationships',
  [Aggregate.residency]: 'addresses',
  [Aggregate.placeEntry]: 'entry codes',
  [Aggregate.residencyPlace]: 'address places',
  [Aggregate.taskList]: 'task lists',
  [Aggregate.taskItem]: 'tasks',
  [Aggregate.subscribedEvent]: 'subscribed events',
  [Aggregate.holiday]: 'holidays',
};
