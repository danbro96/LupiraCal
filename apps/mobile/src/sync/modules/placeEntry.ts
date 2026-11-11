import { getPlaceEntryChanges } from '@lupira/cal-api/fetch/contact';
import type { PlaceEntryDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';
import type { PlaceEntryDoc } from '../../domain/docTypes';
import { applyPlaceEntryOp } from '../../domain/mirrorReducers';
import type { ClientOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

/** Keyed by place: one entry per place, read by place id. */
export const placeEntryModule: AggregateModule<PlaceEntryDoc, null, ClientOp, PlaceEntryDto> = {
  aggregate: Aggregate.placeEntry,
  feed: {
    fetch: (since) => getPlaceEntryChanges(since ? { since } : undefined),
    fromWire: (e) => ({ id: e.placeId, state: { doc: e, guards: null } }),
  },
  reduce: applyPlaceEntryOp,
  replay: replayOp,
  holdKeyOf: (op) => ('placeId' in op ? op.placeId : op.aggregateId),
};
