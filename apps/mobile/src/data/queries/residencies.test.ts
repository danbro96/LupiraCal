import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { Aggregate } from '../../domain/aggregates';
import { emptyContactGuards } from '../../domain/docTypes';
import { CONTACT_DDL, writeContactIndex } from '../indexes/contacts';
import { RESIDENCY_DDL, writeResidencyIndex } from '../indexes/residencies';
import { contactResidencies } from './residencies';
import { DOCS_DDL, putDoc } from './testDocs';

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await db.exec(DOCS_DDL + CONTACT_DDL + RESIDENCY_DDL);
});

describe('contactResidencies', () => {
  it("lists mirrored contacts' residencies with their names, labels and dates", async () => {
    await db.exclusive(async (tx) => {
      await writeContactIndex(tx, 'anna', { doc: { id: 'anna', addressBookId: 'ab', givenName: 'Anna' }, guards: emptyContactGuards() });
      await putDoc(tx, Aggregate.residency, 'r1', {
        doc: { id: 'r1', contactId: 'anna', placeId: 'cabin', type: 'Vacation', label: 'Summer house', movedIn: { year: 2019 } },
      }, writeResidencyIndex);
      await putDoc(tx, Aggregate.residency, 'r2', { doc: { id: 'r2', contactId: 'gone', placeId: 'flat', type: 'Home' } }, writeResidencyIndex);
    });

    expect(await contactResidencies(db)).toEqual([{
      contact_id: 'anna', display_name: 'Anna', place_id: 'cabin', address_type: 'Vacation', label: 'Summer house',
      moved_in: '{"year":2019}', moved_out: null,
    }]);
  });
});
