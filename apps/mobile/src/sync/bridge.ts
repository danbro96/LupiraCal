import type { SyncEngine } from '@danbro96/lupira-sync-engine/engine';
import { v7 as uuidv7 } from 'uuid';
import type { AddressHint, BridgeInboxRow } from '../../modules/lupira-bridge/src';
import { LupiraBridge } from '../../modules/lupira-bridge/src';
import { getDb } from '../data/db/expoDb';
import { deterministicIdFor } from '../data/ids';
import { Aggregate } from '../domain/aggregates';
import type { CalCapturePayload, ContactCapturePayload, ParsedCalRow, ParsedContactRow, PostalCapture } from '../domain/bridgeTranslate';
import {
  PENDING_PREFIX, contactReviseIsEcho, mergeChannelTypes, postalHints, publishedAddresses, sourceKeyOfPendingMarker, translateCalRow, translateContactRow,
} from '../domain/bridgeTranslate';
import type { ContactDoc, ItemDoc, PlaceDoc, ResidencyDoc } from '../domain/docTypes';
import { stamp, type ClientOp } from '../domain/ops';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { withHoldKeys } from './holdKeys';
import { readMeta } from './meta';
import { queryClient } from './queryClient';

export const BRIDGE_ENABLED_KEY = 'bridge.enabled';

export const ADDRESS_HINTS_KEY = [Aggregate.contact, 'addressHints'] as const;

/** Impure half of the write-back: pull captured provider edits from the Kotlin inbox, resolve ids
 *  (pending markers → deterministic aggregate ids), translate, enqueue through the normal outbox/LWW
 *  path, re-point provider rows, ack. Idempotent across crashes: re-drained creates share the
 *  deterministic sourceKey and revises converge via LWW. */
export async function drainBridgeInbox(engine: SyncEngine): Promise<number> {
  if (!(await bridgeEnabled())) return 0;
  let rows: BridgeInboxRow[];
  try {
    rows = await LupiraBridge.drainInbox();
  } catch {
    return 0;   // module unavailable — never fatal for a sync run
  }
  if (rows.length === 0) return 0;

  const ops: ClientOp[] = [];
  const assignments: { marker: string; syncId: string }[] = [];
  const ackIds: number[] = [];

  for (const row of rows) {
    if (row.domain === 'contact') {
      const contactOps = await translateContactInboxRow(engine, row);
      ops.push(...contactOps);
      ackIds.push(row.id);
      continue;
    }
    if (row.domain !== 'cal') {
      ackIds.push(row.id);
      continue;
    }
    const parsed = await parseRow(row);
    if (!parsed) {
      ackIds.push(row.id);
      continue;
    }
    const existing = await engine.doc<ItemDoc, unknown>(Aggregate.item, parsed.itemId);
    const t = translateCalRow(parsed, existing?.doc ?? null);
    switch (t.kind) {
      case 'create':
        ops.push({ kind: 'item.create', itemId: t.itemId, sourceKey: t.sourceKey, calendarId: t.calendarId, core: t.core, ...stamp(Aggregate.item, t.itemId, t.occurredAt) });
        assignments.push({ marker: row.syncId!, syncId: t.itemId });
        break;
      case 'revise':
        ops.push({ kind: 'item.revise', itemId: t.itemId, core: t.core, ...stamp(Aggregate.item, t.itemId, t.occurredAt) });
        break;
      case 'delete':
        ops.push({ kind: 'item.delete', itemId: t.itemId, ...stamp(Aggregate.item, t.itemId, t.occurredAt) });
        break;
      case 'skip':
        logDebug('bridge', `inbox row ${row.id} skipped: ${t.reason}`);
        break;
    }
    ackIds.push(row.id);
  }

  if (ops.length > 0) await engine.enqueue(await withHoldKeys(await getDb(), ops));
  for (const a of assignments) await LupiraBridge.assignEventSyncId(a.marker, a.syncId);
  await LupiraBridge.ackInbox(ackIds);
  logDebug('bridge', `drained ${rows.length} inbox rows → ${ops.length} ops`);
  return ops.length;
}

/** Mirror → provider refresh at the end of an engine sync (fresh pull state lands in the stock apps
 *  without waiting for the OS scheduler). No-op unless the user enabled the integration. */
export async function bridgePublish(): Promise<void> {
  if (!(await bridgeEnabled())) return;
  try {
    await LupiraBridge.bridgeSyncNow();
  } catch (e) {
    logDebug('bridge', `publish failed: ${String(e)}`);
  }
}

/** A contact's phone-typed addresses; none while the integration is off. */
export async function listAddressHints(contactId: string): Promise<AddressHint[]> {
  if (!(await bridgeEnabled())) return [];
  try {
    return await LupiraBridge.listAddressHints(contactId);
  } catch {
    return [];
  }
}

