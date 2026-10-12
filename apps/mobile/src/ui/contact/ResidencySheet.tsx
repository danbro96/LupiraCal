import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { List, Text } from 'react-native-paper';
import { ContactAddressType } from '@lupira/cal-api/models';
import { errorText } from '@danbro96/lupira-http/apiError';
import { addressTypeLabel } from '@danbro96/lupira-domain-contacts/residents';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import type { ResidencyDoc } from '../../domain/docTypes';
import { deleteResidency, saveResidency } from '../../state/useResidencies';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { PlaceSheet } from '../event/PlaceSheet';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const TYPES = Object.values(ContactAddressType);

/** Add or correct one of a contact's addresses: the place (the event editor's place sheet) and its type. Saved
 *  straight to the server, so it needs a connection; periods and labels stay on the web. */
export function ResidencySheet({ contactId, residency, onDismiss }: {
  contactId: string;
  residency: ResidencyDoc | null;
  onDismiss: () => void;
}) {
  const c = useColors();
  const online = useOnline();
  const confirm = useConfirm();
  const known = usePlaceCoords([residency?.placeId]);
  const [place, setPlace] = useState<{ placeId: string; label: string } | null>(null);
  const [type, setType] = useState<ContactAddressType>(() => TYPES.find((t) => t === residency?.type) ?? ContactAddressType.Home);
  const [picking, setPicking] = useState(!residency);
  const [busy, setBusy] = useState(false);

  const placeId = place?.placeId ?? residency?.placeId ?? null;
  const placeLabel = place?.label ?? (residency ? known.get(residency.placeId)?.name ?? '…' : null);

  const run = (write: () => Promise<void>) => writeAndClose(write, setBusy, onDismiss);

  if (picking) {
    return (
      <PlaceSheet
        hasPlace={false}
        attendeeIds={[]}
        day={null}
        onPick={(p) => setPlace(p)}
        onDismiss={() => setPicking(false)}
      />
    );
  }

  return (
    <Sheet title={residency ? 'Address' : 'New address'} onDismiss={onDismiss}>
      <List.Item
        title={placeLabel ?? 'Pick a place'}
        left={(p) => <List.Icon {...p} icon={ICONS.place} />}
        onPress={() => setPicking(true)}
      />
      <SegmentedPicker options={TYPES} selected={type} onSelect={setType} getLabel={addressTypeLabel} />
      {!online && <Text style={[styles.muted, { color: c.textMuted }]}>Changing addresses needs a connection.</Text>}
      <View style={styles.actions}>
        {residency && (
          <Button
            title="Remove"
            variant="destructive"
            disabled={busy || !online}
            onPress={() => {
              void confirm({
                title: 'Remove this address?',
                message: 'Only for an address entered by mistake — a move is a moved-out date.',
                confirmLabel: 'Remove',
                destructive: true,
              }).then((ok) => {
                if (ok) void run(() => deleteResidency(residency.id));
              });
            }}
          />
        )}
        <Button
          title="Save"
          disabled={!placeId || busy || !online}
          loading={busy}
          onPress={() => void run(() => saveResidency(contactId, residency, placeId!, type))}
        />
      </View>
    </Sheet>
  );
}

async function writeAndClose(write: () => Promise<void>, setBusy: (busy: boolean) => void, close: () => void) {
  setBusy(true);
  try {
    await write();
    close();
  } catch (e) {
    toastError(errorText(e));
  } finally {
    setBusy(false);
  }
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, marginTop: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
});
