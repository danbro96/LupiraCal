import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useGetContact } from '@lupira/cal-api/query/contact';
import type { ContactDto } from '@lupira/cal-api/models';
import { birthdayAgeLine, nextBirthday, turningAge } from '@lupira/cal-domain/birthday';
import { fmtPartialDate } from '@lupira/cal-domain/partialDate';
import { DetailDrawer } from './DetailDrawer';
import { DrawerSection } from '../DrawerSection';
import { CakeIcon } from '../../icons';

/** Read-only view for a birthday occurrence (a contact projection, not a stored item): the birthday date,
 *  the age the contact is turning when known, and a link to the contact. `year` is the clicked occurrence's year. */
export function BirthdayCard({ contactId, year, onClose }: { contactId: string; year: string | null; onClose: () => void }) {
  const { data: contact, isLoading } = useGetContact(contactId);

  return (
    <DetailDrawer onClose={onClose}>
      {isLoading && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Loading…</Typography>}
      {!isLoading && !contact && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Contact not found (or no access).</Typography>}
      {contact && <BirthdayBody contact={contact} year={year} />}
    </DetailDrawer>
  );
}

function BirthdayBody({ contact, year }: { contact: ContactDto; year: string | null }) {
  const b = contact.birthday ?? null;
  const { year: birthYear, month, day } = b ?? { year: null, month: 0, day: 0 };
  // Reconstruct the occurrence from the contact's authoritative month/day; a deep link without a year
  // falls back to the next upcoming birthday.
  const clickedYear = year ? Number(year) : null;
  const onDate = b
    ? clickedYear != null
      ? new Date(clickedYear, month - 1, day)
      : nextBirthday(month, day, new Date())
    : null;
  const age = onDate ? turningAge(birthYear, onDate) : null;

  return (
    <Box sx={{ px: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box component="span" title="Birthday" sx={{ fontSize: 22 }}>
          <CakeIcon />
        </Box>
        <Typography component="h2" sx={{ mb: 1, color: 'text.secondary' }}>{contact.displayName}</Typography>
      </Box>

      <DrawerSection title="Birthday">
        {b ? <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>{fmtPartialDate(b)}</Typography> : <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Unknown.</Typography>}
        {age != null && onDate && (
          <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>
            {birthdayAgeLine(age, onDate, contact.deceased === true)}
          </Typography>
        )}
      </DrawerSection>

      <Button variant="text" component={Link} to={`/contacts/${contact.id}`}>
        View contact →
      </Button>
    </Box>
  );
}
