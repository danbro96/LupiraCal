import MuiLink from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Link, useSearchParams } from 'react-router-dom';
import { useSearchItems } from '@lupira/cal-api/query/cal';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { CategoryIcon } from '../KindIcon';
import { DrawerSection } from '../DrawerSection';
import { Row, RowName } from '../Rows';

const FETCH_SIZE = 50;
const SHOWN = 10;

/** Items across readable calendars where this contact is an attendee (all-time, newest first).
 *  Rows open the shared ?item= drawer; "open in list" drills into /items?contact=. */
export function ContactEventsPanel({ contactId }: { contactId: string }) {
  const [params] = useSearchParams();
  const { data: occs } = useSearchItems({ contactId, take: FETCH_SIZE, desc: true });

  // Recurring items repeat per occurrence — keep the first (most recent) per item.
  const events = [...new Map((occs ?? []).map((o) => [o.id, o])).values()].slice(0, SHOWN);
  if (events.length === 0) return null;

  const itemHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('item', id);
    return `?${next.toString()}`;
  };

  return (
    <DrawerSection title="Events">
      {events.map((e) => (
        <Row component={Link} key={e.id} to={itemHref(e.id)}>
          <CategoryIcon category={e.category} sx={{ fontSize: 22 }} />
          <RowName>{displayTitle(e.title)}</RowName>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtWhen(e.start, e.isAllDay)}</Typography>
        </Row>
      ))}
      <MuiLink
        component={Link}
        to={`/items?contact=${contactId}`}
        underline="hover"
        sx={{ fontSize: 13, fontWeight: 600, p: '2px', whiteSpace: 'nowrap', '@media (pointer: coarse)': { p: '6px 2px' } }}
      >
        open in list
      </MuiLink>
    </DrawerSection>
  );
}
