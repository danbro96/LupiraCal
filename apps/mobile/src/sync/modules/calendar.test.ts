import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { ContainerDto } from '@lupira/cal-api/models';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarModule } from './calendar';

vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));

const calendar = (id: string, kind: string) => ({ id, kind, type: 'calendar', slug: id, access: 'Owner' }) as ContainerDto;

let db: Db;
let snapshot: ContainerDto[];

const module = {
  ...calendarModule,
  feed: { ...calendarModule.feed, fetch: async () => ({ cursor: '', hasMore: false, reset: true, changed: snapshot, deleted: [] }) },
};

beforeEach(() => {
  db = openNodeDb();
});

describe('calendar module', () => {
  it('indexes calendar kinds and prunes a calendar the next snapshot leaves out', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: () => {} });
    snapshot = [calendar('mine', 'Personal'), calendar('away', 'Availability')];
    await e.sync();
    expect(await db.all('SELECT id, kind FROM calendar_index ORDER BY id')).toEqual([
      { id: 'away', kind: 'Availability' }, { id: 'mine', kind: 'Personal' },
    ]);

    snapshot = [calendar('mine', 'Personal')];
    await e.sync();
    expect(await db.all('SELECT id FROM calendar_index')).toEqual([{ id: 'mine' }]);
  });
});
