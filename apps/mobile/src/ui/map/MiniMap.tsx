import { Camera, Map as MapView, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { zoomForSpan } from '@lupira/cal-domain/mapZoom';
import type { MapTheme } from '@lupira/cal-tokens/map';
import { fallbackStyle } from '../../data/mapStyle';
import { useMapStyle } from '../../state/useMapStyle';
import { ICONS } from '../icons';
import { radii, useColors } from '../theme';
import { useMapAuthHeader } from './useMapAuthHeader';

const PIN = 22;

/** A still thumbnail of the basemap around one point, zoomed so `spanM` metres fit across it. Each one is a GL
 *  view, so it belongs on detail screens, never in a list. Texture mode, because a SurfaceView ignores the
 *  rounded clip and lags a scrolling parent. The pin is an overlay: the camera never moves, so the centre is
 *  the point. */
export function MiniMap({ point, size, spanM }: { point: { lat: number; lon: number } | null; size: number; spanM: number }) {
  const c = useColors();
  const theme: MapTheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  useMapAuthHeader();
  const { style, degraded } = useMapStyle(theme);
  const mapStyle = style ?? (degraded ? fallbackStyle(theme) : undefined);
  const box = { width: size, height: size, borderRadius: radii.md, backgroundColor: c.surface };

  return (
    <View style={[styles.box, box]} pointerEvents="none">
      {point && mapStyle ? (
        <>
          <MapView
            style={StyleSheet.absoluteFill}
            androidView="texture"
            mapStyle={mapStyle as unknown as StyleSpecification}
            dragPan={false}
            touchZoom={false}
            touchRotate={false}
            touchPitch={false}
            doubleTapZoom={false}
            attribution={false}
            logo={false}
            compass={false}
          >
            <Camera initialViewState={{ center: [point.lon, point.lat], zoom: zoomForSpan(spanM, size, point.lat) }} />
          </MapView>
          <View style={[styles.pin, { top: size / 2 - PIN, left: (size - PIN) / 2 }]}>
            <Icon source={ICONS.place} size={PIN} color={c.primary} />
          </View>
        </>
      ) : (
        <Icon source={ICONS.place} size={PIN} color={c.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute' },
});
