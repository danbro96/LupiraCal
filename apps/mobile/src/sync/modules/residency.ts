import { getResidencyChanges } from '@lupira/cal-api/fetch/contact';
import type { ResidencyDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { RESIDENCY_DDL, RESIDENCY_TABLES, writeResidencyIndex } from '../../data/indexes/residencies';
import { Aggregate } from '../../domain/aggregates';

export const residencyModule: AggregateModule<ResidencyDto, null, never, ResidencyDto> = {
  aggregate: Aggregate.residency,
  feed: {
    fetch: (since) => getResidencyChanges(since ? { since } : undefined),
    fromWire: (r) => ({ id: r.id, state: { doc: r, guards: null } }),
  },
  index: { version: 2, tables: RESIDENCY_TABLES, ddl: RESIDENCY_DDL, write: writeResidencyIndex },
};
