import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useGetSubscribedEvent } from '@lupira/cal-api/query/cal';
import type { SubscribedEventDto } from '@lupira/cal-api/models';
import { displayTitle, statusBadge } from '@danbro96/lupira-domain-events/itemLabels';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { DetailDrawer } from './DetailDrawer';
import { DrawerSection } from '../DrawerSection';
import { NamedIcon } from '../KindIcon';

/** Read-only view for a subscribed feed's event. `at` is the clicked occurrence's start; the event itself
 *  carries its first. */
export function SubscribedEventCard({ calendarId, subscriptionId, eventId, at, onClose }: {
  calendarId: string;
  subscriptionId: string;
  eventId: string;
  at: string | null;
  onClose: () => void;
}) {
  const { data: event, isLoading } = useGetSubscribedEvent(calendarId, subscriptionId, eventId);

  return (
    <DetailDrawer onClose={onClose}>
      {isLoading && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Loading…</Typography>}
      {!isLoading && !event && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Event not found (or no access).</Typography>}
      {event && <SubscribedEventBody event={event} at={at} />}
    </DetailDrawer>
  );
}

function SubscribedEventBody({ event, at }: { event: SubscribedEventDto; at: string | null }) {
  const badge = statusBadge(event.status);

  return (
    <Box sx={{ px: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" title="From a subscribed calendar" sx={{ fontSize: 22 }}>
          <NamedIcon name="subscribed" />
        </Box>
        <Typography component="h2" sx={{ mb: 1, color: 'text.secondary' }}>{displayTitle(event.title)}</Typography>
        {badge && <Chip variant="outlined" label={badge} />}
      </Box>

      <DrawerSection title="When">
        <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>{fmtWhen(at ?? event.start, event.isAllDay)}</Typography>
        {event.isRecurring && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Recurring</Typography>}
      </DrawerSection>

      {event.locationLabel && (
        <DrawerSection title="Where">
          <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>{event.locationLabel}</Typography>
        </DrawerSection>
      )}

      {event.description && (
        <DrawerSection title="Description">
          <Typography component="p" sx={{ mb: 1, color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{event.description}</Typography>
        </DrawerSection>
      )}

      <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">From {event.subscriptionName} · read-only</Typography>
    </Box>
  );
}
