import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { useQuery } from '@tanstack/react-query';
import { Aggregate } from '../domain/aggregates';
import type { MeDoc } from '../domain/docTypes';
import { engine } from '../sync/engine';
import { ME_ID } from '../sync/modules/me';

export async function loadMyContactId(): Promise<string | null> {
  return (await engine.doc<MeDoc, null>(Aggregate.me, ME_ID))?.doc.contactId ?? null;
}

/** Your own contact id from the mirror; null when contact-api has none linked. */
export function useMyContactId(): string | null {
  return useQuery(mirrorQuery([Aggregate.me], loadMyContactId)).data ?? null;
}
