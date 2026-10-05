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
  me: 'contact.me',
  taskList: 'tasks.list',
  taskItem: 'tasks.item',
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
  [Aggregate.taskList]: 'task lists',
  [Aggregate.taskItem]: 'tasks',
};
