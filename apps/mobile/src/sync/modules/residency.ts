import { getResidencyChanges } from '@lupira/cal-api/fetch/contact';
import type { ResidencyDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { RESIDENCY_DDL, RESIDENCY_TABLES, writeResidencyIndex } from '../../data/indexes/residencies';
import { Aggregate } from '../../domain/aggregates';
import type { ResidencyDoc } from '../../domain/docTypes';
import { applyResidencyOp } from '../../domain/mirrorReducers';
import type { ClientOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

/** What the stock Contacts app gets as postal addresses; MirrorReader.kt reads these columns. */
const BRIDGE_VIEW = `
  DROP VIEW IF EXISTS bridge_residencies;
  CREATE VIEW bridge_residencies AS SELECT r.id, r.contact_id, d.local AS state, p.local AS place
  FROM residency_index r
  JOIN docs d ON d.aggregate = '${Aggregate.residency}' AND d.id = r.id AND d.local IS NOT NULL
  LEFT JOIN docs p ON p.aggregate = '${Aggregate.residencyPlace}' AND p.id = r.place_id AND p.local IS NOT NULL;
`;

export const residencyModule: AggregateModule<ResidencyDoc, null, ClientOp, ResidencyDto> = {
  aggregate: Aggregate.residency,
  feed: {
    fetch: (since) => getResidencyChanges(since ? { since } : undefined),
    fromWire: (r) => ({ id: r.id, state: { doc: r, guards: null } }),
  },
  reduce: applyResidencyOp,
  replay: replayOp,
  // Shares the contact's hold key, so an address added to a contact created offline waits for that create.
  holdKeyOf: (op) => ('contactId' in op ? op.contactId : op.aggregateId),
  index: { version: 3, tables: RESIDENCY_TABLES, ddl: RESIDENCY_DDL + BRIDGE_VIEW, write: writeResidencyIndex },
};
