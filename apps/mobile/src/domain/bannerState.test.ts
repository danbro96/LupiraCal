import { describe, expect, it } from 'vitest';
import { BULK_SYNC_COUNT, bannerState, type BannerInput } from './bannerState';
import { PHASE_LABELS } from './syncPhase';

const healthy: BannerInput = {
  syncing: false,
  serverReachable: true,
  pending: 0,
  parked: 0,
  lastError: null,
  progress: null,
};
const state = (over: Partial<BannerInput> = {}) => bannerState({ ...healthy, ...over }, PHASE_LABELS);

describe('bannerState', () => {
  it('says nothing when there is nothing to report', () => {
    expect(state()).toBeNull();
  });

  it('reports the phase and count while syncing', () => {
    expect(state({ syncing: true, progress: { phase: 'items', count: 12 } })).toMatchObject({
      kind: 'syncing',
      text: 'Syncing — 12 events…',
    });
  });

  it('keeps a routine sync quiet and gives a bulk one its strip', () => {
    expect(state({ syncing: true, progress: null })?.quiet).toBe(true);
    expect(state({ syncing: true, progress: { phase: 'items', count: BULK_SYNC_COUNT - 1 } })?.quiet).toBe(true);
    expect(state({ syncing: true, progress: { phase: 'items', count: BULK_SYNC_COUNT } })?.quiet).toBe(false);
    expect(state({ serverReachable: false })?.quiet).toBe(false);
  });

  it('falls back to a bare label before the first count arrives', () => {
    expect(state({ syncing: true, progress: { phase: 'items', count: 0 } })?.text).toBe('Syncing…');
    expect(state({ syncing: true, progress: null })?.text).toBe('Syncing…');
  });

  it('counts queued changes while offline, and pluralises', () => {
    expect(state({ serverReachable: false })?.text).toBe('Offline');
    expect(state({ serverReachable: false, pending: 1 })?.text).toBe('Offline — 1 change queued');
    expect(state({ serverReachable: false, pending: 3 })?.text).toBe('Offline — 3 changes queued');
  });

  it('surfaces parked changes once the server is reachable again', () => {
    expect(state({ parked: 1 })).toMatchObject({ kind: 'parked', text: '1 change needs attention' });
    expect(state({ parked: 2 })?.text).toBe('2 changes need attention');
  });

  it('surfaces a sync error that left nothing pending', () => {
    expect(state({ lastError: 'boom' })).toMatchObject({ kind: 'error', text: 'Sync problem — tap for details' });
  });

  it('prefers in-progress sync over every other state', () => {
    const s = state({ syncing: true, serverReachable: false, parked: 4, lastError: 'boom' });
    expect(s?.kind).toBe('syncing');
  });

  it('prefers offline over parked and error', () => {
    expect(state({ serverReachable: false, parked: 4, lastError: 'boom' })?.kind).toBe('offline');
  });
});