/** Settled or dismissed hints leave the stock app on the next publish, which runs right away. */
export async function dismissAddressHints(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await LupiraBridge.deleteAddressHints(ids);
  } catch (e) {
    logDebug('bridge', `dismissing hints failed: ${String(e)}`);
    return;
  }
  await queryClient.invalidateQueries({ queryKey: ADDRESS_HINTS_KEY });
  void bridgePublish();
}

/** The user preference lives in the kernel meta so this layer can read it (boundaries: sync ↛ state). */
async function bridgeEnabled(): Promise<boolean> {
  return (await readMeta(BRIDGE_ENABLED_KEY)) === '1';
}

async function translateContactInboxRow(engine: SyncEngine, row: BridgeInboxRow): Promise<ClientOp[]> {
  if (!row.syncId || !GUID_RE.test(row.syncId)) {
    logDebug('bridge', `contact inbox row ${row.id}: unusable sync id`);
    return [];
  }
  let payload: ContactCapturePayload;
  try {
    payload = JSON.parse(row.payload) as ContactCapturePayload;
  } catch {
    logDebug('bridge', `contact inbox row ${row.id}: unparseable payload`);
    return [];
  }
  const parsed: ParsedContactRow = {
    kind: row.kind === 'deleted' ? 'deleted' : 'revised',
    contactId: row.syncId,
    payload,
    occurredAt: new Date(row.capturedAt).toISOString(),
  };
  const t = translateContactRow(parsed);
  if (t.kind === 'delete') return [{ kind: 'contact.delete', contactId: t.contactId, ...stamp(Aggregate.contact, t.contactId, t.occurredAt) }];
  if (payload.postals) {
    try {
      await settleAddressHints(engine, t.contactId, payload.postals);
    } catch (e) {
      logDebug('bridge', `contact inbox row ${row.id}: address hints failed: ${String(e)}`);
    }
  }

  const doc = (await engine.doc<ContactDoc, unknown>(Aggregate.contact, t.contactId))?.doc ?? null;
  const channels = doc ? mergeChannelTypes(t.channels, doc.channels ?? []) : t.channels;
  if (doc && contactReviseIsEcho(t.core, channels, doc)) {
    logDebug('bridge', `contact inbox row ${row.id}: echo, skipped`);
    return [];
  }
  return [
    { kind: 'contact.revise', contactId: t.contactId, core: t.core, ...stamp(Aggregate.contact, t.contactId, t.occurredAt) },
    // +1ms so the wholesale channel replacement deterministically outranks the revise on the shared guard.
    { kind: 'contact.channels', contactId: t.contactId, channels, ...stamp(Aggregate.contact, t.contactId, new Date(row.capturedAt + 1).toISOString()) },
  ];
}

/** Addresses typed in the stock app can't name a place, so they stay on the phone as hints — no ops. */
async function settleAddressHints(engine: SyncEngine, contactId: string, postals: PostalCapture[]): Promise<void> {
  const residencies = (await engine.docs<ResidencyDoc, null>(Aggregate.residency)).map((d) => d.state.doc).filter((r) => r.contactId === contactId);
  const places = new Map<string, PlaceDoc | null>();
  for (const r of residencies) places.set(r.placeId, (await engine.doc<PlaceDoc, null>(Aggregate.residencyPlace, r.placeId))?.doc ?? null);
  const published = publishedAddresses(residencies, (id) => places.get(id) ?? null);
  const changes = postalHints(contactId, postals, published, await LupiraBridge.listAddressHints(contactId), uuidv7);
  for (const hint of changes.put) await LupiraBridge.putAddressHint(hint);
  if (changes.remove.length > 0) await LupiraBridge.deleteAddressHints(changes.remove);
  if (changes.restore) await LupiraBridge.invalidateContacts([contactId]);
  if (changes.put.length + changes.remove.length > 0) await queryClient.invalidateQueries({ queryKey: ADDRESS_HINTS_KEY });
}

async function parseRow(row: BridgeInboxRow): Promise<ParsedCalRow | null> {
  let payload: CalCapturePayload;
  try {
    payload = JSON.parse(row.payload) as CalCapturePayload;
  } catch {
    logDebug('bridge', `inbox row ${row.id}: unparseable payload`);
    return null;
  }
  const occurredAt = new Date(row.capturedAt).toISOString();
  if (!row.syncId) return null;

  if (row.syncId.startsWith(PENDING_PREFIX)) {
    const sourceKey = sourceKeyOfPendingMarker(row.syncId);
    if (!sourceKey) return null;
    const itemId = await deterministicIdFor(sourceKey);
    // A pending row can also be a deletion (created in the stock app, drained, then deleted there).
    return { kind: row.kind === 'deleted' ? 'deleted' : 'created', itemId, sourceKey, payload, occurredAt };
  }
  if (!GUID_RE.test(row.syncId)) {
    logDebug('bridge', `inbox row ${row.id}: foreign sync id '${row.syncId}' dropped (pre-M7 spike row?)`);
    return null;
  }
  return { kind: row.kind === 'deleted' ? 'deleted' : 'revised', itemId: row.syncId, payload, occurredAt };
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
