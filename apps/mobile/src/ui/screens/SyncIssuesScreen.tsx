import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, List, Text } from 'react-native-paper';
import { getDb } from '../../data/db/expoDb';
import type { OutboxRow } from '../../data/mirror';
import { opOfRow } from '../../data/mirror';
import { OP_LABELS, type OpKind } from '../../domain/ops';
import { retryOne } from '../../sync/outbox';
import { discardParkedAndRestore, runSync } from '../../sync/sync';
import { PHASE_LABELS, useSyncStatus } from '../../sync/syncStatus';
import { useOutboxRows } from '../../state/useOutboxRows';
import { useConfirm } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { IndeterminateBar } from '../components/IndeterminateBar';
import { useColors, spacing } from '../theme';

/** The review surface for offline writes: parked ops (gave up after backoff or hit a definitive rejection)
 *  get per-row retry / discard — discard also rolls the optimistic mirror write back to server truth. */
export function SyncIssuesScreen() {
  const c = useColors();
  const { data } = useOutboxRows();
  const { syncing, serverReachable, lastSyncAt, lastError, progress } = useSyncStatus();

  const parked = data?.parked ?? [];
  const pending = data?.pending ?? [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.statusRow}>
        <Text style={[styles.statusText, { color: c.textMuted }]}>
          {syncing ? 'Syncing…' : serverReachable ? 'Server reachable' : 'Offline'}
          {lastSyncAt ? ` · last sync ${new Date(lastSyncAt).toLocaleTimeString()}` : ''}
        </Text>
        <Button title="Sync now" variant="secondary" onPress={() => void runSync()} disabled={syncing} />
      </View>
      {lastError && <Text style={[styles.lastError, { color: c.warning }]}>{lastError}</Text>}

      {syncing && (
        <View style={styles.progressBlock}>
          <IndeterminateBar />
          <Text style={[styles.progressText, { color: c.textMuted }]}>
            {progress ? `${progress.count} ${PHASE_LABELS[progress.phase]}…` : 'Starting…'}
          </Text>
        </View>
      )}

      {!syncing && parked.length === 0 && pending.length === 0 && (
        <Text style={[styles.empty, { color: c.textMuted }]}>All changes are synced.</Text>
      )}

      {parked.length > 0 && <List.Subheader style={styles.subheader}>Needs attention</List.Subheader>}
      {parked.map((row) => <ParkedCard key={row.seq} row={row} />)}

      {pending.length > 0 && <List.Subheader style={styles.subheader}>Waiting to sync</List.Subheader>}
      {pending.map((row) => (
        <View key={row.seq} style={[styles.pendingRow, { borderColor: c.divider }]}>
          <Text style={styles.opLabel}>{labelOf(row)}</Text>
          <Text style={[styles.muted, { color: c.textMuted }]}>
            {new Date(row.occurred_at).toLocaleString()}
            {row.attempts > 0 ? ` · attempt ${row.attempts}` : ''}
            {row.next_attempt_at ? ` · retries ${new Date(row.next_attempt_at).toLocaleTimeString()}` : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function ParkedCard({ row }: { row: OutboxRow }) {
  const c = useColors();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);

  const retry = async () => retryOne(await getDb(), row.seq);
  const discard = async () => {
    const ok = await confirm({
      title: 'Discard change',
      message: `Discard “${labelOf(row)}”? The local edit is undone and the server’s version is restored.`,
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (ok) void discardParkedAndRestore(row.seq);
  };

  return (
    <Card mode="outlined" style={styles.card} theme={{ colors: { outline: c.warning } }}>
      <Card.Content>
        <Pressable onPress={() => setExpanded(!expanded)}>
        <Text style={styles.opLabel}>{labelOf(row)}</Text>
        <Text style={[styles.muted, { color: c.textMuted }]}>
          {new Date(row.occurred_at).toLocaleString()} · {row.attempts} attempt{row.attempts === 1 ? '' : 's'}
        </Text>
        {row.last_error && (
          <Text style={[styles.error, { color: c.danger }]} numberOfLines={expanded ? undefined : 2}>{row.last_error}</Text>
        )}
      </Pressable>
        {expanded && <Text style={[styles.payload, { backgroundColor: c.bg }]}>{payloadOf(row)}</Text>}
      </Card.Content>
      <Card.Actions>
        <Button title="Retry" onPress={() => void retry()} />
        <Button title="Discard" variant="destructive" onPress={() => void discard()} />
        <Button title={expanded ? 'Less' : 'Details'} variant="secondary" onPress={() => setExpanded(!expanded)} />
      </Card.Actions>
    </Card>
  );
}

function labelOf(row: OutboxRow): string {
  return OP_LABELS[row.kind as OpKind] ?? row.kind;
}

function payloadOf(row: OutboxRow): string {
  try {
    return JSON.stringify(opOfRow(row), null, 2);
  } catch {
    return row.payload;
  }
}

const styles = StyleSheet.create({
  // Inside a padded page a subheader's own 16dp inset would put headings right of the text they head.
  subheader: { paddingHorizontal: 0, paddingTop: spacing.md, paddingBottom: spacing.xs },
  container: { padding: spacing.lg, gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { fontSize: 13 },
  lastError: { fontSize: 12 },
  progressBlock: { gap: spacing.xs, marginTop: spacing.sm },
  progressText: { fontSize: 13, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 32 },
  card: { marginBottom: 8 },
  opLabel: { fontSize: 15, fontWeight: '600' },
  muted: { fontSize: 12 },
  error: { fontSize: 12 },
  payload: { fontFamily: 'monospace', fontSize: 11, borderRadius: 6, padding: 8 },
  pendingRow: { paddingVertical: 6, borderBottomWidth: 0.5 },
});
