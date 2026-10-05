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

type LupiraBridgeNative = {
  ensureAccount(): Promise<boolean>;
  removeAccount(): Promise<boolean>;
  requestSync(): Promise<void>;
  getBridgeState(): Promise<BridgeState>;
  /// Runs capture → publish in-process (same body as onPerformSync), immediately.
  bridgeSyncNow(): Promise<void>;
  /// Reads inbox rows WITHOUT consuming them — deletion happens via ackInbox after the ops are enqueued.
  drainInbox(): Promise<BridgeInboxRow[]>;
  ackInbox(ids: number[]): Promise<void>;
  assignEventSyncId(pendingMarker: string, syncId: string): Promise<void>;
  readContactsSample(limit: number): Promise<{ total: number; rows: ContactsSampleRow[] }>;
  /// The text of a file another app shared (named by the import deep link); readable once.
  readImport(name: string): Promise<string>;
  clearImports(): Promise<void>;
};

export const LupiraBridge = requireNativeModule<LupiraBridgeNative>('LupiraBridge');
