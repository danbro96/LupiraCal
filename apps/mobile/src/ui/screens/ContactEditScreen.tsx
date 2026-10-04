import { errorText } from '@lupira/cal-domain/apiError';
import { DISPLAY_NAME_FORMAT_LABELS } from '@lupira/cal-domain/contactNames';
import { visibleTags, withPinPreserved } from '@lupira/cal-domain/contactTiers';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, IconButton, List, Switch, Text } from 'react-native-paper';
import type { ReachChannel, SocialProfile } from '../../domain/docTypes';
import { REACH_KINDS } from '../../domain/reach';
import type { ContactForm } from '../../domain/editors';
import { parseList } from '@lupira/cal-domain/itemForm';
import { CHANNEL_TYPES as SHARED_CHANNEL_TYPES } from '@lupira/cal-domain/reach';
import { contactCoreFromForm, contactFormFromDoc, emptyContactForm } from '../../domain/editors';
import { createContact, reviseContact, setContactChannels, setContactProfiles, setContactTags } from '../../state/actions';
import { useAddressBooks } from '../../state/useAddressBooks';
import { useContactState } from '../../state/useContactList';
import { ChoiceChips } from '../components/ChoiceChips';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import { Input } from '../components/Input';
import { ReachIcon } from '../components/ReachIcon';
import type { RootStackParamList } from '../navigation/types';
import { useUnsavedGuard } from '../navigation/useUnsavedGuard';
import { useColors } from '../theme';
import { ICONS } from '../icons';

const KIND_OPTIONS = [{ value: 'Individual', label: 'Person' }, { value: 'Organization', label: 'Organization' }];
const NAME_FORMAT_OPTIONS = Object.entries(DISPLAY_NAME_FORMAT_LABELS).map(([value, label]) => ({ value, label }));
const CHANNEL_TYPES = [null, ...SHARED_CHANNEL_TYPES] as const;

