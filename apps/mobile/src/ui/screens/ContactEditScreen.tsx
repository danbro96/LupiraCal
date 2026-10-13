import { errorText } from '@danbro96/lupira-http/apiError';
import { DISPLAY_NAME_FORMAT_LABELS } from '@danbro96/lupira-domain-contacts/contactNames';
import { householdHomes } from '@danbro96/lupira-domain-contacts/residents';
import { visibleTags, withPinPreserved } from '@lupira/cal-domain/contactTiers';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, HelperText, IconButton, List, Switch, Text } from 'react-native-paper';
import { v7 as uuidv7 } from 'uuid';
import {
  addressRowsFrom, addressSaveError, hintAddressRow, newAddressRow, residencyChanges, settledHintIds, type AddressRow, type ResidencyChange,
} from '../../domain/addressRows';
import type { ContactDoc, ReachChannel, SocialProfile } from '../../domain/docTypes';
import { REACH_KINDS } from '../../domain/reach';
import type { ContactForm } from '../../domain/editors';
import type { ContactCore } from '../../domain/ops';
import { parseList } from '@lupira/cal-domain/itemForm';
import { clampBirthdayDay, daysInMonth, monthNames, partialDateToInput, withYearKnown, type BirthdayFields } from '@lupira/cal-domain/partialDate';
import { CHANNEL_TYPES as SHARED_CHANNEL_TYPES } from '@lupira/cal-domain/reach';
import { contactCoreFromForm, contactFormFromDoc, contactFormFromDraft, emptyContactForm } from '../../domain/editors';
import { contactDraftFromLink } from '../../domain/drafts';
import { createContact, reviseContact, saveResidencies, setContactChannels, setContactProfiles, setContactTags } from '../../state/actions';
import { dismissAddressHints } from '../../sync/bridge';
import { useAddressBooks } from '../../state/useAddressBooks';
import { useAddressHints } from '../../state/useAddressHints';
import { useContactRelations, useContactState } from '../../state/useContactList';
import { useContactResidencies, useResidencyRows } from '../../state/useResidencies';
import { ChoiceChips } from '@danbro96/lupira-expo-paper/components/ChoiceChips';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import { MenuField } from '../components/MenuField';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { ReachIcon } from '../components/ReachIcon';
import type { PickedPlace, RootStackParamList } from '../navigation/types';
import { AddressForm } from '../places/AddressForm';
import { PlaceSearchSheet } from '../places/PlaceSearchSheet';
import { leaveScreen } from '../navigation/leaveScreen';
import { useUnsavedGuard } from '../navigation/useUnsavedGuard';
import { useColors, spacing } from '../theme';
import { ICONS } from '../icons';

