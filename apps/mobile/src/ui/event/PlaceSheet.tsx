import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import type { GeocodeResultDto } from '@lupira/cal-api/models';
import { toastError } from '../../feedback/toast';
import { createPlaceFromHit, type PlaceOption, useFrequentPlaces, useGeocodeHits, useSuggestedPlaces } from '../../state/usePlaceSearch';
import { useSyncStatus } from '../../sync/syncStatus';
import { Input } from '../components/Input';
import { Sheet } from '../components/Sheet';
import { ICONS } from '../icons';
import { useColors } from '../theme';

/** Existing places first (frequent ones before typing, typeahead after); an address search is one tap further
 *  and creates the place it picks. Nothing is created on dismiss. Online-only — the event itself saves offline. */
export function PlaceSheet({ hasPlace, onPick, onDismiss }: {
  hasPlace: boolean;
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
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const typing = q.length >= 2;
  const frequent = useFrequentPlaces(!typing);
  const suggested = useSuggestedPlaces(q);
  const hits = useGeocodeHits(addressQuery);
  const options = (typing ? suggested.data : frequent.data) ?? [];

  const pick = (place: PlaceOption | null) => {
    onPick(place);
    onDismiss();
  };

  const create = async (hit: GeocodeResultDto) => {
    setCreating(true);
    try {
      pick(await createPlaceFromHit(hit, addressQuery));
    } catch {
      toastError('Could not create that place.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet anchor="top" onDismiss={onDismiss}>
      <Input
        label="Search places"
        autoFocus
        value={text}
        onChangeText={(v) => {
          setText(v);
          setAddressQuery('');
        }}
        returnKeyType="search"
        onSubmitEditing={() => { if (text.trim().length >= 2) setAddressQuery(text.trim()); }}
      />
      {!reachable && <Text style={[styles.muted, { color: c.textMuted }]}>Finding places needs a connection.</Text>}
      <ScrollView keyboardShouldPersistTaps="handled">
        {!typing && options.length > 0 && <List.Subheader>Frequent</List.Subheader>}
        {options.map((o) => (
          <List.Item
            key={o.placeId}
            title={o.label}
            description={o.context ?? undefined}
            left={(p) => <List.Icon {...p} icon={ICONS.place} />}
            onPress={() => pick(o)}
          />
        ))}
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
        {(addressQuery ? hits.data ?? [] : []).map((hit) => (
          <List.Item
            key={`${hit.osmType ?? ''}${hit.osmId ?? `${hit.latitude},${hit.longitude}`}`}
            title={hit.displayName}
            titleNumberOfLines={2}
            left={(p) => <List.Icon {...p} icon={ICONS.add} />}
            disabled={creating}
            onPress={() => void create(hit)}
          />
        ))}
        {hasPlace && (
          <List.Item title="Remove place" left={(p) => <List.Icon {...p} icon={ICONS.locationOff} />} onPress={() => pick(null)} />
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 13, marginVertical: 8 },
});
