import { getContactGroupSnapshot } from '@lupira/cal-api/fetch/contact';
import type { ContactGroupDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';
import type { ContactGroupDoc } from '../../domain/docTypes';
import { applyContactGroupOp } from '../../domain/mirrorReducers';
import type { ClientOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

export const contactGroupModule: AggregateModule<ContactGroupDoc, null, ClientOp, ContactGroupDto> = {
  aggregate: Aggregate.contactGroup,
  feed: {
    fetch: () => getContactGroupSnapshot(),
    fromWire: (g) => ({ id: g.id, state: { doc: g, guards: null } }),
  },
  reduce: applyContactGroupOp,
  replay: replayOp,
  // Shares the contact's hold key, so adding a contact created offline waits for that create.
  holdKeyOf: (op) => ('contactId' in op ? op.contactId : op.aggregateId),
};
