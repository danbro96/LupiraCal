import { useListRelationships, useSearchContacts } from '@lupira/cal-api/query/contact';
import type { SearchContactsParams } from '@lupira/cal-api/models';
import { useGetParticipationSummary } from '@lupira/cal-api/query/cal';
import { partitionByActivity } from '@lupira/cal-domain/contactTiers';

/**
 * Contact list split into Active / Dormant tiers by behavioral signal. Joins the contact search with
 * cal participation (the two sources stay independent — the join lives here, in state). Fails open:
 * while the summary loads, contacts with a relation/pin/recency signal still surface as Active.
 */
export function useTieredContacts(params: SearchContactsParams) {
  const contactsQ = useSearchContacts(params);
  const { data: summary } = useGetParticipationSummary();
  const { data: relationships } = useListRelationships();

  const contacts = contactsQ.data ?? [];
  const relatedIds = new Set((relationships ?? []).flatMap((r) => [r.lowId, r.highId]));
  const { active, dormant } = partitionByActivity(contacts, summary, { relatedIds });

  return { active, dormant, contacts, isLoading: contactsQ.isLoading };
}
