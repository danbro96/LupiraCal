import { Camera, Map as MapView, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Icon } from 'react-native-paper';
import type { GeoPoint } from '@danbro96/lupira-domain-places/geo';
import type { MapTheme } from '@danbro96/lupira-tokens-map/map';
import { fallbackStyle } from '../../data/mapStyle';
import { useMapStyle } from '../../state/useMapStyle';
import { ICONS } from '../icons';
import { useColors } from '../theme';
import { useMapAuthHeader } from './useMapAuthHeader';

const PIN = 40;

/** A map that pans under a fixed centre pin; the point is wherever the map comes to rest. */
export function PinMap({ center, zoom, onCenter }: { center: GeoPoint; zoom: number; onCenter: (point: GeoPoint) => void }) {
  const c = useColors();
  const theme: MapTheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  useMapAuthHeader();
  const { style, degraded } = useMapStyle(theme);
  const mapStyle = style ?? (degraded ? fallbackStyle(theme) : undefined);

  return (
    <View style={[styles.fill, { backgroundColor: c.surface }]}>
      {mapStyle && (
        <MapView
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle as unknown as StyleSpecification}
          touchRotate={false}
          touchPitch={false}
          logo={false}
          compass={false}
          onRegionDidChange={(e) => onCenter({ lon: e.nativeEvent.center[0], lat: e.nativeEvent.center[1] })}
        >
          <Camera initialViewState={{ center: [center.lon, center.lat], zoom }} />
        </MapView>
      )}
      <View style={styles.pin} pointerEvents="none">
        <Icon source={ICONS.place} size={PIN} color={c.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pin: { position: 'absolute', top: '50%', left: '50%', marginTop: -PIN, marginLeft: -PIN / 2 },
});
