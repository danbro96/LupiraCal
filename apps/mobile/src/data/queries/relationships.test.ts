import type { RelationshipRecord } from '@lupira/cal-domain/contactRelations';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { Aggregate } from '../../domain/aggregates';
import { emptyContactGuards } from '../../domain/docTypes';
import { CONTACT_DDL, writeContactIndex } from '../indexes/contacts';
import { RELATIONSHIP_DDL, writeRelationshipIndex } from '../indexes/relationships';
import { relationshipsOf } from './relationships';
import { DOCS_DDL, putDoc } from './testDocs';

let db: Db;

beforeEach(async () => {
  db = openNodeDb();
  await db.exec(DOCS_DDL + CONTACT_DDL + RELATIONSHIP_DDL);
});

const person = (id: string, givenName: string) =>
  db.exclusive((tx) => writeContactIndex(tx, id, { doc: { id, addressBookId: 'ab', givenName }, guards: emptyContactGuards() }));
const relate = (id: string, lowId: string, highId: string, kind: RelationshipRecord['kind']) =>
  db.exclusive((tx) => putDoc(tx, Aggregate.relationship, id, { doc: { id, lowId, highId, kind } }, writeRelationshipIndex));

describe('relationshipsOf', () => {
  it("returns a contact's relationships from either end with the other's name, and none whose other is missing", async () => {
    await person('x', 'Xavier');
    await person('y', 'Yara');
    await person('z', 'Zoe');
    await relate('xy', 'x', 'y', 'Child');
    await relate('yz', 'y', 'z', 'Friend');
    await relate('gy', 'gone', 'y', 'Friend');
    await relate('xz', 'x', 'z', 'Friend');

    const rows = await relationshipsOf(db, 'y');
    expect(rows.map((r) => [r.record.id, r.otherId, r.otherName]).sort()).toEqual([
      ['xy', 'x', 'Xavier'],
      ['yz', 'z', 'Zoe'],
    ]);
  });

  it('forgets removed relationships', async () => {
    await person('x', 'Xavier');
    await person('y', 'Yara');
    await relate('xy', 'x', 'y', 'Friend');
    await db.exclusive((tx) => writeRelationshipIndex(tx, 'xy', null));

    expect(await relationshipsOf(db, 'y')).toEqual([]);
  });
});
