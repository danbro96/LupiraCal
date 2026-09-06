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
import { describeRrule, RRULE_PRESETS } from '@lupira/cal-domain/rrule';
import { fmtDate, parseYmd } from '@lupira/cal-domain/time';
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
import { ItemPhotosPanel } from './ItemPhotosPanel';
import { RelationsPanel } from './RelationsPanel';
import { errText } from '../../errText';
import { useSnackbar } from '../SnackbarHost';
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

  const [title, setTitle] = useState(item.title ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [rrule, setRrule] = useState(item.recurrenceRule ?? '');
  const [newTag, setNewTag] = useState('');

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
          placeholder="(untitled)"
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
            {item.endDate && item.endDate !== item.startDate ? ` – ${fmtDate(parseYmd(item.endDate))}` : ''}
          </Typography>
        ) : (
          <WrapRow>
            <TextField
              type="datetime-local"
              defaultValue={isoToLocalInput(item.startsAt)}
              onBlur={(e) => {
                const iso = localInputToIso(e.target.value);
                if (iso && iso !== item.startsAt) patch({ startsAt: iso });
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <TextField
              type="datetime-local"
              defaultValue={isoToLocalInput(item.endsAt)}
              onBlur={(e) => {
                const iso = localInputToIso(e.target.value);
                if (iso && iso !== item.endsAt) patch({ endsAt: iso });
              }}
            />
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
            <MenuItem value="">never</MenuItem>
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
        <PlacePicker
          placeId={item.placeId ?? null}
          initialText={!item.placeId ? (item.locationLabel ?? '') : ''}
          placeholder="Search or type an address…"
          onChange={(placeId) => (placeId ? patch({ placeId, placeIdProvided: true }) : patch({ placeId: null, placeIdProvided: true }))}
        />
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

      <DrawerSection title="Tags">
        <WrapRow>
          {(item.tags ?? []).map((t) => (
            <Chip key={t} label={t} onDelete={() => patch({ tags: (item.tags ?? []).filter((x) => x !== t) })} />
          ))}
          <TextField
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

      <KindDetailsCard details={item.details} />
      <PayloadPanel item={item} />
      <AttendeesPanel item={item} />
      <CalendarsPanel item={item} />
      <HierarchyPanel item={item} />
      <ItemPhotosPanel itemId={item.id} item={item} />
      <RelationsPanel itemId={item.id} />
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
