import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Text } from 'react-native-paper';
import type { GeocodeResultDto } from '@lupira/cal-api/models';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import type { PickerPlace } from '@danbro96/lupira-domain-places/placeCandidates';
import { MIN_PLACE_QUERY, PLACE_SEARCH_DEBOUNCE_MS } from '@danbro96/lupira-domain-places/placeCandidates';
import { EMPHASIS } from '@lupira/cal-tokens/color';
import { createPlaceFromHit, type PlaceOption, useGeocodeHits, usePlaceCandidates } from '../../state/usePlaceSearch';
import { useSyncStatus } from '../../sync/syncStatus';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { fieldGap } from '@danbro96/lupira-expo-paper/theme/styles';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { ICONS } from '../icons';
import { useColors } from '../theme';

/** One ranked list of places that exist — saved, frequent, typeahead, and your contacts' addresses (search a
 *  name to find where they live; an invited person's home leads). Every row says who lives there. An address
 *  search is one tap further and creates the place it picks. Nothing is created on dismiss. Online-only, bar
 *  the contacts — the event itself saves offline. */
export function PlaceSheet({ hasPlace, attendeeIds, day, onPick, onDismiss }: {
  hasPlace: boolean;
  attendeeIds: string[];
  day: string | null;
  onPick: (place: PlaceOption | null) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  const reachable = useSyncStatus((s) => s.serverReachable);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), PLACE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const typing = q.length >= MIN_PLACE_QUERY;
  const { places, residentsNear } = usePlaceCandidates({ query: typing ? q : '', attendeeIds, day });
  const hits = useGeocodeHits(addressQuery);

  const pick = (place: PlaceOption | null) => {
    onPick(place);
    onDismiss();
  };

  const create = (hit: GeocodeResultDto) => createAndPick(hit, addressQuery, pick, setCreating);

  return (
    <Sheet anchor="top" onDismiss={onDismiss}>
      <TextField style={fieldGap}
        label="Search places"
        autoFocus
        value={text}
        onChangeText={(v) => {
          setText(v);
          setAddressQuery('');
        }}
        returnKeyType="search"
        onSubmitEditing={() => { if (text.trim().length >= MIN_PLACE_QUERY) setAddressQuery(text.trim()); }}
      />
      {!reachable && <Text style={[styles.muted, { color: c.textMuted }]}>Finding places needs a connection.</Text>}
      <ScrollView keyboardShouldPersistTaps="handled">
        {!typing && places.length > 0 && <List.Subheader>Suggested</List.Subheader>}
        {places.map((p) => <PlaceRow key={p.placeId} place={p} onPress={() => pick({ placeId: p.placeId, label: p.label })} />)}
        {typing && reachable && !addressQuery && (
          <List.Item
            title={`Search addresses for “${text.trim()}”`}
            left={(p) => <List.Icon {...p} icon={ICONS.search} />}
            onPress={() => setAddressQuery(text.trim())}
          />
        )}
        {!!addressQuery && <List.Subheader>New place</List.Subheader>}
        {!!addressQuery && hits.isLoading && <Text style={[styles.muted, { color: c.textMuted }]}>Looking…</Text>}
        {!!addressQuery && hits.data?.length === 0 && <Text style={[styles.muted, { color: c.textMuted }]}>No address matches.</Text>}
        {(addressQuery ? hits.data ?? [] : []).map((hit) => {
          const lives = residentsNear({ lat: hit.latitude, lon: hit.longitude });
          return (
            <List.Item
              key={`${hit.osmType ?? ''}${hit.osmId ?? `${hit.latitude},${hit.longitude}`}`}
              title={hit.displayName}
              titleNumberOfLines={2}
              description={lives ? () => <ResidentsLine text={lives} /> : undefined}
              left={(p) => <List.Icon {...p} icon={ICONS.add} />}
              disabled={creating}
              onPress={() => void create(hit)}
            />
          );
        })}
        {hasPlace && (
          <List.Item title="Remove place" left={(p) => <List.Icon {...p} icon={ICONS.locationOff} />} onPress={() => pick(null)} />
        )}
      </ScrollView>
    </Sheet>
  );
}

async function createAndPick(
  hit: GeocodeResultDto,
  addressQuery: string,
  pick: (place: PlaceOption) => void,
  setCreating: (creating: boolean) => void,
) {
  setCreating(true);
  try {
    pick(await createPlaceFromHit(hit, addressQuery));
  } catch {
    toastError('Could not create that place.');
  } finally {
    setCreating(false);
  }
}

/** A current resident outranks everything else the row could say, so it gets the icon and the colour. */
function PlaceRow({ place, onPress }: { place: PickerPlace; onPress: () => void }) {
  const c = useColors();
  const faded = place.viaContact && place.viaContact.status !== 'active';
  const icon = place.residentsLine ? ICONS.home : place.saved ? ICONS.saved : place.otherLine ? ICONS.history : ICONS.place;
  return (
    <List.Item
      title={place.label}
      style={faded ? styles.faded : undefined}
      description={() => (
        <View>
          {!!place.context && <Text numberOfLines={1} style={[styles.line, { color: c.textMuted }]}>{place.context}</Text>}
          {place.residentsLine
            ? <ResidentsLine text={place.residentsLine} />
            : !!place.otherLine && <Text numberOfLines={1} style={[styles.line, styles.other, { color: c.textMuted }]}>{place.otherLine}</Text>}
        </View>
      )}
      left={(p) => <List.Icon {...p} icon={icon} color={place.residentsLine ? c.primary : p.color} />}
      onPress={onPress}
    />
  );
}

function ResidentsLine({ text }: { text: string }) {
  const c = useColors();
  return <Text numberOfLines={1} style={[styles.line, { color: c.primary }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, marginVertical: 8 },
  line: { fontSize: 13 },
  other: { fontStyle: 'italic' },
  faded: { opacity: EMPHASIS.faded },
});
