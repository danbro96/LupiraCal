import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { getMeta, setMeta } from './mirror';

/** The signed-in user's own contact, as contact-api links it. Kept in mirror_meta so an event created
 *  offline can still invite you; empty means no linked contact. */
const ME_CONTACT_KEY = 'me.contactId';

export async function loadMyContactId(db: Db): Promise<string | null> {
  return (await db.exclusive((tx) => getMeta(tx, ME_CONTACT_KEY))) || null;
}

/** Returns whether the stored id changed. */
export async function saveMyContactId(db: Db, contactId: string | null): Promise<boolean> {
  return db.exclusive(async (tx) => {
    const next = contactId ?? '';
    if (((await getMeta(tx, ME_CONTACT_KEY)) ?? '') === next) return false;
    await setMeta(tx, ME_CONTACT_KEY, next);
    return true;
  });
}
