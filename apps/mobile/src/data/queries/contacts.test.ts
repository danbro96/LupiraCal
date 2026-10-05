import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { Aggregate } from '../../domain/aggregates';
import { emptyContactGuards } from '../../domain/docTypes';
import { CONTACT_DDL, writeContactIndex } from '../indexes/contacts';
import { listContacts } from './contacts';
import { DOCS_DDL, putDoc } from './testDocs';

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await db.exec(DOCS_DDL + CONTACT_DDL);
});

describe('listContacts', () => {
  it('lists contacts by display name with their docs, leaving out locally deleted ones', async () => {
    await db.exclusive(async (tx) => {
      for (const [id, givenName] of [['b', 'bea'], ['a', 'Anna'], ['c', 'Cleo']])
        await putDoc(tx, Aggregate.contact, id, { doc: { id, addressBookId: 'ab', givenName }, guards: emptyContactGuards() }, writeContactIndex);
      await tx.run("UPDATE docs SET local = NULL WHERE id = 'c'");
    });

    const rows = await listContacts(db);
    expect(rows.map((r) => [r.id, r.displayName, r.doc.givenName])).toEqual([['a', 'Anna', 'Anna'], ['b', 'bea', 'bea']]);
  });
});
