import { invalidateOnChange } from '@danbro96/lupira-expo-query/invalidateOnChange';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import * as Sentry from '@sentry/react-native';
import { getDb } from '../data/db/expoDb';
import { expoNotificationPort } from '../data/notifications/port';
import { residencyPlaceIds } from '../data/queries/residencies';
import { Aggregate } from '../domain/aggregates';
import { bridgePublish, drainBridgeInbox, markBridgeDirty } from './bridge';
import { createSyncFailureReporter } from './failureReporter';
import { maintainHorizon } from './horizon';
import { addressBookModule } from './modules/addressBook';
import { calendarModule } from './modules/calendar';
import { calItemModule } from './modules/calItem';
import { contactModule } from './modules/contact';
import { contactGroupModule } from './modules/contactGroup';
import { meModule } from './modules/me';
import { placeEntryModule } from './modules/placeEntry';
import { relationshipModule } from './modules/relationship';
import { residencyModule } from './modules/residency';
import { residencyPlaceModule } from './modules/residencyPlace';
import { taskItemModule } from './modules/taskItem';
import { taskListModule } from './modules/taskList';
import { createNotifier } from './notifications';
import { queryClient } from './queryClient';

export const SYNC_TASK = 'lupira-calendar-sync';

/** Reads that join across aggregates: the grids show items and birthdays (and calendar kinds), and relationship and
 *  residency rows carry contact names. */
const DERIVED_ROOTS = {
  [Aggregate.item]: ['occurrences'],
  [Aggregate.calendar]: ['occurrences'],
  [Aggregate.contact]: ['occurrences', Aggregate.relationship, Aggregate.residency],
};

/** What reminders, summaries and RSVP prompts are planned from. */
const NOTIFY_SOURCES = new Set<string>([Aggregate.item, Aggregate.calendar, Aggregate.contact, Aggregate.me]);
/** What the bridge snapshot is read from. */
const BRIDGE_SOURCES = new Set<string>([Aggregate.calendar, Aggregate.item, Aggregate.contact, Aggregate.residency, Aggregate.residencyPlace]);
const invalidate = invalidateOnChange(queryClient, DERIVED_ROOTS);

export const engine = createSyncEngine({
  openDb: getDb,
  modules: [
    calendarModule, addressBookModule, contactGroupModule, calItemModule, contactModule,
    relationshipModule, residencyModule, placeEntryModule, taskListModule, taskItemModule, meModule,
    residencyPlaceModule(async () => residencyPlaceIds(await getDb())),
  ],
  cacheVersion: 1,
  hooks: {
    // Stock-app edits ride the same push as the app's own queued writes, and the stock apps get the fresh pull.
    beforePush: async () => {
      await drainBridgeInbox(engine);
    },
    afterPull: async () => {
      await maintainHorizon(engine);
      await bridgePublish();
      await drainBridgeInbox(engine);
      notifications.schedule();
    },
  },
  onChange: (event) => {
    invalidate(event);
    if (NOTIFY_SOURCES.has(event.aggregate)) notifications.schedule();
    if (BRIDGE_SOURCES.has(event.aggregate)) markBridgeDirty();
  },
  onFailure: createSyncFailureReporter(),
});

export const notifications = createNotifier({
  db: readyDb,
  port: expoNotificationPort,
  onError: (e) => Sentry.captureException(e, { tags: { area: 'notifications' } }),
});

/** The database once the kernel has created its tables and the modules' index tables. */
export async function readyDb(): Promise<Db> {
  await engine.ready();
  return getDb();
}
