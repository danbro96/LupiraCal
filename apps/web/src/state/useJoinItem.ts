import { useInviteParticipant, useRespondToInvitation } from '@lupira/cal-api/query/cal';
import { participationIdOf } from '@lupira/cal-domain/participation';
import { useInvalidateItems } from './useInvalidate';

/** Puts you on an event, already going: invite, then RSVP on the participation the invite returned. */
export function useJoinItem() {
  const invalidate = useInvalidateItems();
  const invite = useInviteParticipant();
  const respond = useRespondToInvitation();
  return async (itemId: string, contactId: string): Promise<void> => {
    try {
      const item = await invite.mutateAsync({ id: itemId, params: { contactId } });
      const participationId = participationIdOf(item, contactId);
      if (participationId) await respond.mutateAsync({ id: itemId, participationId, params: { status: 'accepted' } });
    } finally {
      invalidate();
    }
  };
}
