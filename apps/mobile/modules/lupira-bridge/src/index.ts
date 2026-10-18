import { requireNativeModule } from 'expo-modules-core';

export type BridgeState = {
  accountPresent: boolean;
  calendarId: number | null;
  lastSyncAt: number | null;
};

export type ContactsSampleRow = {
  id: number;
  accountType: string | null;
  accountName: string | null;
  sourceId: string | null;
  dirty: number;
  deleted: number;
  displayName: string | null;
};

/// A captured provider edit awaiting translation into an outbox op. `payload` is the JSON the capturer
/// wrote (see domain/bridgeTranslate.ts for the cal shape); rows persist until acked.
export type BridgeInboxRow = {
  id: number;
  domain: string;
  kind: string;
  syncId: string | null;
  providerId: number;
  payload: string;
  capturedAt: number;
};

/// A stock-app address no place backs yet; `residencyId` is the published address it stands in for.
export type AddressHint = {
  id: string;
  contactId: string;
  residencyId: string | null;
  type: string | null;
  text: string;
  street: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
};

/// 'stale': native holds another generation and ignored the call; 'snapshotNeeded': it has no snapshot of this one.
export type BridgeSyncResult = 'ok' | 'stale' | 'snapshotNeeded';

type LupiraBridgeNative = {
  /// Adopts `generation` when native holds none.
  ensureAccount(generation: string): Promise<'ok' | 'stale'>;
  /// Rotates to `generation`, then deletes the published rows, the account, the snapshot, the inbox and the hints.
  removeAccount(generation: string): Promise<boolean>;
  requestSync(): Promise<void>;
  getBridgeState(): Promise<BridgeState>;
  canScheduleExactAlarms(): Promise<boolean>;
  /// Stores the mirror snapshot (JSON of BridgeSnapshot plus `generation`; null keeps the stored one), then runs
  /// capture → publish in-process (same body as onPerformSync), immediately.
  bridgeSyncNow(snapshot: string | null, generation: string): Promise<BridgeSyncResult>;
  /// Reads inbox rows WITHOUT consuming them — deletion happens via ackInbox after the ops are enqueued.
  drainInbox(): Promise<BridgeInboxRow[]>;
  ackInbox(ids: number[]): Promise<void>;
  assignEventSyncId(pendingMarker: string, syncId: string): Promise<void>;
  listAddressHints(contactId: string | null): Promise<AddressHint[]>;
  putAddressHint(hint: AddressHint): Promise<void>;
  deleteAddressHints(ids: string[]): Promise<void>;
  /// The next publish rewrites these contacts whole, restoring addresses deleted in the stock app.
  invalidateContacts(contactIds: string[]): Promise<void>;
  readContactsSample(limit: number): Promise<{ total: number; rows: ContactsSampleRow[] }>;
  /// The text of a file another app shared (named by the import deep link); readable once.
  readImport(name: string): Promise<string>;
  clearImports(): Promise<void>;
};

export const LupiraBridge = requireNativeModule<LupiraBridgeNative>('LupiraBridge');
