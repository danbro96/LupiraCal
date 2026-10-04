import { useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { useDeleteItem, useGetItem, useUpdateItem } from '@lupira/cal-api/query/cal';
import {
  AvailabilityStatus,
  ItemStatus,
  type CalendarItemDto,
  type UpdateCalendarItemRequest,
} from '@lupira/cal-api/models';
import { describeRrule, NO_REPEAT, RRULE_PRESETS } from '@lupira/cal-domain/rrule';
import { fmtDate, parseYmd, ymd } from '@danbro96/lupira-domain-core/time';
import { eventZone, zoneChoices, zoneLabel } from '@lupira/cal-domain/zonedTime';
import { movedEnd } from '@lupira/cal-domain/itemForm';
import { UNTITLED } from '@danbro96/lupira-domain-events/itemLabels';
import { useInvalidateItems } from '../../../state/useInvalidate';
import { CategoryIcon } from '../KindIcon';
import { AttendeesPanel } from './AttendeesPanel';
import { CalendarsPanel } from './CalendarsPanel';
import { DetailDrawer } from './DetailDrawer';
import { CompletenessBadge } from './CompletenessBadge';
import { HierarchyPanel } from './HierarchyPanel';
import { isoToLocalInput, localInputToIso } from './inputs';
import { KindDetailsCard } from './KindDetailsCard';
import { MetadataPanel } from './MetadataPanel';
import { PayloadPanel } from './PayloadPanel';
import { PlacePicker } from '../places/PlacePicker';
import { PlaceTile } from '../places/PlaceTile';
import { ItemPhotosPanel } from './ItemPhotosPanel';
import { RelationsPanel } from './RelationsPanel';
import { errText } from '../../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';

/** The item detail drawer (?item=<id>): every field the REST read model exposes, editable where the API allows. */
export function ItemDrawer({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { data: item, isLoading } = useGetItem(itemId);

  return (
    <DetailDrawer onClose={onClose}>
      {isLoading && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Loading…</Typography>}
      {!isLoading && !item && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Item not found (or no access).</Typography>}
      {item && <DrawerBody key={item.etag} item={item} onClose={onClose} />}
    </DetailDrawer>
  );
}

function DrawerBody({ item, onClose }: { item: CalendarItemDto; onClose: () => void }) {
  const invalidate = useInvalidateItems();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const update = useUpdateItem({ mutation: { onSuccess: invalidate, onError } });
  const del = useDeleteItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        onClose();
      },
      onError,
    },
  });
  const patch = (data: UpdateCalendarItemRequest) => update.mutate({ id: item.id, data });

  const zone = eventZone(item.startTimezone);
  const zoneAt = item.startsAt ? new Date(item.startsAt) : undefined;
  const zoneOptions = zoneChoices(zone);
  const zonePatch = (z: string): UpdateCalendarItemRequest => ({
    startTimezone: z, startTimezoneProvided: true, endTimezone: z, endTimezoneProvided: true,
  });
  // A zoneless item takes the zone its times were just edited in, as the mobile editor does on save.
  const stampZone: UpdateCalendarItemRequest = item.startTimezone || !zone ? {} : zonePatch(zone);

  // Moving the start carries the end along, keeping the duration on the event's own clock.
  const moveStart = (value: string) => {
    const startsAt = localInputToIso(value, zone);
    if (!startsAt || startsAt === item.startsAt) return;
    const endsAt = item.startsAt && item.endsAt ? movedEnd(item.startsAt, item.endsAt, startsAt, zone) : undefined;
    patch({ startsAt, ...(endsAt ? { endsAt } : {}), ...stampZone });
  };
  const moveEnd = (value: string) => {
    const endsAt = localInputToIso(value, zone);
    if (endsAt && endsAt !== item.endsAt) patch({ endsAt, ...stampZone });
  };
  // A new zone keeps the wall clock: "09:00" now means 09:00 there.
  const changeZone = (z: string) => {
    if (!z || z === zone) return;
    const reread = (iso?: string | null) => (iso ? localInputToIso(isoToLocalInput(iso, zone), z) : null);
    patch({ ...zonePatch(z), startsAt: reread(item.startsAt), endsAt: reread(item.endsAt) });
  };

  const [title, setTitle] = useState(item.title ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [rrule, setRrule] = useState(item.recurrenceRule ?? '');
  const [newTag, setNewTag] = useState('');
  const [editingPlace, setEditingPlace] = useState(false);

  return (
    <Box sx={{ px: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {item.category && item.category !== 'General' && (
          <Box component="span" title={item.category} sx={{ fontSize: 22 }}>
            <CategoryIcon category={item.category} />
          </Box>
        )}
        <TextField
          variant="standard"
          fullWidth
          slotProps={{ input: { sx: { fontSize: '1.35rem', fontWeight: 600 } } }}
          value={title}
          placeholder={UNTITLED}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== (item.title ?? '') && patch({ title })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <CompletenessBadge score={item.completeness} />
      </Box>

      <WrapRow>
        <TextField
          select
          label="Status"
          value={item.status ?? ''}
          onChange={(e) => patch({ status: e.target.value || null })}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">(none)</MenuItem>
          {Object.values(ItemStatus).map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        {item.details?.presence && (
          <TextField
            select
            label="Availability"
            value={item.details.presence.status ?? ''}
            onChange={(e) => e.target.value && patch({ availability: e.target.value as AvailabilityStatus })}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">(set…)</MenuItem>
            {Object.values(AvailabilityStatus).map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        )}
      </WrapRow>

      <DrawerSection title="When">
        {item.isAllDay ? (
          <Typography component="p" sx={{ mb: 1, color: 'text.secondary' }}>
            All day · {item.startDate ? fmtDate(parseYmd(item.startDate)) : '?'}
            {item.endDate && item.endDate > (item.startDate ?? '') ? ` – ${fmtDate(parseYmd(item.endDate))}` : ''}
          </Typography>
        ) : (
          <WrapRow>
            <TextField type="datetime-local" defaultValue={isoToLocalInput(item.startsAt, zone)} onBlur={(e) => moveStart(e.target.value)} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <TextField type="datetime-local" defaultValue={isoToLocalInput(item.endsAt, zone)} onBlur={(e) => moveEnd(e.target.value)} />
            {zone && (
              <TextField
                select
                label="Time zone"
                value={zone}
                onChange={(e) => changeZone(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              >
                {zoneOptions.map((z) => (
                  <MenuItem key={z} value={z}>
                    {zoneLabel(z, zoneAt, 'this browser')}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </WrapRow>
        )}
        <WrapRow>
          <TextField
            select
            label="Repeats"
            value={RRULE_PRESETS.some((p) => p.rrule === rrule) ? rrule : rrule ? 'custom' : ''}
            onChange={(e) => {
              if (e.target.value && e.target.value !== 'custom') {
                setRrule(e.target.value);
                patch({ recurrenceRule: e.target.value });
              }
            }}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">{NO_REPEAT}</MenuItem>
            {RRULE_PRESETS.map((p) => (
              <MenuItem key={p.rrule} value={p.rrule}>
                {p.label}
              </MenuItem>
            ))}
            {rrule && !RRULE_PRESETS.some((p) => p.rrule === rrule) && <MenuItem value="custom">custom</MenuItem>}
          </TextField>
          <TextField
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
            placeholder="RRULE…"
            value={rrule}
            onChange={(e) => setRrule(e.target.value)}
            onBlur={() => rrule && rrule !== (item.recurrenceRule ?? '') && patch({ recurrenceRule: rrule })}
          />
        </WrapRow>
        {item.recurrenceRule && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">{describeRrule(item.recurrenceRule)}</Typography>}
      </DrawerSection>

      <DrawerSection title="Where">
        {item.placeId && !editingPlace ? (
          <PlaceTile placeId={item.placeId} onEdit={() => setEditingPlace(true)} />
        ) : (
          <PlacePicker
            placeId={editingPlace ? null : item.placeId ?? null}
            autoFocus={editingPlace}
            attendeeIds={item.attendees.map((a) => a.contactId)}
            day={itemDay(item)}
            initialText={!item.placeId ? (item.locationLabel ?? '') : ''}
            placeholder="Search or type an address…"
            onChange={(placeId) => {
              setEditingPlace(false);
              patch({ placeId: placeId ?? null, placeIdProvided: true });
            }}
          />
        )}
        {editingPlace && (
          <WrapRow>
            <Button size="small" onClick={() => setEditingPlace(false)}>Cancel</Button>
            <Button
              size="small"
              color="error"
              onClick={() => {
                setEditingPlace(false);
                patch({ placeId: null, placeIdProvided: true });
              }}
            >
              Remove place
            </Button>
          </WrapRow>
        )}
        {!item.placeId && item.locationLabel && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">“{item.locationLabel}” from calendar text</Typography>
        )}
      </DrawerSection>

      <DrawerSection title="Description">
        <TextField
          multiline
          minRows={3}
          value={description}
          placeholder="Notes…"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (item.description ?? '') && patch({ description })}
        />
      </DrawerSection>

      <KindDetailsCard details={item.details} />
      <PayloadPanel item={item} />
      <AttendeesPanel item={item} />
      <CalendarsPanel item={item} />
      <HierarchyPanel item={item} />
      <ItemPhotosPanel itemId={item.id} item={item} />
      <RelationsPanel itemId={item.id} />
      <DrawerSection title="Tags">
        <WrapRow>
          {(item.tags ?? []).map((t) => (
            <Chip key={t} size="small" variant="outlined" label={`#${t}`} onDelete={() => patch({ tags: (item.tags ?? []).filter((x) => x !== t) })} />
          ))}
          <TextField
            size="small"
            placeholder="+ tag"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTag.trim()) {
                patch({ tags: [...(item.tags ?? []), newTag.trim()] });
                setNewTag('');
              }
            }}
          />
        </WrapRow>
      </DrawerSection>

      <MetadataPanel itemId={item.id} metadata={item.metadata} />

      <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} title={`iCal UID ${item.externalId} · etag ${item.etag}`}>
          {item.category ?? 'General'} item
        </Typography>
        <Button variant="outlined" color="error" onClick={() => del.mutate({ id: item.id })} disabled={del.isPending}>
          Delete item
        </Button>
      </Box>
    </Box>
  );
}

/** The local day an item starts on, 'yyyy-MM-dd' — all-day dates as stored, timed starts in this zone. */
function itemDay(item: CalendarItemDto): string | null {
  if (item.isAllDay) return item.startDate ?? null;
  return item.startsAt ? ymd(new Date(item.startsAt)) : null;
}