const KIND_OPTIONS = [{ value: 'Individual', label: 'Person' }, { value: 'Organization', label: 'Organization' }];
const NAME_FORMAT_OPTIONS = Object.entries(DISPLAY_NAME_FORMAT_LABELS).map(([value, label]) => ({ value, label }));
const CHANNEL_TYPES = [null, ...SHARED_CHANNEL_TYPES] as const;
const MONTH_OPTIONS = monthNames().map((label, i) => ({ value: String(i + 1), label }));
const dayOptions = (month: string) =>
  Array.from({ length: daysInMonth(Number(month) || 1) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export function ContactEditScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'ContactEdit'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const contactId = route.params?.contactId;
  const { data: state } = useContactState(contactId ?? '');
  const { data: books } = useAddressBooks();
  const residencies = useContactResidencies(contactId);
  const residencyRows = useResidencyRows();
  const hints = useAddressHints(contactId);
  const { data: relations } = useContactRelations(contactId ?? '');
  const household = contactId
    ? householdHomes(contactId, (relations ?? []).map((r) => ({ contactId: r.otherId, displayName: r.displayName, kind: r.kind, ended: r.ended })), residencyRows)
    : [];
  const [addresses, setAddresses] = useState<AddressRow[] | null>(contactId ? null : []);
  const [addressBaseline, setAddressBaseline] = useState('[]');
  const [existingFor, setExistingFor] = useState<string | null>(null);
  const [appliedPick, setAppliedPick] = useState<PickedPlace | undefined>();

  const draft = contactId ? null : (route.params?.draft ?? contactDraftFromLink(route.params ?? {}));
  const [seed] = useState(() => (draft ? contactFormFromDraft(draft) : null));

  const [form, setForm] = useState<ContactForm>(() => seed?.form ?? { ...emptyContactForm(), displayNameFormat: contactId ? '' : 'FirstLast' });
  const [channels, setChannels] = useState<ReachChannel[]>(() => seed?.channels ?? []);
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [tagsCsv, setTagsCsv] = useState('');
  const [bookId, setBookId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(!contactId);
  /** Snapshot of the pristine form; anything different means unsaved work worth guarding. */
  const [baseline, setBaseline] = useState(() => snapshot(emptyContactForm(), [], [], ''));

  if (!seeded && contactId && state) {
    const seededForm = contactFormFromDoc(state.doc);
    const seededChannels = (state.doc.channels ?? []).map((ch) => ({ ...ch }));
    const seededProfiles = (state.doc.profiles ?? []).map((p) => ({ ...p }));
    const seededTags = visibleTags(state.doc.tags).join(', ');
    setForm(seededForm);
    setChannels(seededChannels);
    setProfiles(seededProfiles);
    setTagsCsv(seededTags);
    setBaseline(snapshot(seededForm, seededChannels, seededProfiles, seededTags));
    setSeeded(true);
  }
  if (!contactId && !bookId && books?.length) setBookId(books[0].id);
  if (addresses === null && residencies) {
    const seededRows = addressRowsFrom(residencies);
    setAddresses(seededRows);
    setAddressBaseline(JSON.stringify(seededRows));
  }
  const picked = route.params?.pickedPlace;
  if (picked && picked !== appliedPick) {
    setAppliedPick(picked);
    setAddresses((rows) => (rows ?? []).map((r) => (r.key === picked.target ? { ...r, placeId: picked.selection.placeId, label: picked.selection.label } : r)));
  }
  const rows = addresses ?? [];
  const setRow = (row: AddressRow) => setAddresses((all) => (all ?? []).map((r) => (r.key === row.key ? row : r)));

  const dirty = snapshot(form, channels, profiles, tagsCsv) !== baseline || JSON.stringify(rows) !== addressBaseline;

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const birthday: BirthdayFields = { yearKnown: form.birthdayYearKnown, date: form.birthday, month: form.birthdayMonth, day: form.birthdayDay };
  const setBirthday = (b: BirthdayFields) =>
    setForm((f) => ({ ...f, birthdayYearKnown: b.yearKnown, birthday: b.date, birthdayMonth: b.month, birthdayDay: b.day }));

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
    const addressError = addressSaveError(rows);
    if (addressError) {
      setError(addressError);
      return false;
    }
    setError(null);

    const cleanChannels = channels.filter((ch) => ch.value.trim());
    const cleanProfiles = profiles.filter((p) => p.service.trim() && p.handle.trim());
    const tags = withPinPreserved(parseList(tagsCsv), contactId ? state?.doc.tags : null);

    const saved = await saveContact(contactId, bookId, r.value, cleanChannels, cleanProfiles, tags, residencyChanges(rows), state?.doc, setError);
    if (saved) void dismissAddressHints(settledHintIds(rows));
    return saved;
  };

  const guard = useUnsavedGuard(dirty, {
    message: 'Save this contact edit before leaving?',
    onSave: submit,
  });

  const saveAndLeave = () => {
    void submit().then((saved) => {
      if (!saved) return;
      guard.leave();
      leaveScreen(navigation);
    });
  };

  // Save lives in the header; leaving without saving is guarded instead of needing a Cancel button.
  // Intentionally dependency-free: `save` closes over the live form state, so it must be re-bound
  // on every render.
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
    <>
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
        <TextField style={fieldGap} label="Given name" value={form.givenName} onChangeText={(v) => set('givenName', v)} />
        <TextField style={fieldGap} label="Middle name" value={form.middleName} onChangeText={(v) => set('middleName', v)} />
        <TextField style={fieldGap} label="Family name" value={form.familyName} onChangeText={(v) => set('familyName', v)} />
        <TextField style={fieldGap} label="Nickname" value={form.nickname} onChangeText={(v) => set('nickname', v)} />
        <Field label="Shown as">
          <ChoiceChips options={NAME_FORMAT_OPTIONS} value={form.displayNameFormat} onChange={(v) => set('displayNameFormat', v)} />
        </Field>
        <Field label="Kind">
          <ChoiceChips options={KIND_OPTIONS} value={form.kind} onChange={(v) => set('kind', v)} />
        </Field>
        <TextField style={fieldGap} label="Pronouns" autoCapitalize="none" value={form.pronouns} onChangeText={(v) => set('pronouns', v)} />

        <Field label="Birthday">
          <List.Item
            title="Enter year"
            right={() => (
              <Switch value={form.birthdayYearKnown} onValueChange={(v) => setBirthday(withYearKnown(birthday, v))} />
            )}
          />
          {form.birthdayYearKnown ? (
            <DateField
              value={form.birthday}
              onChange={(v) => set('birthday', v)}
              initial={birthday.month && birthday.day ? partialDateToInput({ year: null, month: Number(birthday.month), day: Number(birthday.day) }) : undefined}
            />
          ) : (
            <View style={styles.pair}>
              <View style={styles.pairItem}>
                <MenuField placeholder="Month" options={MONTH_OPTIONS} value={form.birthdayMonth} onChange={(m) => setBirthday({ ...birthday, month: m, day: clampBirthdayDay(m, birthday.day) })} />
              </View>
              <View style={styles.pairItem}>
                <MenuField placeholder="Day" options={dayOptions(form.birthdayMonth)} value={form.birthdayDay} onChange={(d) => set('birthdayDay', d)} />
              </View>
            </View>
          )}
          {contactId && <Text style={[styles.muted, { color: c.textMuted }]}>Clearing a birthday isn't supported — leave empty to keep it.</Text>}
        </Field>

        <List.Subheader>Reach</List.Subheader>
        {channels.map((ch, i) => (
          <View key={`ch-${i}`} style={styles.reachRow}>
            <ReachIcon kind={ch.medium} />
            <TextField
              label={ch.medium === 'Phone' ? '+46…' : 'name@example.com'}
              style={[fieldGap, styles.reachValue]}
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
            <TextField
              label="@handle or URL"
              style={[fieldGap, styles.reachValue]}
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

        <List.Subheader>Addresses</List.Subheader>
        {rows.filter((r) => !r.removed).map((row) => (
          <AddressForm
            key={row.key}
            row={row}
            seed={hints.find((h) => h.id === row.hintId)?.text}
            household={household.filter((h) => h.placeId !== row.placeId)}
            onChange={setRow}
            onRemove={() => setRow({ ...row, removed: true })}
            onUseExisting={() => setExistingFor(row.key)}
            onPickOnMap={(start) => navigation.navigate('PinPlace', { origin: 'ContactEdit', target: row.key, start, nameRequired: false })}
          />
        ))}
        {hints.some((h) => !rows.some((r) => r.hintId === h.id)) && (
          <Field label="From your phone">
            <View style={styles.addRow}>
              {hints.filter((h) => !rows.some((r) => r.hintId === h.id)).map((h) => (
                <Chip
                  key={h.id}
                  compact
                  mode="outlined"
                  icon={ICONS.place}
                  onPress={() => setAddresses((all) => [...(all ?? []), hintAddressRow(h, uuidv7())])}
                  onClose={() => void dismissAddressHints([h.id])}
                >
                  {h.text}
                </Chip>
              ))}
            </View>
          </Field>
        )}
        <List.Item
          title="Add address"
          left={(p) => <List.Icon {...p} icon={ICONS.add} />}
          onPress={() => setAddresses((all) => [...(all ?? []), newAddressRow(uuidv7())])}
        />

        <TextField style={fieldGap} label="Tags (comma-separated)" autoCapitalize="none" value={tagsCsv} onChangeText={setTagsCsv} />

        <TextField
          label="Notes"
          multiline
          numberOfLines={3}
          style={[fieldGap, { minHeight: 72 }]}
          value={form.notes}
          onChangeText={(v) => set('notes', v)}
        />

        <HelperText type="error" visible={!!error}>{error}</HelperText>
      </ScrollView>
      {existingFor && (
        <PlaceSearchSheet
          ctx={{ kind: 'residency', contactId: contactId ?? '', householdContactIds: household.flatMap((h) => h.contacts.map((m) => m.contactId)) }}
          hasPlace={false}
          onPick={(place) => {
            const row = rows.find((r) => r.key === existingFor);
            if (place && row) setRow({ ...row, placeId: place.placeId, label: place.label });
          }}
          onPickOnMap={(start) => navigation.navigate('PinPlace', { origin: 'ContactEdit', target: existingFor, start, nameRequired: false })}
          onDismiss={() => setExistingFor(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 48 },
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

async function saveContact(
  contactId: string | undefined,
  bookId: string,
  core: ContactCore,
  cleanChannels: ReachChannel[],
  cleanProfiles: SocialProfile[],
  tags: string[],
  addressChanges: ResidencyChange[],
  doc: ContactDoc | undefined,
  setError: (error: string | null) => void,
): Promise<boolean> {
  try {
    if (!contactId) {
      const id = await createContact(bookId, { ...core, channels: cleanChannels, tags });
      if (cleanProfiles.length > 0) await setContactProfiles(id, cleanProfiles);
      await saveResidencies(id, addressChanges);
    } else {
      await reviseContact(contactId, core);
      if (JSON.stringify(cleanChannels) !== JSON.stringify(doc?.channels ?? [])) await setContactChannels(contactId, cleanChannels);
      if (JSON.stringify(tags) !== JSON.stringify(doc?.tags ?? [])) await setContactTags(contactId, tags);
      if (JSON.stringify(cleanProfiles) !== JSON.stringify(doc?.profiles ?? [])) await setContactProfiles(contactId, cleanProfiles);
      await saveResidencies(contactId, addressChanges);
    }
    return true;
  } catch (e) {
    setError(errorText(e));
    return false;
  }
}
