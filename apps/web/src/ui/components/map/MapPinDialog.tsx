import { formatCoords } from '@danbro96/lupira-domain-places/places';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Marker, type MapMouseEvent } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { MapCanvas, useMap } from './MapCanvas';

type LatLon = { lat: number; lon: number };

/** Pick coordinates by clicking (or dragging the marker). Default export: pulls in maplibre-gl,
 *  so it must only ever be loaded via React.lazy. */
export default function MapPinDialog({ title, center, zoom, onConfirm, onCancel }: {
  title?: string;
  center?: [number, number];
  zoom?: number;
  onConfirm: (lat: number, lon: number) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState<LatLon | null>(null);

  return (
    <Dialog open onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title ?? 'Drop a pin'}</DialogTitle>
      <DialogContent>
        <div style={{ height: 420, display: 'flex' }}>
          <MapCanvas center={center} zoom={zoom}>
            <PinMarker pin={pin} onMove={setPin} />
          </MapCanvas>
        </div>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">
          {pin ? formatCoords(pin.lat, pin.lon) : 'Click the map to place the pin, then drag to fine-tune.'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!pin} onClick={() => pin && onConfirm(pin.lat, pin.lon)}>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PinMarker({ pin, onMove }: { pin: LatLon | null; onMove: (p: LatLon) => void }) {
  const map = useMap();
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    const onClick = (e: MapMouseEvent) => onMove({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, onMove]);

  useEffect(() => {
    if (!pin) return;
    if (!markerRef.current) {
      const marker = new Marker({ draggable: true }).setLngLat([pin.lon, pin.lat]).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        onMove({ lat: p.lat, lon: p.lng });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([pin.lon, pin.lat]);
    }
  }, [map, pin, onMove]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );

  return null;
}
