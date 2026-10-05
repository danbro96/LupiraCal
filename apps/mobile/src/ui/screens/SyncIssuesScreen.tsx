import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, List, Text } from 'react-native-paper';
import type { ParkedOp } from '@danbro96/lupira-sync-engine/types';
import { AGGREGATE_LABELS } from '../../domain/aggregates';
import { OP_LABELS, type OpKind } from '../../domain/ops';
import { engine } from '../../sync/engine';
import { useParkedOps } from '../../state/useParkedOps';
import { useSyncStatus } from '../../state/useSyncStatus';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { IndeterminateBar } from '../components/IndeterminateBar';
import { useColors, spacing } from '../theme';
import { plural } from '@danbro96/lupira-domain-core/wording';

/** The review surface for offline writes: parked ops (gave up after backoff or hit a definitive rejection)
 *  get per-row retry / discard — discard also rolls the optimistic mirror write back to server truth. */
export function SyncIssuesScreen() {
  const c = useColors();
  const { data: parked = [] } = useParkedOps();
  const { phase, serverReachable, lastSyncAt, lastError, progress, pending } = useSyncStatus();
  const syncing = phase !== 'idle';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.statusRow}>
        <Text style={[styles.statusText, { color: c.textMuted }]}>
          {syncing ? 'Syncing…' : serverReachable ? 'Server reachable' : 'Offline'}
          {lastSyncAt ? ` · last sync ${new Date(lastSyncAt).toLocaleTimeString()}` : ''}
        </Text>
        <Button title="Sync now" variant="secondary" onPress={() => void engine.sync()} disabled={syncing} />
      </View>
      {lastError && <Text style={[styles.lastError, { color: c.warning }]}>{lastError}</Text>}

      {syncing && (
        <View style={styles.progressBlock}>
          <IndeterminateBar />
          <Text style={[styles.progressText, { color: c.textMuted }]}>
            {progress ? `${progress.count} ${AGGREGATE_LABELS[progress.aggregate] ?? progress.aggregate}…` : 'Starting…'}
          </Text>
        </View>
      )}

      {!syncing && parked.length === 0 && pending === 0 && (
        <Text style={[styles.empty, { color: c.textMuted }]}>All changes are synced.</Text>
      )}

      {parked.length > 0 && <List.Subheader style={styles.subheader}>Needs attention</List.Subheader>}
      {parked.map((row) => <ParkedCard key={row.op.commandId} row={row} />)}

      {pending > 0 && <List.Subheader style={styles.subheader}>Waiting to sync</List.Subheader>}
      {pending > 0 && <Text style={[styles.muted, { color: c.textMuted }]}>{plural(pending, 'change')} queued</Text>}
    </ScrollView>
  );
}

function ParkedCard({ row }: { row: ParkedOp }) {
  const c = useColors();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);

  const retry = () => engine.retry(row.op.commandId);
  const discard = async () => {
    const ok = await confirm({
      title: 'Discard change',
      message: `Discard “${labelOf(row)}”? The local edit is undone and the server’s version is restored.`,
      confirmLabel: 'Discard',
      destructive: true,
    });
    if (ok) void engine.discard(row.op.commandId);
  };

  return (
    <Card mode="outlined" style={styles.card} theme={{ colors: { outline: c.warning } }}>
      <Card.Content>
        <Pressable onPress={() => setExpanded(!expanded)}>
        <Text style={styles.opLabel}>{labelOf(row)}</Text>
        <Text style={[styles.muted, { color: c.textMuted }]}>
          {new Date(row.op.occurredAt).toLocaleString()} · {plural(row.attempts, 'attempt')}
        </Text>
        {row.lastError && (
          <Text style={[styles.error, { color: c.danger }]} numberOfLines={expanded ? undefined : 2}>{row.lastError}</Text>
        )}
      </Pressable>
        {expanded && <Text style={[styles.payload, { backgroundColor: c.bg }]}>{JSON.stringify(row.op, null, 2)}</Text>}
      </Card.Content>
      <Card.Actions>
        <Button title="Retry" onPress={() => void retry()} />
        <Button title="Discard" variant="destructive" onPress={() => void discard()} />
        <Button title={expanded ? 'Less' : 'Details'} variant="secondary" onPress={() => setExpanded(!expanded)} />
      </Card.Actions>
    </Card>
  );
}

function labelOf(row: ParkedOp): string {
  return OP_LABELS[row.op.kind as OpKind] ?? row.op.kind;
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
});
