import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import type { ItemDetails } from '@lupira/cal-api/models';
import { fmtDateTime } from '@danbro96/lupira-domain-core/time';
import { DrawerSection } from '../DrawerSection';

/** Read-only card for the composable item detail: a booking, a travel leg, and/or a presence segment.
 *  Details are authored elsewhere (agent/DAV); REST only writes the presence status. */
export function KindDetailsCard({ details }: { details?: ItemDetails | null }) {
  if (!details) return null;

  const when = (iso?: string | null) => (iso ? fmtDateTime(new Date(iso)) : null);
  const rows: Array<[string, string | null | undefined]> = [];

  if (details.travel) {
    const t = details.travel;
    rows.push(
      ['To', t.toLabel], ['From', t.fromLabel],
      ['Departs', when(t.departAt)], ['Arrives', when(t.arriveAt)],
      ['Carrier', t.carrier], ['Service', t.serviceNumber],
      ['Departure point', t.departurePoint], ['Arrival point', t.arrivalPoint], ['Seat', t.seat],
    );
  }
  if (details.booking) {
    const b = details.booking;
    rows.push(
      ['Confirmation', b.confirmationNumber], ['Reference', b.reference],
      ['Amount', b.amount != null ? `${b.amount} ${b.currency ?? ''}`.trim() : null],
      ['Party size', b.partySize != null ? String(b.partySize) : null],
    );
  }
  if (details.presence) rows.push(['Availability', details.presence.status]);

  const visible = rows.filter(([, v]) => v);
  if (visible.length === 0 && !details.booking?.url) return null;

  return (
    <DrawerSection title="Details">
      <Box
      component="dl"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '8px 16px',
        m: 0,
        '& dt': { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.subtle' },
        '& dd': { m: 0, overflowWrap: 'anywhere' },
      }}
    >
        {visible.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </Box>
      {details.booking?.url && (
        <Button variant="text" href={details.booking.url} target="_blank" rel="noreferrer">
          Booking ↗
        </Button>
      )}
    </DrawerSection>
  );
}
