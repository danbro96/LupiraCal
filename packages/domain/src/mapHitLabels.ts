// What a map preview says about each kind of hit, and the ways into a full screen it offers. Both apps
// render these; each maps an action to its own navigation.

import { displayTitle } from './itemLabels';
import type { MapHit } from './mapHits';
import { hotspotStats } from './mapFeatures';
import { addressTypeLabel } from './residents';
import { fmtDate, fmtDateTime, fmtTime, parseYmd } from './time';

export type HitAction = 'open' | 'day' | 'zoom' | 'place';

export interface HitText {
  title: string;
  detail: string[];
}

export function describeHit(hit: MapHit): HitText {
  switch (hit.kind) {
    case 'event':
      return { title: displayTitle(hit.title), detail: hit.start ? [fmtDateTime(new Date(hit.start))] : [] };
    case 'contact': {
      const where = [hit.addressType ? addressTypeLabel(hit.addressType) : hit.residency === 'active' ? 'Lives here' : null, hit.placeName].filter(Boolean).join(' · ');
      const when = hit.residency === 'future' ? `moves in ${hit.period ?? ''}`.trim() : hit.residency === 'former' ? `lived here ${hit.period ?? ''}`.trim() : null;
      return { title: hit.name, detail: [where, when].filter((x): x is string => !!x) };
    }
    case 'photo':
      return { title: hit.placeLabel ?? 'Photo', detail: [fmtDateTime(new Date(hit.takenAt))] };
    case 'photoCell':
      return { title: `${hit.count} photos`, detail: ['Zoom in to see them'] };
    case 'saved':
      return { title: hit.label, detail: ['Saved place'] };
    case 'hotspot':
      return {
        title: hit.label ?? 'Unnamed spot',
        detail: [hotspotStats(hit), hit.firstDay && hit.lastDay ? `${fmtDate(parseYmd(hit.firstDay))} – ${fmtDate(parseYmd(hit.lastDay))}` : '']
          .filter(Boolean),
      };
    case 'visit':
      return {
        title: hit.placeLabel ?? 'Stay',
        detail: [`${fmtDate(new Date(hit.arriveTs))} · ${fmtTime(new Date(hit.arriveTs))}–${fmtTime(new Date(hit.departTs))} · ${hit.durationMin} min`],
      };
    case 'currentFix':
      return {
        title: 'Last known position',
        detail: [[fmtDateTime(new Date(hit.ts)), hit.batteryPct != null ? `${Math.round(hit.batteryPct)}% battery` : null].filter(Boolean).join(' · ')],
      };
  }
}

/** `placeScreen`: the app has a screen for a place (web's place panel); without one, saved places and
 *  hotspots are preview-only. */
export function hitActions(hit: MapHit, { placeScreen = false }: { placeScreen?: boolean } = {}): { action: HitAction; label: string }[] {
  switch (hit.kind) {
    case 'event': return [{ action: 'open', label: 'Open event' }];
    case 'contact': return [{ action: 'open', label: 'Open contact' }];
    case 'photo': return [{ action: 'open', label: 'Open photo' }, { action: 'day', label: 'All from this day' }];
    case 'photoCell': return [{ action: 'zoom', label: 'Zoom in' }];
    case 'visit': return [{ action: 'day', label: 'Photos from this day' }];
    case 'saved': return placeScreen && hit.placeId ? [{ action: 'place', label: 'Open place' }] : [];
    case 'hotspot': return placeScreen && hit.placeId ? [{ action: 'place', label: 'Open place' }] : [];
    case 'currentFix': return [];
  }
}
