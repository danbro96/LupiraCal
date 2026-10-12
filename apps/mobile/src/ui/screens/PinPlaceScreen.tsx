import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { TextField } from '@danbro96/lupira-expo-paper/components/TextField';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import type { PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { usePinSuggestion } from '../../state/usePinSuggestion';
import { usePlaceSearchMachine } from '../../state/usePlaceSearchMachine';
import { PinMap } from '../map/PinMap';
import type { RootStackParamList } from '../navigation/types';
import { spacing, useColors } from '../theme';

/** Drop a pin for a place no search finds. An event's pin needs a name (prefilled from the address under it); a
 *  contact's address may go unnamed and the server names it. */
export function PinPlaceScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const route = useRoute<RouteProp<RootStackParamList, 'PinPlace'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { origin, target, start, nameRequired } = route.params;
  const [center, setCenter] = useState<GeoPoint>({ lat: start.lat, lon: start.lon });
  const [typed, setTyped] = useState<string | null>(null);
  const suggestion = usePinSuggestion(center);

  const back = (selection: PlaceSelection) => {
    const pickedPlace = { selection, target };
    if (origin === 'ItemEdit') navigation.popTo('ItemEdit', { pickedPlace }, { merge: true });
    else navigation.popTo('ContactEdit', { pickedPlace }, { merge: true });
  };
  const { state, dispatch } = usePlaceSearchMachine({ pinNameRequired: nameRequired, pin: start, onResolved: back });
  const creating = state.phase.kind === 'creating';
  const name = typed ?? (nameRequired ? suggestion.name ?? '' : '');

  return (
    <View style={styles.screen}>
      <PinMap center={center} zoom={start.zoom} onCenter={setCenter} />
      <View style={[styles.panel, { backgroundColor: c.bg, paddingBottom: insets.bottom + spacing.md }]}>
        <TextField
          label={nameRequired ? 'Name' : 'Name (optional)'}
          placeholder={nameRequired ? undefined : suggestion.name ?? undefined}
          value={name}
          onChangeText={setTyped}
        />
        <HelperText type={state.error ? 'error' : 'info'} visible={!!state.error || !online}>
          {state.error ?? 'Needs a connection'}
        </HelperText>
        <Button
          title="Use this place"
          disabled={!online || creating}
          loading={creating}
          onPress={() => dispatch({ type: 'PIN_CONFIRM', lat: center.lat, lon: center.lon, name })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  panel: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
