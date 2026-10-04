import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, ScrollView, StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { List, Text } from 'react-native-paper';
import type { BridgeState, ContactsSampleRow } from '../../../modules/lupira-bridge/src';
import { LupiraBridge } from '../../../modules/lupira-bridge/src';
import { getDb } from '../../data/db/expoDb';
import { drainBridgeInbox } from '../../sync/bridge';
import { runSync } from '../../sync/sync';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';

/** Manual halves of the automated bridge flows, for diagnosis and repair: capture/publish (Kotlin),
 *  inbox drain (JS→outbox), the OS scheduler, and account lifecycle. Reached via Settings → Developer. */
export function BridgeDiagnosticsScreen() {
  const confirm = useConfirm();
  const [state, setState] = useState<BridgeState | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [contacts, setContacts] = useState<{ total: number; rows: ContactsSampleRow[] } | null>(null);

  const append = (line: string) => setLog((l) => [...l.slice(-20), line]);
  const refresh = useCallback(() => LupiraBridge.getBridgeState()
    .then(async (next) => {
      setState(next);
      setInboxCount((await LupiraBridge.drainInbox()).length);
    })
    .catch((e: unknown) => append(String(e))), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = (label: string, fn: () => Promise<unknown>) => () => runLogged(label, fn, append, refresh);

  const requestPermissions = run('permissions', () =>
    PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_CALENDAR,
      PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR,
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
    ]));

  const readContacts = run('contacts', async () => {
    const sample = await LupiraBridge.readContactsSample(10);
    setContacts(sample);
    return `${sample.total} raw contacts on device`;
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Subheader style={styles.subheader}>State</List.Subheader>
      <Text style={styles.mono}>
        account: {state ? String(state.accountPresent) : '…'}   calendarId: {state?.calendarId ?? '—'}{'\n'}
        last OS sync: {state?.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : 'never'}{'\n'}
        inbox rows: {inboxCount ?? '…'}
      </Text>

      <List.Subheader style={styles.subheader}>Actions</List.Subheader>
      <View style={styles.buttons}>
        <Button title="Request permissions" onPress={() => void requestPermissions()} />
        <Button title="Ensure account" onPress={run('ensureAccount', () => LupiraBridge.ensureAccount())} />
        <Button title="Bridge sync now (capture + publish)" onPress={run('bridgeSyncNow', () => LupiraBridge.bridgeSyncNow())} />
        <Button
          title="Drain inbox → outbox + full sync"
          onPress={run('drain', async () => {
            const ops = await drainBridgeInbox(await getDb());
            void runSync();
            return `${ops} ops enqueued`;
          })}
        />
        <Button title="Request OS sync" onPress={run('requestSync', () => LupiraBridge.requestSync())} />
        <Button title="Read contacts sample" onPress={() => void readContacts()} />
        <Button
          title="Remove account"
          variant="destructive"
          onPress={() =>
            void confirm({
              title: 'Remove Lupira account',
              message: 'Also removes the published calendar and contacts from this phone. The app and server keep everything.',
              confirmLabel: 'Remove',
              destructive: true,
            }).then((ok) => {
              if (ok) void run('removeAccount', () => LupiraBridge.removeAccount())();
            })
          }
        />
      </View>

      {contacts && (
        <>
          <List.Subheader style={styles.subheader}>Raw contacts ({contacts.total})</List.Subheader>
          {contacts.rows.map((r) => (
            <Text key={r.id} style={styles.mono}>
              {r.displayName ?? '(no name)'} · {r.accountType ?? 'local'} · src={r.sourceId ?? '—'} · dirty={r.dirty} del={r.deleted}
            </Text>
          ))}
        </>
      )}

      <List.Subheader style={styles.subheader}>Log</List.Subheader>
      {log.map((l, i) => <Text key={i} style={styles.mono}>{l}</Text>)}
    </ScrollView>
  );
}

async function runLogged(label: string, fn: () => Promise<unknown>, append: (line: string) => void, refresh: () => Promise<void>) {
  try {
    const result = await fn();
    append(`${label}: ${result === undefined ? 'ok' : JSON.stringify(result)}`);
  } catch (e) {
    append(`${label} FAILED: ${String(e)}`);
  }
  await refresh();
}

const styles = StyleSheet.create({
  // Inside a padded page a subheader's own 16dp inset would put headings right of the text they head.
  subheader: { paddingHorizontal: 0, paddingTop: spacing.md, paddingBottom: spacing.xs },
  container: { padding: spacing.lg, gap: spacing.xs },
  buttons: { gap: spacing.sm },
  mono: { fontFamily: 'monospace', fontSize: 12 },
});
