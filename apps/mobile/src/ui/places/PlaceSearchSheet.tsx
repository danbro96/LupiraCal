import { ScrollView, StyleSheet } from 'react-native';
import { HelperText, List, Text } from 'react-native-paper';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { pinStart, type PinStart } from '@danbro96/lupira-domain-places/pin';
import { MIN_PLACE_QUERY } from '@danbro96/lupira-domain-places/placeCandidates';
import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { PLACE_SEARCH_PROMPT, type OmniboxRow, type OmniboxSection, type OmniboxSectionKind } from '@lupira/cal-domain/placeOmnibox';
import { predictionReasonText } from '@lupira/cal-domain/placePrediction';
import type { PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { useContactList } from '../../state/useContactList';
import { usePlaceOmnibox } from '../../state/usePlaceOmnibox';
import { ICONS } from '../icons';
import { spacing, useColors } from '../theme';

const TITLES: Record<OmniboxSectionKind, string | null> = {
  forCategory: 'Suggested',
  predictions: 'Suggested',
  homes: 'Homes',
  saved: 'Saved',
  frequent: 'Frequent',
  yours: 'Your places',
  addresses: 'Addresses',
  pin: null,
};

const SECTION_ICONS: Partial<Record<OmniboxSectionKind, string>> = { homes: ICONS.home, saved: ICONS.saved, frequent: ICONS.history };

/** Every way to a place in one search: places you know first, then addresses (picking one creates the place),
 *  then a pin on the map. Addresses and the pin need a connection; the places you know don't. */
export function PlaceSearchSheet({ ctx, seed, hasPlace, onPick, onPickOnMap, onDismiss }: {
  ctx: PlaceContext;
  seed?: string;
  hasPlace: boolean;
  onPick: (place: PlaceSelection | null) => void;
  onPickOnMap: (start: PinStart) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const { data: contacts } = useContactList();
  const pick = (place: PlaceSelection | null) => {
    onPick(place);
    onDismiss();
  };
  const { state, dispatch, pickHit, sections, ranked, online } = usePlaceOmnibox(ctx, { seed, onResolved: pick });
  const busy = state.phase.kind === 'resolving';
  const nameOf = (id: string) => contacts?.find((x) => x.id === id)?.displayName ?? 'Someone';
  const residents = (placeId: string) => ranked.find((p) => p.placeId === placeId)?.residentsLine ?? null;
  const origin = ctx.kind === 'event' ? ctx.origin : ctx.kind === 'free' ? ctx.near : undefined;

  const describe = (row: Extract<OmniboxRow, { kind: 'place' }>) => {
    const lines = [
      row.reasons?.map((r) => predictionReasonText(r, nameOf)).join(' · '),
      residents(row.placeId),
      row.alreadyAPlace ? `Already a place: ${row.alreadyAPlace.displayName}` : row.context,
    ].filter(Boolean);
    return lines.length > 0 ? lines.join('\n') : undefined;
  };

  const renderRow = (section: OmniboxSection, row: OmniboxRow, i: number) => {
    const disabled = busy || !!section.disabled;
    switch (row.kind) {
      case 'place': {
        const prediction = section.kind === 'forCategory' || section.kind === 'predictions';
        return (
          <List.Item
            key={row.placeId}
            title={row.label}
            description={describe(row)}
            descriptionNumberOfLines={3}
            left={(p) => <List.Icon {...p} icon={SECTION_ICONS[section.kind] ?? (residents(row.placeId) ? ICONS.home : ICONS.place)} />}
            disabled={busy}
            onPress={() => dispatch({ type: 'PICK_PLACE', placeId: row.placeId, label: row.label, via: prediction ? 'prediction' : 'search' })}
          />
        );
      }
      case 'address':
        return (
          <List.Item
            key={`${row.hit.osmType ?? ''}${row.hit.osmId ?? i}`}
            title={row.hit.displayName}
            titleNumberOfLines={2}
            left={(p) => <List.Icon {...p} icon={ICONS.add} />}
            disabled={disabled}
            onPress={() => pickHit(row.hit)}
          />
        );
      case 'pin':
        return (
          <List.Item
            key="pin"
            title="Pick on map"
            description={section.disabled ? 'Needs a connection' : undefined}
            left={(p) => <List.Icon {...p} icon={ICONS.pinDrop} />}
            disabled={disabled}
            onPress={() => {
              onDismiss();
              onPickOnMap(pinStart({ origin, hits: state.hits }));
            }}
          />
        );
    }
  };

  return (
    <Sheet anchor="top" onDismiss={onDismiss}>
      <TextField
        style={fieldGap}
        label={PLACE_SEARCH_PROMPT}
        autoFocus
        value={state.text}
        onChangeText={(text) => dispatch({ type: 'TYPE', text })}
        returnKeyType="search"
        onSubmitEditing={() => { if (online && state.text.trim().length >= MIN_PLACE_QUERY) dispatch({ type: 'SEARCH' }); }}
      />
      <HelperText type="error" visible={!!state.error}>{state.error}</HelperText>
      <ScrollView keyboardShouldPersistTaps="handled">
        {busy && <Text style={[styles.muted, { color: c.textMuted }]}>Creating the place…</Text>}
        {sections.map((section) => (
          <List.Section key={section.kind} style={styles.section}>
            {!!TITLES[section.kind] && <List.Subheader>{TITLES[section.kind]}</List.Subheader>}
            {section.kind === 'addresses' && section.disabled && (
              <Text style={[styles.muted, { color: c.textMuted }]}>Needs a connection</Text>
            )}
            {section.rows.map((row, i) => renderRow(section, row, i))}
          </List.Section>
        ))}
        {hasPlace && (
          <List.Item title="Remove place" left={(p) => <List.Icon {...p} icon={ICONS.locationOff} />} onPress={() => pick(null)} />
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: 0 },
  muted: { fontSize: 13, marginVertical: spacing.sm, paddingHorizontal: spacing.lg },
});
