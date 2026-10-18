import {
  followingSeriesOf, hasSeriesOccurrence, isFirstOccurrence, type OccurrenceScope,
} from '@lupira/cal-domain/seriesOccurrences';
import type { ItemDoc } from './docTypes';
import { coreOfDoc } from './editors';
import type { ItemCore } from './ops';

export type CancelPlan = { kind: 'occurrence' | 'series' | 'gone' } | { kind: 'following'; core: ItemCore };

/** What Cancel in `scope` at occurrence `key` does; gone when the series no longer has that occurrence. */
export function cancelPlan(doc: ItemDoc, scope: OccurrenceScope, key: string | null): CancelPlan {
  if (scope === 'series' || !key) return { kind: 'series' };
  if (!hasSeriesOccurrence(doc, key)) return { kind: 'gone' };
  if (scope === 'this') return { kind: 'occurrence' };
  if (isFirstOccurrence(doc, key)) return { kind: 'series' };
  const following = followingSeriesOf(doc, key);
  return following ? { kind: 'following', core: { ...coreOfDoc(following), status: 'Cancelled' } } : { kind: 'gone' };
}
