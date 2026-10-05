import { contactBootstrapMe, getAddressBookSnapshot } from '@lupira/cal-api/fetch/contact';
import type { AddressBookDto } from '@lupira/cal-api/models';
import { needsAddressBookBootstrap } from '@lupira/cal-domain/bootstrap';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';
import { seededSnapshot } from './seededSnapshot';

export const addressBookModule: AggregateModule<AddressBookDto, null, never, AddressBookDto> = {
  aggregate: Aggregate.addressBook,
  feed: {
    fetch: () => seededSnapshot(getAddressBookSnapshot, needsAddressBookBootstrap, () => contactBootstrapMe(), 'address books'),
    fromWire: (b) => ({ id: b.id, state: { doc: b, guards: null } }),
  },
};
