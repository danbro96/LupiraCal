import { ApiError, errorText } from '@danbro96/lupira-http/apiError';
import { dayStartIso, fmtWhen } from '@danbro96/lupira-domain-core/time';
import { calendarLabel, defaultCalendarIds } from '@lupira/cal-domain/calendars';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Checkbox, List, Text } from 'react-native-paper';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { ChoiceChips } from '@danbro96/lupira-expo-paper/components/ChoiceChips';
import type { ContactDraft, ItemDraft } from '../../domain/drafts';
import { contactCoreFromDraft, itemCoreFromDraft } from '../../domain/editors';
import { plural } from '@danbro96/lupira-domain-core/wording';
import { createContacts, createItems } from '../../state/actions';
import { usePrefs } from '../../state/prefs-store';
import { useAddressBooks } from '../../state/useAddressBooks';
import { selectableCalendars, useCalendars } from '../../state/useContainers';
import { useImportDrafts } from '../../state/useImportDrafts';
import { Field } from '../components/Field';
import { leaveScreen } from '../navigation/leaveScreen';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

/** A file another app shared: one draft opens in its editor, several are picked from a checklist. */
export function ImportScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'Import'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { kind, file } = route.params;
  const { data, error, refetch, online } = useImportDrafts(kind, file);
  const leave = () => leaveScreen(navigation);

  const single = data?.drafts.length === 1 ? data : null;
  useEffect(() => {
    if (single?.kind === 'calendar') navigation.replace('ItemEdit', { draft: single.drafts[0] });
    else if (single?.kind === 'contacts') navigation.replace('ContactEdit', { draft: single.drafts[0] });
  }, [single, navigation]);

  if (single) return null;
  if (data?.kind === 'calendar' && data.drafts.length > 1) return <ItemChecklist drafts={data.drafts} onDone={leave} />;
  if (data?.kind === 'contacts' && data.drafts.length > 1) return <ContactChecklist drafts={data.drafts} onDone={leave} />;
  if (data) return <Notice text="Nothing to import in this file" onDismiss={leave} />;
  if (!online) return <Notice text="Needs a connection to read this file" onRetry={() => void refetch()} onDismiss={leave} />;
  if (error) return <Notice text={importErrorText(error)} onRetry={() => void refetch()} onDismiss={leave} />;
  return <Notice text="Reading file…" />;
}

function importErrorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 400) return "This file can't be read";
  if (e instanceof ApiError && e.status === 413) return 'This file is too large to import';
  return errorText(e);
}

function ItemChecklist({ drafts, onDone }: { drafts: ItemDraft[]; onDone: () => void }) {
  const { data: calendars } = useCalendars();
  const lastCalendarIds = usePrefs((p) => p.lastCalendarIds);
  const pickable = selectableCalendars(calendars);
  const cores = drafts.map(itemCoreFromDraft);
  return (
    <Checklist
      rows={drafts.map((d, i) => ({
        title: d.title || 'Untitled event',
        detail: d.startsAt || d.startDate ? fmtWhen(d.startsAt ?? dayStartIso(d.startDate!), d.isAllDay) : null,
        error: cores[i].ok ? null : cores[i].error,
      }))}
      targetLabel="Calendar"
      targets={pickable.map((cal) => ({ value: cal.id, label: calendarLabel(cal) }))}
      defaultTarget={defaultCalendarIds(pickable, lastCalendarIds)[0]}
      noun="event"
      onConfirm={(picked, calendarId) => createItems(calendarId, picked.flatMap((i) => {
        const core = cores[i];
        return core.ok ? [{ core: core.value, sourceKey: drafts[i].sourceKey }] : [];
      }))}
      onDone={onDone}
    />
  );
}

function ContactChecklist({ drafts, onDone }: { drafts: ContactDraft[]; onDone: () => void }) {
  const { data: books } = useAddressBooks();
  const cores = drafts.map(contactCoreFromDraft);
  return (
    <Checklist
      rows={drafts.map((d, i) => ({
        title: [d.givenName, d.familyName].filter(Boolean).join(' ') || d.nickname || d.organization || 'Unnamed contact',
        detail: d.channels[0]?.value ?? null,
        error: cores[i].ok ? null : cores[i].error,
      }))}
      targetLabel="Address book"
      targets={(books ?? []).map((b) => ({ value: b.id, label: b.displayName ?? b.id }))}
      defaultTarget={books?.[0]?.id}
      noun="contact"
      onConfirm={(picked, addressBookId) => createContacts(addressBookId, picked.flatMap((i) => {
        const core = cores[i];
        return core.ok ? [{ core: core.value, sourceKey: drafts[i].sourceKey }] : [];
      }))}
      onDone={onDone}
    />
  );
}

type Row = { title: string; detail: string | null; error: string | null };

function Checklist({ rows, targetLabel, targets, defaultTarget, noun, onConfirm, onDone }: {
  rows: Row[];
  targetLabel: string;
  targets: { value: string; label: string }[];
  defaultTarget: string | undefined;
  noun: string;
  onConfirm: (picked: number[], targetId: string) => Promise<void>;
  onDone: () => void;
}) {
  const c = useColors();
  const [checked, setChecked] = useState(() => rows.map((r) => !r.error));
  const [chosenTarget, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const target = chosenTarget || defaultTarget || '';
  const picked = checked.flatMap((on, i) => (on ? [i] : []));

  const confirm = () => {
    setSaving(true);
    onConfirm(picked, target)
      .then(() => {
        toast(`Added ${plural(picked.length, noun)}`);
        onDone();
      })
      .catch((e: unknown) => {
        setSaving(false);
        toast(errorText(e));
      });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {targets.length > 1 && (
        <Field label={targetLabel}>
          <ChoiceChips required options={targets} value={target} onChange={setTarget} />
        </Field>
      )}
      {rows.map((row, i) => (
        <List.Item
          key={i}
          title={row.title}
          description={row.error ?? row.detail ?? undefined}
          descriptionStyle={row.error ? { color: c.danger } : undefined}
          disabled={!!row.error}
          onPress={() => setChecked((prev) => prev.map((on, j) => (j === i ? !on : on)))}
          left={() => <Checkbox status={checked[i] ? 'checked' : 'unchecked'} disabled={!!row.error} />}
        />
      ))}
      <View style={styles.actions}>
        <Button title={`Add ${plural(picked.length, noun)}`} onPress={confirm} disabled={saving || picked.length === 0 || !target} />
        <Button title="Cancel" variant="secondary" onPress={onDone} />
      </View>
    </ScrollView>
  );
}

function Notice({ text, onRetry, onDismiss }: { text: string; onRetry?: () => void; onDismiss?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.centered}>
      <Text style={[styles.notice, { color: c.textMuted }]}>{text}</Text>
      <View style={styles.actions}>
        {onRetry && <Button title="Retry" onPress={onRetry} />}
        {onDismiss && <Button title="Dismiss" variant="secondary" onPress={onDismiss} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  notice: { fontSize: 15, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, justifyContent: 'center' },
});
