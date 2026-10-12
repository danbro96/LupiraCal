import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, List, Text } from 'react-native-paper';
import type { GeocodeResultDto } from '@lupira/cal-api/models';
import { ContactAddressType } from '@lupira/cal-api/models';
import { errorText } from '@danbro96/lupira-http/apiError';
import { fmtFuzzyDate, residencyStatus } from '@danbro96/lupira-domain-contacts/fuzzyDate';
import { addressTypeLabel, type HouseholdHome } from '@danbro96/lupira-domain-contacts/residents';
import { placeSpanM } from '@danbro96/lupira-domain-maps/mapZoom';
import { pinStart, type PinStart } from '@danbro96/lupira-domain-places/pin';
import { placeTitle } from '@danbro96/lupira-domain-places/places';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { useConfirm } from '@danbro96/lupira-expo-paper/components/ConfirmDialog';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { EMPTY_ADDRESS_DRAFT, draftFromComponents, residencyRowState, type AddressDraft } from '@lupira/cal-domain/addressDraft';
import { EMPHASIS } from '@lupira/cal-tokens/color';
import type { AddressRow } from '../../domain/addressRows';
import { placeFromAddressHit } from '../../state/placeCommands';
import { useAddressLookup } from '../../state/useAddressLookup';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { ICONS } from '../icons';
import { MiniMap } from '../map/MiniMap';
import { spacing, useColors } from '../theme';

const TYPES = Object.values(ContactAddressType);
const THUMB = 72;

/** One of a contact's addresses, typed as street, postcode, town and country. A matching address becomes the
 *  place and shows on a mini-map to confirm; the pin can be adjusted, an existing place or a relative's home
 *  used instead. A half-typed address blocks the contact's save. */
export function AddressForm({ row, household, onChange, onRemove, onUseExisting, onPickOnMap }: {
  row: AddressRow;
  household: readonly HouseholdHome[];
  onChange: (row: AddressRow) => void;
  onRemove: () => void;
  onUseExisting: () => void;
  onPickOnMap: (start: PinStart) => void;
}) {
  const c = useColors();
  const online = useOnline();
  const confirm = useConfirm();
  const [resolving, setResolving] = useState(false);
  const place = usePlaceCoords([row.placeId]).get(row.placeId ?? '');
  const lookup = useAddressLookup(row.placeId ? EMPTY_ADDRESS_DRAFT : row.draft);
  const point = place?.latitude != null && place.longitude != null ? { lat: place.latitude, lon: place.longitude } : null;
  const status = residencyStatus(row.stored?.movedIn ?? null, row.movedOut);
  const drafting = residencyRowState(row) === 'drafting';

  const setDraft = <K extends keyof AddressDraft>(key: K, value: string) => onChange({ ...row, draft: { ...row.draft, [key]: value } });
  const takePlace = (placeId: string, label: string) => onChange({ ...row, placeId, label });
  const remove = () => {
    if (!row.stored) {
      onRemove();
      return;
    }
    void confirm({
      title: 'Remove this address?',
      message: 'Only for an address entered by mistake — a move is a moved-out date.',
      confirmLabel: 'Remove',
      destructive: true,
    }).then((ok) => {
      if (ok) onRemove();
    });
  };
  const today = new Date();
  const moveOut = () => onChange({ ...row, movedOut: { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() } });

  return (
    <View style={[styles.row, status === 'former' && styles.former]}>
      <SegmentedPicker options={TYPES} selected={(TYPES.find((t) => t === row.type) ?? 'Home')} onSelect={(type) => onChange({ ...row, type })} getLabel={addressTypeLabel} />
      {row.placeId ? (
        <>
          <View style={styles.resolved}>
            <MiniMap point={point} size={THUMB} spanM={placeSpanM(place)} />
            <View style={styles.body}>
              <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>{placeTitle(row.label, place?.name, row.placeId)}</Text>
              {!!place?.formattedAddress && place.formattedAddress !== place.name && (
                <Text style={[styles.line, { color: c.textMuted }]} numberOfLines={2}>{place.formattedAddress}</Text>
              )}
              {!!row.movedOut && <Text style={[styles.line, { color: c.textMuted }]}>Moved out {fmtFuzzyDate(row.movedOut)}</Text>}
            </View>
          </View>
          <View style={styles.actions}>
            {point && <Button variant="text" title="Adjust pin" disabled={!online} onPress={() => onPickOnMap({ ...point, zoom: 17 })} />}
            <Button variant="text" title="Change" onPress={() => onChange({ ...row, placeId: null, label: '' })} />
            {row.stored && !row.movedOut && status === 'active' && <Button variant="text" title="Moved out" onPress={moveOut} />}
            <Button variant="text" title="Remove" onPress={remove} />
          </View>
        </>
      ) : (
        <>
          <TextField style={fieldGap} label="Street and number" value={row.draft.street} onChangeText={(v) => setDraft('street', v)} />
          <View style={styles.pair}>
            <TextField style={[fieldGap, styles.postcode]} label="Postcode" value={row.draft.postcode} onChangeText={(v) => setDraft('postcode', v)} />
            <TextField style={[fieldGap, styles.city]} label="City" value={row.draft.locality} onChangeText={(v) => setDraft('locality', v)} />
            <TextField
              style={[fieldGap, styles.country]}
              label="Country"
              autoCapitalize="characters"
              maxLength={2}
              value={row.draft.countryCode}
              onChangeText={(v) => setDraft('countryCode', v.toUpperCase())}
            />
          </View>
          {drafting && !online && <Text style={[styles.muted, { color: c.textMuted }]}>Finding the address needs a connection.</Text>}
          {(lookup.data ?? []).map((hit, i) => (
            <List.Item
              key={`${hit.osmType ?? ''}${hit.osmId ?? i}`}
              title={hit.displayName}
              titleNumberOfLines={2}
              left={(p) => <List.Icon {...p} icon={ICONS.place} />}
              disabled={resolving}
              onPress={() => void resolveHit(hit, row, onChange, setResolving)}
            />
          ))}
          {drafting && lookup.data?.length === 0 && <Text style={[styles.muted, { color: c.textMuted }]}>No address matches — pick it on the map.</Text>}
          {household.length > 0 && (
            <View style={styles.chips}>
              {household.map((h) => (
                <Chip key={h.placeId} compact mode="outlined" icon={ICONS.home} onPress={() => takePlace(h.placeId, '')}>
                  {`Same as ${h.contacts.map((m) => m.displayName).join(' & ')}`}
                </Chip>
              ))}
            </View>
          )}
          <View style={styles.actions}>
            <Button variant="text" title="Use existing place" onPress={onUseExisting} />
            <Button variant="text" title="Pick on map" disabled={!online} onPress={() => onPickOnMap(pinStart({ hits: lookup.data ?? [] }))} />
            <Button variant="text" title="Remove" onPress={remove} />
          </View>
        </>
      )}
    </View>
  );
}

async function resolveHit(hit: GeocodeResultDto, row: AddressRow, onChange: (row: AddressRow) => void, setResolving: (busy: boolean) => void) {
  setResolving(true);
  try {
    const place = await placeFromAddressHit(hit);
    onChange({ ...row, placeId: place.placeId, label: place.label, draft: draftFromComponents(hit) });
  } catch (e) {
    toastError(errorText(e));
  } finally {
    setResolving(false);
  }
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.sm, gap: spacing.xs },
  former: { opacity: EMPHASIS.faded },
  resolved: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '500' },
  line: { fontSize: 13 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  postcode: { flex: 2 },
  city: { flex: 3 },
  country: { flex: 1.3 },
  muted: { fontSize: 13, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
});
