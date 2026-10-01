import { visibleTags } from '@lupira/cal-domain/contactTiers';
import { birthdayAgeLine, nextBirthday, turningAge } from '@lupira/cal-domain/birthday';
import { initialsOf } from '@lupira/cal-domain/contactNames';
import { channelLabel, reachLink } from '@lupira/cal-domain/reach';
import { fmtPartialDate } from '@lupira/cal-domain/partialDate';
import { addressMeta, withResidency } from '@lupira/cal-domain/residents';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, List, Text } from 'react-native-paper';
import { getDb } from '../../data/db/expoDb';
import { composeDisplayName, loadContact } from '../../data/mirror';
import type { PartialDateDto } from '../../domain/docTypes';
import { copyText } from '../../feedback/copy';
import { deleteContact } from '../../state/actions';
import { useContactRelations, useContactState } from '../../state/useContactList';
import { Centered } from '../components/Centered';
import { useConfirm } from '../components/ConfirmDialog';
import { PlaceTile } from '../components/PlaceTile';
import { TagRow } from '../components/TagRow';
import { avatarColor } from '../hooks/palette';
import { ReachIcon } from '../components/ReachIcon';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

/** Read-only overview — ALL editing lives on the edit screen. Shows everything the mirror doc carries:
 *  names, kind, pronouns, birthday+age, deceased, unified reach (channels + profiles), addresses (current
 *  ones as place tiles; past and future folded away), notes, emergency contacts, relations with names
 *  resolved from the mirror, and — least prominent — tags and metadata. */
export function ContactDetailScreen() {
  const c = useColors();
  const route = useRoute<RouteProp<RootStackParamList, 'ContactDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { contactId } = route.params;
  const { data: state, isLoading } = useContactState(contactId);
  const { data: relations = [] } = useContactRelations(contactId);
  const confirm = useConfirm();
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [otherAddressesOpen, setOtherAddressesOpen] = useState(false);
  const name = state ? composeDisplayName(state.doc) : '';

  // Edit/Delete live in the native header; delete always confirms (it syncs to the whole family).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Button mode="text" compact onPress={() => navigation.navigate('ContactEdit', { contactId })}>
            Edit
          </Button>
          <Button
            mode="text"
            compact
            textColor={c.danger}
            onPress={() =>
              void confirm({
                title: 'Delete contact',
                message: `Delete ${name || 'this contact'}? It syncs to everyone.`,
                confirmLabel: 'Delete',
                destructive: true,
              }).then((ok) => {
                if (ok) void deleteContact(contactId).then(() => navigation.goBack());
              })
            }
          >
            Delete
          </Button>
        </View>
      ),
    });
  }, [navigation, contactId, name, confirm, c]);

  if (isLoading) return <Centered text="Loading…" />;
  if (!state) return <Centered text="This contact is not in the offline mirror." />;
  const doc = state.doc;
  const displayName = composeDisplayName(doc);
  const currentRelations = relations.filter((r) => !r.ended);
  const emergency = (doc.emergencyContactIds as string[] | undefined) ?? [];
  const addresses = (doc.addresses ?? []).map((a) => withResidency(a));
  const currentAddresses = addresses.filter((a) => a.status === 'active');
  const otherAddresses = addresses.filter((a) => a.status !== 'active');
  const metadata = Object.entries(doc.metadata ?? {});
  const deceased = doc.deceased === true;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {state.deleted && <Text style={[styles.inset, styles.deletedNote, { color: c.danger }]}>Deleted — pending sync</Text>}
      <View style={[styles.inset, styles.header]}>
        <Avatar.Text size={52} label={initialsOf(displayName)} style={{ backgroundColor: avatarColor(contactId) }} />
        <View style={styles.headerBody}>
          <Text style={styles.h1} onLongPress={displayName ? () => copyText(displayName, 'Name') : undefined}>
            {displayName}{deceased ? ' †' : ''}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            {[doc.pronouns, doc.kind === 'Organization' ? 'Organization' : null, doc.nickname ? `“${doc.nickname}”` : null]
              .filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {doc.birthday != null && <BirthdayRow birthday={doc.birthday} deceased={deceased} />}
      {deceased && (
        <Text style={[styles.inset, styles.deceased, { color: c.textMuted }]}>
          Deceased{typeof doc.deathDate === 'string' ? ` — ${doc.deathDate}` : ''}
        </Text>
      )}

      <List.Subheader>Reach</List.Subheader>
      {(doc.channels ?? []).length === 0 && (doc.profiles ?? []).length === 0 && (
        <Text style={[styles.inset, styles.muted, { color: c.textMuted }]}>Nothing yet</Text>
      )}
      {(doc.channels ?? []).map((ch, i) => (
        <List.Item
          key={`ch-${i}`}
          onPress={() => openReach(ch.medium, ch.value)}
          onLongPress={() => copyText(ch.value, ch.medium)}
          accessibilityHint="Hold to copy"
          title={ch.preferred ? <>{ch.value} <Glyph name={ICONS.star} /></> : ch.value}
          description={channelLabel(ch.medium, ch.type)}
          style={styles.dense}
          left={() => <ReachIcon kind={ch.medium} />}
        />
      ))}
      {(doc.profiles ?? []).map((p, i) => (
        <List.Item
          key={`pr-${i}`}
          onPress={() => openReach(p.service, p.handle)}
          onLongPress={() => copyText(p.handle, p.service)}
          accessibilityHint="Hold to copy"
          title={p.preferred ? <>{p.handle} <Glyph name={ICONS.star} /></> : p.handle}
          description={p.service}
          style={styles.dense}
          left={() => <ReachIcon kind={p.service} />}
        />
      ))}

      {addresses.length > 0 && <List.Subheader>Addresses</List.Subheader>}
      {currentAddresses.map((a, i) => (
        <PlaceTile key={`now-${i}`} placeId={a.placeId} meta={addressMeta(a)} directions />
      ))}
      {otherAddresses.length > 0 && (
        <List.Accordion
          title={`Previous & upcoming (${otherAddresses.length})`}
          titleStyle={[styles.accordionTitle, { color: c.textMuted }]}
          style={styles.dense}
          expanded={otherAddressesOpen}
          onPress={() => setOtherAddressesOpen((o) => !o)}
        >
          {otherAddresses.map((a, i) => <PlaceTile key={`other-${i}`} placeId={a.placeId} meta={addressMeta(a)} muted />)}
        </List.Accordion>
      )}

      {doc.notes ? (
        <>
          <List.Subheader>Notes</List.Subheader>
          <Text style={[styles.inset, styles.notes]}>{doc.notes}</Text>
        </>
      ) : null}

      {emergency.length > 0 && (
        <>
          <List.Subheader>Emergency contacts</List.Subheader>
          {emergency.map((id, i) => <ResolvedName key={id} contactId={id} prefix={`${i + 1}. `} navigation={navigation} />)}
        </>
      )}

      {currentRelations.length > 0 && (
        <List.Accordion
          title={`Relations (${currentRelations.length})`}
          expanded={relationsOpen}
          onPress={() => setRelationsOpen((o) => !o)}
        >
          {currentRelations.map((r) => (
            <List.Item
              key={`${r.otherId}-${r.kind}`}
              onPress={() => navigation.push('ContactDetail', { contactId: r.otherId })}
              description={r.label ?? r.kind}
              style={styles.dense}
              title={r.displayName}
            />
          ))}
        </List.Accordion>
      )}

      <TagRow tags={visibleTags(doc.tags)} />

      {metadata.length > 0 && (
        <>
          <List.Subheader>Metadata</List.Subheader>
          {metadata.map(([k, v]) => (
            <Text key={k} style={[styles.inset, styles.row]}>
              <Text style={[styles.rowKind, { color: c.textMuted }]}>{k}  </Text>
              {typeof v === 'string' ? v : JSON.stringify(v)}
            </Text>
          ))}
        </>
      )}

      {typeof doc.updatedAt === 'string' && (
        <Text style={[styles.inset, styles.footer, { color: c.textMuted }]}>Updated {new Date(doc.updatedAt).toLocaleString()}</Text>
      )}

    </ScrollView>
  );
}

