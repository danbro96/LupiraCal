import type { ContactGroupDoc } from './docTypes';

export type BookAccess = { id: string; access?: string | null };

export const isMember = (group: ContactGroupDoc, contactId: string) => group.members.some((m) => m.contactId === contactId);

/** The groups whose membership you can change: those in an address book you can write. */
export function editableGroupIds(groups: ContactGroupDoc[], books: BookAccess[]): Set<string> {
  const writable = new Set(books.filter((b) => b.access === 'Owner' || b.access === 'ReadWrite').map((b) => b.id));
  return new Set(groups.filter((g) => writable.has(g.addressBookId)).map((g) => g.id));
}

/** A contact joins only groups of its own address book. */
export function groupsToJoin(groups: ContactGroupDoc[], editable: Set<string>, contact: { id: string; addressBookId: string }): ContactGroupDoc[] {
  return groups.filter((g) => editable.has(g.id) && g.addressBookId === contact.addressBookId && !isMember(g, contact.id));
}
