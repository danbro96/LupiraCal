import { getContactChanges } from '@lupira/cal-api/fetch/contact';
import type { ContactSyncChange } from '@lupira/cal-api/models';
import type { AggregateModule } from '@danbro96/lupira-sync-engine/types';
import { CONTACT_DDL, CONTACT_TABLES, writeContactIndex } from '../../data/indexes/contacts';
import { Aggregate } from '../../domain/aggregates';
import type { ContactDoc, ContactGuards } from '../../domain/docTypes';
import { applyContactOp } from '../../domain/mirrorReducers';
import type { ClientOp } from '../../domain/ops';
import { replayOp } from '../replayOp';

/** What the stock Contacts app gets; MirrorReader.kt reads these columns. */
const BRIDGE_VIEW = `
  DROP VIEW IF EXISTS bridge_contacts;
  CREATE VIEW bridge_contacts AS SELECT c.id, c.display_name, d.local AS state
  FROM contact_index c JOIN docs d ON d.aggregate = '${Aggregate.contact}' AND d.id = c.id;
`;

export const contactModule: AggregateModule<ContactDoc, ContactGuards, ClientOp, ContactSyncChange> = {
  aggregate: Aggregate.contact,
  feed: {
    fetch: (since) => getContactChanges(since ? { since } : undefined),
    fromWire: (c) => ({ id: c.contact.id, state: { doc: { ...c.contact }, guards: c.guards } }),
  },
  reduce: applyContactOp,
  replay: replayOp,
  index: { version: 2, tables: CONTACT_TABLES, ddl: CONTACT_DDL + BRIDGE_VIEW, write: writeContactIndex },
};
