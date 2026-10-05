import { getMe } from '@lupira/cal-api/fetch/contact';
import type { MeDto } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { Aggregate } from '../../domain/aggregates';

export const ME_ID = 'me';

/** `/me` as a one-doc snapshot feed, so "invite me" works offline. */
export const meModule: AggregateModule<MeDto, null, never, MeDto> = {
  aggregate: Aggregate.me,
  feed: {
    fetch: async () => ({ cursor: '', hasMore: false, reset: true, changed: [await getMe()], deleted: [] }),
    fromWire: (me) => ({ id: ME_ID, state: { doc: me, guards: null } }),
  },
};