function openReach(kind: string, value: string): void {
  const url = reachLink(kind, value);
  if (url) void Linking.openURL(url).catch(() => undefined);
}

function BirthdayRow({ birthday, deceased }: { birthday: PartialDateDto; deceased: boolean }) {
  const c = useColors();
  const { year, month, day } = birthday;
  const next = nextBirthday(month, day, new Date());
  const age = turningAge(year, next);
  return (
    <Text style={[styles.inset, styles.birthday, { color: c.warning }]}>
      <Glyph name={ICONS.cake} /> {fmtPartialDate(birthday)}
      {age != null ? ` · ${birthdayAgeLine(age, next, deceased)}` : ''}
    </Text>
  );
}

function ResolvedName({ contactId, prefix, navigation }: {
  contactId: string;
  prefix: string;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await loadContact(await getDb(), contactId);
      if (!cancelled) setName(state ? composeDisplayName(state.doc) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <List.Item
      onPress={() => name && navigation.push('ContactDetail', { contactId })}
      description={prefix}
      style={styles.dense}
      title={name ?? '(not in mirror)'}
    />
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.md },
  // Paper's list rows and subheaders bring their own 16dp; everything else lines up with them.
  inset: { paddingHorizontal: spacing.lg },
  dense: { paddingVertical: 0 },
  deletedNote: { fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerBody: { flex: 1 },
  h1: { fontSize: 20, fontWeight: '600' },
  sub: { fontSize: 13 },
  birthday: { fontSize: 14, marginTop: spacing.sm },
  deceased: { fontSize: 13, fontStyle: 'italic' },
  row: { fontSize: 14, paddingVertical: 2 },
  rowKind: { fontSize: 13 },
  muted: { fontSize: 13 },
  notes: { fontSize: 14 },
  accordionTitle: { fontSize: 14 },
  footer: { fontSize: 11, marginTop: spacing.md, marginBottom: spacing.lg },
  headerActions: { flexDirection: 'row', paddingRight: 4 },
});
