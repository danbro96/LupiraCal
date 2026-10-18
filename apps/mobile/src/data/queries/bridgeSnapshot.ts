import type { Tx } from '@danbro96/lupira-expo-sqlite/types';

/** The bridge_* view rows verbatim, keyed and named as MirrorReader.kt reads them. */
export type BridgeSnapshot = {
  calendars: { id: string; state: string }[];
  items: { id: string; state: string }[];
  contacts: { id: string; display_name: string; state: string }[];
  residencies: { id: string; contact_id: string; state: string; place: string | null }[];
};

export async function bridgeSnapshot(tx: Tx): Promise<BridgeSnapshot> {
  return {
    calendars: await tx.all('SELECT id, state FROM bridge_calendars'),
    items: await tx.all('SELECT id, state FROM bridge_items'),
    contacts: await tx.all('SELECT id, display_name, state FROM bridge_contacts'),
    residencies: await tx.all('SELECT id, contact_id, state, place FROM bridge_residencies ORDER BY id'),
  };
}