export function ContactEditScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'ContactEdit'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const contactId = route.params?.contactId;
  const { data: state } = useContactState(contactId ?? '');
  const { data: books } = useAddressBooks();

  const [form, setForm] = useState<ContactForm>(() => ({ ...emptyContactForm(), displayNameFormat: contactId ? '' : 'FirstLast' }));
  const [channels, setChannels] = useState<ReachChannel[]>([]);
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [tagsCsv, setTagsCsv] = useState('');
  const [bookId, setBookId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(!contactId);
  /** Snapshot of the pristine form; anything different means unsaved work worth guarding. */
  const baseline = useRef(snapshot(emptyContactForm(), [], [], ''));

  useEffect(() => {
    if (!seeded && contactId && state) {
      const seededForm = contactFormFromDoc(state.doc);
      const seededChannels = (state.doc.channels ?? []).map((ch) => ({ ...ch }));
      const seededProfiles = (state.doc.profiles ?? []).map((p) => ({ ...p }));
      const seededTags = visibleTags(state.doc.tags).join(', ');
      setForm(seededForm);
      setChannels(seededChannels);
      setProfiles(seededProfiles);
      setTagsCsv(seededTags);
      baseline.current = snapshot(seededForm, seededChannels, seededProfiles, seededTags);
      setSeeded(true);
    }
  }, [seeded, contactId, state]);
  useEffect(() => {
    if (!contactId && !bookId && books?.length) setBookId(books[0].id);
  }, [contactId, bookId, books]);

  const dirty = useMemo(
    () => snapshot(form, channels, profiles, tagsCsv) !== baseline.current,
    [form, channels, profiles, tagsCsv],
  );
  /** Bridges the guard to the submit closure (assigned below) without re-subscribing every render. */
  const submitRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const guard = useUnsavedGuard(dirty, {
    message: 'Save this contact edit before leaving?',
    onSave: () => submitRef.current(),
  });

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  // The kind is chosen once, when the row is added — rows render it as a fixed icon+label afterwards.
  const addReach = (key: string) => {
    const kind = REACH_KINDS.find((k) => k.key === key);
    if (kind?.channelMedium) setChannels((prev) => [...prev, { medium: kind.channelMedium!, value: '', preferred: false }]);
    else setProfiles((p) => [...p, { service: key, handle: '', preferred: false }]);
  };

  /** Persists without navigating — the caller (header button or the exit guard) decides what happens
   *  next. Returns false when validation failed so the guard keeps the user on the form. */
  const submit = async (): Promise<boolean> => {
    const r = contactCoreFromForm(form);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    if (!contactId && !bookId) {
      setError('Pick an address book');
      return false;
    }
    setError(null);

    const cleanChannels = channels.filter((ch) => ch.value.trim());
    const cleanProfiles = profiles.filter((p) => p.service.trim() && p.handle.trim());
    const tags = withPinPreserved(parseList(tagsCsv), contactId ? state?.doc.tags : null);

    try {
      if (!contactId) {
        const id = await createContact(bookId, { ...r.value, channels: cleanChannels, tags });
        if (cleanProfiles.length > 0) await setContactProfiles(id, cleanProfiles);
      } else {
        const doc = state?.doc;
        await reviseContact(contactId, r.value);
        if (JSON.stringify(cleanChannels) !== JSON.stringify(doc?.channels ?? [])) await setContactChannels(contactId, cleanChannels);
        if (JSON.stringify(tags) !== JSON.stringify(doc?.tags ?? [])) await setContactTags(contactId, tags);
        if (JSON.stringify(cleanProfiles) !== JSON.stringify(doc?.profiles ?? [])) await setContactProfiles(contactId, cleanProfiles);
      }
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };

  const saveAndLeave = () => {
    void submit().then((saved) => {
      if (!saved) return;
      guard.leave();
      navigation.goBack();
    });
  };

  // Save lives in the header; leaving without saving is guarded instead of needing a Cancel button.
  // Intentionally dependency-free: `save` closes over the live form state, so it must be re-bound
  // on every render.
  submitRef.current = submit;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button mode="text" compact disabled={!dirty} onPress={saveAndLeave}>
          Save
        </Button>
      ),
    });
  });

  if (contactId && !seeded) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.muted, { color: c.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!contactId && (books?.length ?? 0) > 1 && (
        <Field label="Address book">
          <ChoiceChips
            required
            options={(books ?? []).map((b) => ({ value: b.id, label: b.displayName ?? b.id }))}
            value={bookId}
            onChange={setBookId}
          />
        </Field>
      )}
      <Input label="Given name" value={form.givenName} onChangeText={(v) => set('givenName', v)} />
      <Input label="Middle name" value={form.middleName} onChangeText={(v) => set('middleName', v)} />
      <Input label="Family name" value={form.familyName} onChangeText={(v) => set('familyName', v)} />
      <Input label="Nickname" value={form.nickname} onChangeText={(v) => set('nickname', v)} />
      <Field label="Shown as">
        <ChoiceChips options={NAME_FORMAT_OPTIONS} value={form.displayNameFormat} onChange={(v) => set('displayNameFormat', v)} />
      </Field>
      <Field label="Kind">
        <ChoiceChips options={KIND_OPTIONS} value={form.kind} onChange={(v) => set('kind', v)} />
      </Field>
      <Input label="Pronouns" autoCapitalize="none" value={form.pronouns} onChangeText={(v) => set('pronouns', v)} />

      <Field label="Birthday">
        <List.Item
          title="Enter year"
          right={() => (
            <Switch
              value={form.birthdayYearKnown}
              onValueChange={(v) => setForm((f) => ({ ...f, birthdayYearKnown: v, birthday: '', birthdayMonth: '', birthdayDay: '' }))}
            />
          )}
        />
        {form.birthdayYearKnown ? (
          <DateField value={form.birthday} onChange={(v) => set('birthday', v)} />
        ) : (
          <View style={styles.pair}>
            <Input
              label="Month (1–12)"
              style={styles.pairItem}
              keyboardType="number-pad"
              maxLength={2}
              value={form.birthdayMonth}
              onChangeText={(v) => set('birthdayMonth', v.replace(/[^0-9]/g, ''))}
            />
            <Input
              label="Day (1–31)"
              style={styles.pairItem}
              keyboardType="number-pad"
              maxLength={2}
              value={form.birthdayDay}
              onChangeText={(v) => set('birthdayDay', v.replace(/[^0-9]/g, ''))}
            />
          </View>
        )}
        {contactId && <Text style={[styles.muted, { color: c.textMuted }]}>Clearing a birthday isn't supported — leave empty to keep it.</Text>}
      </Field>

      <List.Subheader>Reach</List.Subheader>
      {channels.map((ch, i) => (
        <View key={`ch-${i}`} style={styles.reachRow}>
          <ReachIcon kind={ch.medium} />
          <Input
            label={ch.medium === 'Phone' ? '+46…' : 'name@example.com'}
            style={styles.reachValue}
            autoCapitalize="none"
            keyboardType={ch.medium === 'Phone' ? 'phone-pad' : 'email-address'}
            value={ch.value}
            onChangeText={(v) => setChannels((d) => d.map((x, j) => (j === i ? { ...x, value: v } : x)))}
          />
          <Pressable
            onPress={() => setChannels((d) => d.map((x, j) => (j === i
              ? { ...x, type: CHANNEL_TYPES[(CHANNEL_TYPES.indexOf((x.type as typeof CHANNEL_TYPES[number]) ?? null) + 1) % CHANNEL_TYPES.length] }
              : x)))}
            hitSlop={6}
          >
            <Chip compact mode="outlined">{ch.type ?? 'type'}</Chip>
          </Pressable>
          <IconButton
            icon={ch.preferred ? 'star' : 'star-outline'}
            size={18}
            iconColor={ch.preferred ? c.warning : c.border}
            style={styles.star}
            onPress={() => setChannels((d) => d.map((x, j) => (j === i ? { ...x, preferred: !x.preferred } : x)))}
            hitSlop={6}
          />
          <IconButton
            icon={ICONS.close}
            size={16}
            iconColor={c.textMuted}
            style={styles.remove}
            onPress={() => setChannels((d) => d.filter((_, j) => j !== i))}
            hitSlop={6}
          />
        </View>
      ))}
      {profiles.map((p, i) => (
        <View key={`pr-${i}`} style={styles.reachRow}>
          <ReachIcon kind={p.service} />
          <Text style={[styles.reachService, { color: c.textMuted }]} numberOfLines={1}>{p.service}</Text>
          <Input
            label="@handle or URL"
            style={styles.reachValue}
            autoCapitalize="none"
            value={p.handle}
            onChangeText={(v) => setProfiles((d) => d.map((x, j) => (j === i ? { ...x, handle: v } : x)))}
          />
          <IconButton
            icon={ICONS.close}
            size={16}
            iconColor={c.textMuted}
            style={styles.remove}
            onPress={() => setProfiles((d) => d.filter((_, j) => j !== i))}
            hitSlop={6}
          />
        </View>
      ))}
      <View style={styles.addRow}>
        {REACH_KINDS.map((k) => (
          <Chip
            key={k.key}
            mode="outlined"
            compact
            icon={() => <ReachIcon kind={k.key} size={13} />}
            onPress={() => addReach(k.key)}
          >
            {k.key}
          </Chip>
        ))}
      </View>

      <Input label="Tags (comma-separated)" autoCapitalize="none" value={tagsCsv} onChangeText={setTagsCsv} />

      <Input
        label="Notes"
        multiline
        numberOfLines={3}
        style={{ minHeight: 72 }}
        value={form.notes}
        onChangeText={(v) => set('notes', v)}
      />

      <HelperText type="error" visible={!!error}>{error}</HelperText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 13 },
  pair: { flexDirection: 'row', gap: 8 },
  pairItem: { flex: 1 },
  reachRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  reachService: { flex: 2, fontSize: 13 },
  reachValue: { flex: 3 },
  star: { margin: 0 },
  remove: { margin: 0 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});

function snapshot(form: ContactForm, channels: ReachChannel[], profiles: SocialProfile[], tagsCsv: string): string {
  return JSON.stringify([form, channels, profiles, tagsCsv.trim()]);
}
