import { getContactGroupSnapshot } from '@lupira/cal-api/fetch/contact';
import type { ContactGroupDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';

export const contactGroupModule: AggregateModule<ContactGroupDto, null, never, ContactGroupDto> = {
  aggregate: Aggregate.contactGroup,
  feed: {
    fetch: () => getContactGroupSnapshot(),
    fromWire: (g) => ({ id: g.id, state: { doc: g, guards: null } }),
  },
};
