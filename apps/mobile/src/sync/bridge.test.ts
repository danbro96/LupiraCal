import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db: Db;
const calls: string[] = [];
const native = vi.hoisted(() => ({
  bridgeSyncNow: vi.fn(),
  ensureAccount: vi.fn(),
  removeAccount: vi.fn(),
}));

vi.mock('../../modules/lupira-bridge/src', () => ({ LupiraBridge: native }));
vi.mock('../data/db/expoDb', () => ({ getDb: () => Promise.resolve(db) }));
vi.mock('../data/queries/bridgeSnapshot', () => ({
  bridgeSnapshot: () => Promise.resolve({ calendars: [], items: [{ id: 'i1', state: '{}' }], contacts: [], residencies: [] }),
}));
vi.mock('../data/ids', () => ({ deterministicIdFor: vi.fn() }));
vi.mock('./queryClient', () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));

type Bridge = typeof import('./bridge');
type Meta = typeof import('./meta');
let bridge: Bridge;
let meta: Meta;

beforeEach(async () => {
  vi.resetModules();
  db = openNodeDb();
  calls.length = 0;
  native.bridgeSyncNow.mockReset().mockImplementation((snapshot: string | null, generation: string) => {
    calls.push(`sync ${snapshot ? 'snapshot' : 'null'} ${generation}`);
    return Promise.resolve('ok');
  });
  native.ensureAccount.mockReset().mockImplementation((generation: string) => {
    calls.push(`ensure ${generation}`);
    return Promise.resolve('ok');
  });
  native.removeAccount.mockReset().mockImplementation((generation: string) => {
    calls.push(`remove ${generation}`);
    return Promise.resolve(true);
  });
  bridge = await import('./bridge');
  meta = await import('./meta');
  await meta.writeMeta(bridge.BRIDGE_ENABLED_KEY, '1');
});

const generation = () => meta.readMeta('bridge.generation');

describe('publishToBridge', () => {
  it('sends the snapshot once, then only the generation until the mirror changes', async () => {
    await bridge.publishToBridge();
    const gen = await generation();
    const [snapshot, sentGen] = native.bridgeSyncNow.mock.calls[0] as [string, string];
    expect(sentGen).toBe(gen);
    expect(JSON.parse(snapshot)).toMatchObject({ generation: gen, items: [{ id: 'i1' }] });

    await bridge.publishToBridge();
    bridge.markBridgeDirty();
    await bridge.publishToBridge();
    expect(calls).toEqual([`sync snapshot ${gen}`, `sync null ${gen}`, `sync snapshot ${gen}`]);
  });

  it('resends the snapshot when native has none of this generation', async () => {
    await bridge.publishToBridge();
    native.bridgeSyncNow.mockImplementationOnce((snapshot: string | null, generation: string) => {
      calls.push(`sync ${snapshot ? 'snapshot' : 'null'} ${generation}`);
      return Promise.resolve('snapshotNeeded');
    });
    await bridge.publishToBridge();
    const gen = await generation();
    expect(calls).toEqual([`sync snapshot ${gen}`, `sync null ${gen}`, `sync snapshot ${gen}`]);
  });

  it('keeps the snapshot owed when sending it fails', async () => {
    native.bridgeSyncNow.mockRejectedValueOnce(new Error('provider down'));
    await expect(bridge.publishToBridge()).rejects.toThrow('provider down');
    await bridge.publishToBridge();
    expect(calls).toEqual([`sync snapshot ${await generation()}`]);
  });

  it('resets native when it holds a generation this install never wrote', async () => {
    native.bridgeSyncNow.mockResolvedValueOnce('stale');
    native.ensureAccount.mockResolvedValueOnce('stale');
    await bridge.publishToBridge();
    const gen = await generation();
    expect(calls).toEqual([`remove ${gen}`, `ensure ${gen}`]);
    await bridge.publishToBridge();
    expect(calls.at(-1)).toBe(`sync snapshot ${gen}`);
  });
});

describe('resetBridge', () => {
  it('removes before re-adding under a new generation and keeps the integration on', async () => {
    await bridge.publishToBridge();
    const before = await generation();
    calls.length = 0;

    await bridge.resetBridge();
    const after = await generation();
    expect(after).not.toBe(before);
    expect(calls).toEqual([`remove ${after}`, `ensure ${after}`]);
    expect(await meta.readMeta(bridge.BRIDGE_ENABLED_KEY)).toBe('1');

    await bridge.publishToBridge();
    expect(calls.at(-1)).toBe(`sync snapshot ${after}`);
  });

  it('only rotates the generation while the integration is off', async () => {
    await meta.writeMeta(bridge.BRIDGE_ENABLED_KEY, '0');
    await meta.writeMeta('bridge.generation', 'g1');
    await bridge.resetBridge();
    expect(await generation()).not.toBe('g1');
    expect(calls).toEqual([]);
  });
});
