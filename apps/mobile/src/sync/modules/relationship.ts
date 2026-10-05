import { getRelationshipChanges } from '@lupira/cal-api/fetch/contact';
import type { RelationshipDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { RELATIONSHIP_DDL, RELATIONSHIP_TABLES, writeRelationshipIndex } from '../../data/indexes/relationships';
import { Aggregate } from '../../domain/aggregates';

export const relationshipModule: AggregateModule<RelationshipDto, null, never, RelationshipDto> = {
  aggregate: Aggregate.relationship,
  feed: {
    fetch: (since) => getRelationshipChanges(since ? { since } : undefined),
    fromWire: (r) => ({ id: r.id, state: { doc: r, guards: null } }),
  },
  index: { version: 2, tables: RELATIONSHIP_TABLES, ddl: RELATIONSHIP_DDL, write: writeRelationshipIndex },
};
