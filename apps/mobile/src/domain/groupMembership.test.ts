import { describe, expect, it } from 'vitest';
import type { ContactGroupDoc } from './docTypes';
import { editableGroupIds, groupsToJoin } from './groupMembership';

const group = (id: string, addressBookId: string, members: string[] = []): ContactGroupDoc =>
  ({ id, addressBookId, kind: 'Group', name: id, members: members.map((contactId) => ({ contactId })) });

const groups = [group('family', 'home', ['anna']), group('club', 'home'), group('team', 'work'), group('shared', 'viewed')];
const books = [{ id: 'home', access: 'Owner' }, { id: 'work', access: 'ReadWrite' }, { id: 'viewed', access: 'Read' }];

describe('group membership', () => {
  it('edits groups in writable address books only', () => {
    expect([...editableGroupIds(groups, books)]).toEqual(['family', 'club', 'team']);
  });

  it('offers the writable groups of the contact\'s own address book it is not in', () => {
    const editable = editableGroupIds(groups, books);
    expect(groupsToJoin(groups, editable, { id: 'anna', addressBookId: 'home' }).map((g) => g.id)).toEqual(['club']);
    expect(groupsToJoin(groups, editable, { id: 'bo', addressBookId: 'viewed' })).toEqual([]);
  });
});
