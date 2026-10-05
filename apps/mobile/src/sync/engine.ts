import { invalidateOnChange } from '@danbro96/lupira-expo-query/invalidateOnChange';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import * as Sentry from '@sentry/react-native';
import { getDb } from '../data/db/expoDb';
import { Aggregate } from '../domain/aggregates';
import { bridgePublish, drainBridgeInbox } from './bridge';
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
import { taskItemModule } from './modules/taskItem';
import { taskListModule } from './modules/taskList';
import { queryClient } from './queryClient';

export const SYNC_TASK = 'lupira-calendar-sync';

/** Reads that join across aggregates: the grids show items and birthdays (and calendar kinds), and relationship and
 *  residency rows carry contact names. */
const DERIVED_ROOTS = {
  [Aggregate.item]: ['occurrences'],
  [Aggregate.calendar]: ['occurrences'],
  [Aggregate.contact]: ['occurrences', Aggregate.relationship, Aggregate.residency],
};

export const engine = createSyncEngine({
  openDb: getDb,
  modules: [
    calendarModule, addressBookModule, contactGroupModule, calItemModule, contactModule,
    relationshipModule, residencyModule, placeEntryModule, taskListModule, taskItemModule, meModule,
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
    },
  },
  onChange: invalidateOnChange(queryClient, DERIVED_ROOTS),
});

// Offline is expected; any other sync failure is invisible off the phone without this.
let reportedError: string | null = null;
engine.status.subscribe(() => {
  const { lastError, serverReachable } = engine.status.getSnapshot();
  if (lastError && serverReachable && lastError !== reportedError) Sentry.captureMessage(lastError, { tags: { area: 'sync' } });
  reportedError = lastError;
});

/** The database once the kernel has created its tables and the modules' index tables. */
export async function readyDb(): Promise<Db> {
  await engine.ready();
  return getDb();
}
