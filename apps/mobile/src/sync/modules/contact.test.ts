import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { ApiError } from '@danbro96/lupira-http/apiError';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { ChangeEvent } from '@danbro96/lupira-sync-engine/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientOp } from '../../domain/ops';
import { contactModule } from './contact';

const at = (n: number) => ({
  commandId: `0198c0de-0000-7000-8000-${String(n).padStart(12, '0')}`, occurredAt: `2026-08-01T12:0${n}:00.000Z`,
  aggregate: 'contact' as const, aggregateId: 'anna',
});
const create: ClientOp = {
  kind: 'contact.create', contactId: 'anna', sourceKey: 'k', addressBookId: 'ab',
  core: { givenName: 'Anna', familyName: 'Berg', birthday: { year: null, month: 8, day: 11 } }, ...at(1),
};
const moveBirthday: ClientOp = { kind: 'contact.revise', contactId: 'anna', core: { birthday: { year: null, month: 9, day: 2 } }, ...at(2) };

let db: Db;
let events: ChangeEvent[];

const module = {
  ...contactModule,
  replay: async () => {
    throw new ApiError(0, 'offline');
  },
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-08-01T00:00:00Z'), toFake: ['Date'] });
  db = openNodeDb();
  events = [];
});

afterEach(() => vi.useRealTimers());

describe('contact module', () => {
  it('indexes the display name and re-derives birthdays when one is edited offline', async () => {
    const e = createSyncEngine({ openDb: async () => db, modules: [module], cacheVersion: 1, onChange: (ev) => events.push(ev) });
    await e.enqueue(create);
    await e.enqueue(moveBirthday);
    await e.push();

    expect(await db.all('SELECT display_name FROM contact_index')).toEqual([{ display_name: 'Anna Berg' }]);
    const days = await db.all<{ start_day: string }>('SELECT start_day FROM birthday_occurrences ORDER BY start_day');
    expect(days.map((d) => d.start_day.slice(5))).toEqual(['09-02', '09-02', '09-02']);
    expect(events.at(-1)).toEqual({ aggregate: 'contact', ids: ['anna'], origin: 'local' });
  });
});
