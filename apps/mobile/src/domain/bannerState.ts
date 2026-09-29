import type { SyncPhase } from './syncPhase';

// Pure derivation of the sync banner from the status store, kept framework-free so it can be
// unit-tested. Priority: in-progress sync → server reachability → parked changes → last sync error.
// Mirrors LupiraTasksMobile's domain/bannerState.ts; the inputs differ because this app parks
// changes rather than failing them, and reports a phase while syncing.

export interface BannerInput {
  syncing: boolean;
  serverReachable: boolean;
  pending: number;
  parked: number;
  /** Last sync/replay error message; surfaces a generic error banner when nothing higher applies. */
  lastError: string | null;
  progress: { phase: SyncPhase; count: number } | null;
}

export type BannerKind = 'syncing' | 'offline' | 'parked' | 'error';

export interface BannerState {
  kind: BannerKind;
  text: string;
  /** Show only an activity line, no strip: a routine sync is not worth a row of the screen. */
  quiet: boolean;
}

/** Past this many items a sync is a bulk one (first or full): long enough that its count is worth a strip.
 *  Routine delta syncs move a handful. */
export const BULK_SYNC_COUNT = 100;

const plural = (n: number) => (n === 1 ? '' : 's');

export function bannerState(s: BannerInput, phaseLabels: Record<SyncPhase, string>): BannerState | null {
  if (s.syncing) {
    const p = s.progress;
    return {
      kind: 'syncing',
      text: p && p.count > 0 ? `Syncing — ${p.count} ${phaseLabels[p.phase]}…` : 'Syncing…',
      quiet: !p || p.count < BULK_SYNC_COUNT,
    };
  }
  if (!s.serverReachable) {
    return {
      kind: 'offline',
      text: s.pending > 0 ? `Offline — ${s.pending} change${plural(s.pending)} queued` : 'Offline',
      quiet: false,
    };
  }
  if (s.parked > 0) {
    return { kind: 'parked', text: `${s.parked} change${plural(s.parked)} need${s.parked === 1 ? 's' : ''} attention`, quiet: false };
  }
  if (s.lastError) {
    return { kind: 'error', text: 'Sync problem — tap for details', quiet: false };
  }
  // Healthy: the banner says nothing, so it renders nothing. "Connected as …" was an M3
  // exit-criterion probe and outlived the milestone it proved.
  return null;
}
