import { v7 as uuidv7 } from 'uuid';
import type { BridgeInboxRow } from '../../modules/lupira-bridge/src';
import { LupiraBridge } from '../../modules/lupira-bridge/src';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { deterministicIdFor } from '../data/ids';
import * as mirror from '../data/mirror';
import type { CalCapturePayload, ContactCapturePayload, ParsedCalRow, ParsedContactRow } from '../domain/bridgeTranslate';
import { PENDING_PREFIX, contactReviseIsEcho, mergeChannelTypes, sourceKeyOfPendingMarker, translateCalRow, translateContactRow } from '../domain/bridgeTranslate';
import { currentHorizon } from '../domain/materialize';
import type { ClientOp } from '../domain/ops';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { enqueue } from './outbox';

/** Impure half of the write-back: pull captured provider edits from the Kotlin inbox, resolve ids
 *  (pending markers → deterministic aggregate ids), translate, enqueue through the normal outbox/LWW
 *  path, re-point provider rows, ack. Idempotent across crashes: re-drained creates share the
 *  deterministic sourceKey and revises converge via LWW. */
export async function drainBridgeInbox(db: Db): Promise<number> {
  if (!(await bridgeEnabled(db))) return 0;
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
      const contactOps = await translateContactInboxRow(db, row);
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
    const existing = await mirror.loadItem(db, parsed.itemId);
    const t = translateCalRow(parsed, existing?.doc ?? null);
    switch (t.kind) {
      case 'create':
        ops.push({ kind: 'item.create', itemId: t.itemId, sourceKey: t.sourceKey, calendarId: t.calendarId, core: t.core, commandId: uuidv7(), occurredAt: t.occurredAt });
        assignments.push({ marker: row.syncId!, syncId: t.itemId });
        break;
      case 'revise':
        ops.push({ kind: 'item.revise', itemId: t.itemId, core: t.core, commandId: uuidv7(), occurredAt: t.occurredAt });
        break;
      case 'delete':
        ops.push({ kind: 'item.delete', itemId: t.itemId, commandId: uuidv7(), occurredAt: t.occurredAt });
        break;
      case 'skip':
        logDebug('bridge', `inbox row ${row.id} skipped: ${t.reason}`);
        break;
    }
    ackIds.push(row.id);
  }

  if (ops.length > 0) await enqueue(db, ops, currentHorizon());
  for (const a of assignments) await LupiraBridge.assignEventSyncId(a.marker, a.syncId);
  await LupiraBridge.ackInbox(ackIds);
  logDebug('bridge', `drained ${rows.length} inbox rows → ${ops.length} ops`);
  return ops.length;
}

/** Mirror → provider refresh at the end of an engine sync (fresh pull state lands in the stock apps
 *  without waiting for the OS scheduler). No-op unless the user enabled the integration. */
export async function bridgePublish(db: Db): Promise<void> {
  if (!(await bridgeEnabled(db))) return;
  try {
    await LupiraBridge.bridgeSyncNow();
  } catch (e) {
    logDebug('bridge', `publish failed: ${String(e)}`);
  }
}

/** The user preference lives in mirror_meta so this layer can read it (boundaries: sync ↛ state). */
async function bridgeEnabled(db: Db): Promise<boolean> {
  return (await mirror.getMeta(db, 'bridge.enabled')) === '1';
}

async function translateContactInboxRow(db: Db, row: BridgeInboxRow): Promise<ClientOp[]> {
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
  if (t.kind === 'delete') return [{ kind: 'contact.delete', contactId: t.contactId, commandId: uuidv7(), occurredAt: t.occurredAt }];

  const doc = (await mirror.loadContact(db, t.contactId))?.doc ?? null;
  const channels = doc ? mergeChannelTypes(t.channels, doc.channels ?? []) : t.channels;
  if (doc && contactReviseIsEcho(t.core, channels, doc)) {
    logDebug('bridge', `contact inbox row ${row.id}: echo, skipped`);
    return [];
  }
  return [
    { kind: 'contact.revise', contactId: t.contactId, core: t.core, commandId: uuidv7(), occurredAt: t.occurredAt },
    // +1ms so the wholesale channel replacement deterministically outranks the revise on the shared guard.
    { kind: 'contact.channels', contactId: t.contactId, channels, commandId: uuidv7(), occurredAt: new Date(row.capturedAt + 1).toISOString() },
  ];
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
