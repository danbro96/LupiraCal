import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyContactGuards, emptyItemGuards } from '../../domain/docTypes';
import { calendarModule } from './calendar';
import { calItemModule } from './calItem';
import { contactModule } from './contact';

vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));

/** The contract MirrorReader.kt reads: these view columns, and the doc fields under `$.doc` of `state`. */

const snapshotOf = <M extends AggregateModule>(module: M, changed: unknown[]): M =>
  ({ ...module, feed: { ...module.feed, fetch: async () => ({ cursor: '', hasMore: false, reset: true, changed, deleted: [] }) } });

let db: Db;

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  const engine = createSyncEngine({
    openDb: async () => db,
    cacheVersion: 1,
    onChange: () => {},
    modules: [
      snapshotOf(calendarModule as AggregateModule, [{ id: 'cal-1', displayName: 'Family', color: '#4457C2', kind: 'Personal' }]),
      snapshotOf(calItemModule as AggregateModule, [{
        item: { id: 'i1', title: 'Picnic', isAllDay: false, startsAt: '2026-08-10T09:00:00Z', calendars: [{ calendarId: 'cal-1', status: 'Accepted' }] },
        guards: emptyItemGuards(),
      }]),
      snapshotOf(contactModule as AggregateModule, [{
        contact: { id: 'c1', addressBookId: 'ab', givenName: 'Anna', channels: [{ medium: 'Phone', value: '070', preferred: true }] },
        guards: emptyContactGuards(),
      }]),
    ],
  });
  await engine.sync();
});

afterEach(() => vi.useRealTimers());

const columns = async (view: string) => (await db.all<{ name: string }>(`PRAGMA table_info(${view})`)).map((c) => c.name);
const docOf = (state: string) => (JSON.parse(state) as { doc: Record<string, unknown> }).doc;

describe('bridge views', () => {
  it('expose the columns MirrorReader.kt selects', async () => {
    expect(await columns('bridge_calendars')).toEqual(['id', 'state']);
    expect(await columns('bridge_items')).toEqual(['id', 'state']);
    expect(await columns('bridge_contacts')).toEqual(['id', 'display_name', 'state']);
  });

  it('carry each doc under $.doc with the fields the publishers read', async () => {
    const [calendar] = await db.all<{ id: string; state: string }>('SELECT id, state FROM bridge_calendars');
    expect(docOf(calendar.state)).toMatchObject({ displayName: 'Family', color: '#4457C2' });

    const [item] = await db.all<{ id: string; state: string }>('SELECT id, state FROM bridge_items');
    expect(docOf(item.state)).toMatchObject({ title: 'Picnic', isAllDay: false, startsAt: '2026-08-10T09:00:00Z', calendars: [{ status: 'Accepted' }] });

    const [contact] = await db.all<{ id: string; display_name: string; state: string }>('SELECT id, display_name, state FROM bridge_contacts');
    expect(contact.display_name).toBe('Anna');
    expect(docOf(contact.state)).toMatchObject({ givenName: 'Anna', channels: [{ medium: 'Phone', value: '070' }] });
  });
});
