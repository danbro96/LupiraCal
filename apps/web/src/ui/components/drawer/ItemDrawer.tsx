import { useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import {
  useChangeFollowingOccurrences,
  useChangeOccurrence,
  useDeleteItem,
  useGetItem,
  useRestoreOccurrence,
  useUpdateItem,
} from '@lupira/cal-api/query/cal';
import {
  AvailabilityStatus,
  ItemStatus,
  type CalendarItemDto,
  type SeriesSplitDto,
  type UpdateCalendarItemRequest,
} from '@lupira/cal-api/models';
import { describeRrule, NO_REPEAT, RRULE_PRESETS } from '@lupira/cal-domain/rrule';
import {
  allDayKey,
  followingSeriesOf,
  occurrenceEdit,
  occurrenceKey,
  occurrenceScopes,
  occurrenceView,
  seriesDeviationRows,
  type OccurrencePatch,
  type OccurrenceScope,
  type SeriesDeviationRow,
} from '@lupira/cal-domain/seriesOccurrences';
import { fmtDate, fmtWhen, parseYmd, ymd } from '@danbro96/lupira-domain-core/time';
import { eventZone, zoneChoices, zoneLabel } from '@lupira/cal-domain/zonedTime';
import { movedEnd } from '@lupira/cal-domain/itemForm';
import { UNTITLED } from '@danbro96/lupira-domain-events/itemLabels';
import { isItemCategory } from '@lupira/cal-domain/itemCategory';
import { fromStored } from '@lupira/cal-domain/placeSelection';
import { isItemColor } from '@lupira/cal-tokens/itemColors';
import { useContainers } from '../../../state/useContainers';
import { useInvalidateItems } from '../../../state/useInvalidate';
import { calendarColor } from '../../theme/kinds';
import { CategorySelect } from '../CategorySelect';
import { ColorDot } from '../ColorDot';
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
import { PlaceField } from '../places/PlaceField';
import { ItemPhotosPanel } from './ItemPhotosPanel';
import { RelationsPanel } from './RelationsPanel';
import { errText } from '../../errText';
import { NewTaskDialog } from '../NewTaskDialog';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';

const SCOPE_LABELS: Record<OccurrenceScope, string> = { this: 'This event', following: 'This and following', series: 'All events' };

const DEVIATION_LABELS: Record<SeriesDeviationRow['kind'], string> = { excluded: 'Deleted', cancelled: 'Cancelled', changed: 'Changed' };

/** The item detail drawer (?item=<id>&occ=<occurrence>): every field the REST read model exposes, editable where the API
 *  allows; a recurring item's edits apply to the scope picked at the top. */
export function ItemDrawer({ itemId, occurrence, onClose }: { itemId: string; occurrence: string | null; onClose: () => void }) {
  const { data: item, isLoading } = useGetItem(itemId);
  const { state } = useLocation();
  const [scope, setScope] = useState<OccurrenceScope>((state as { scope?: OccurrenceScope } | null)?.scope ?? 'this');
  const occ = occurrence && !Number.isNaN(Date.parse(occurrence)) ? occurrenceKey(occurrence) : null;
  const scopes = item ? occurrenceScopes(item, occ) : [];
  const shownScope = scopes.includes(scope) ? scope : (scopes[0] ?? 'series');

  return (
    <DetailDrawer
      onClose={onClose}
      header={scopes.length > 1 && (
        <ToggleButtonGroup
          exclusive
          size="small"
          fullWidth
          value={shownScope}
          onChange={(_, value: OccurrenceScope | null) => value && setScope(value)}
          aria-label="Apply changes to"
        >
          {scopes.map((s) => (
            <ToggleButton key={s} value={s} sx={{ textTransform: 'none' }}>
              {SCOPE_LABELS[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
    >
      {isLoading && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Loading…</Typography>}
      {!isLoading && !item && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 2, pr: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>Item not found (or no access).</Typography>}
      {item && (
        <DrawerBody key={`${item.etag}:${shownScope}`} item={item} occurrence={occ} scope={shownScope} scopes={scopes} onClose={onClose} />
      )}
    </DetailDrawer>
  );
}

function DrawerBody({
  item,
  occurrence,
  scope,
  scopes,
  onClose,
}: {
  item: CalendarItemDto;
  occurrence: string | null;
  scope: OccurrenceScope;
  scopes: OccurrenceScope[];
  onClose: () => void;
}) {
  const [, setSearchParams] = useSearchParams();
  const { calendars } = useContainers();
  const invalidate = useInvalidateItems();
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const closing = {
    onSuccess: () => {
      onClose();
      return invalidate();
    },
    onError,
  };
  const update = useUpdateItem({ mutation: { onSuccess: invalidate, onError } });
  const del = useDeleteItem({ mutation: closing });
  const change = useChangeOccurrence({ mutation: { onSuccess: invalidate, onError } });
  const exclude = useChangeOccurrence({ mutation: closing });
  const restore = useRestoreOccurrence({ mutation: { onSuccess: invalidate, onError } });
  const deleteFollowing = useChangeFollowingOccurrences({ mutation: closing });
  const openContinuation = ({ following }: SeriesSplitDto) => {
    const first = following?.isAllDay ? following.startDate && allDayKey(following.startDate) : following?.startsAt && occurrenceKey(following.startsAt);
    if (!following || !first) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('item', following.id);
        next.set('occ', first);
        return next;
      },
      { state: { scope: 'series' } },
    );
  };
  const split = useChangeFollowingOccurrences({
    mutation: {
      onSuccess: (result) => {
        openContinuation(result);
        return invalidate();
      },
      onError,
    },
  });

  const view = scope === 'this' && occurrence ? occurrenceView(item, occurrence) : null;
  const base = (scope === 'following' && occurrence ? followingSeriesOf(item, occurrence) : null) ?? item;
  const seriesOnly = scope === 'this';
  const panelsLocked = scope !== 'series';
  const shown = {
    title: view ? view.title : base.title,
    description: view ? view.description : base.description,
    status: view ? view.status : base.status,
    startsAt: view && !item.isAllDay ? view.start : base.startsAt,
    endsAt: view && !item.isAllDay ? view.end : base.endsAt,
    startDate: view && item.isAllDay ? view.start.slice(0, 10) : base.startDate,
    endDate: view && item.isAllDay ? (view.end?.slice(0, 10) ?? null) : base.endDate,
  };

  const patch = (data: UpdateCalendarItemRequest) => {
    if (scope === 'series' || !occurrence) return update.mutate({ id: item.id, data });
    if (scope === 'following') return split.mutate({ id: item.id, originalStart: occurrence, data: { changes: data } });
    const edit = occurrenceEdit(item, occurrence, occurrencePatch(data));
    if (edit.kind === 'restore') return restore.mutate({ id: item.id, originalStart: occurrence });
    if (edit.kind === 'change') {
      const { startsAt, endsAt, title, description, status } = edit.change;
      change.mutate({ id: item.id, originalStart: occurrence, data: { startsAt, endsAt, title, description, status } });
    }
  };
  const deleteIn = (s: OccurrenceScope) => {
    if (s === 'series' || !occurrence) del.mutate({ id: item.id });
    else if (s === 'this') exclude.mutate({ id: item.id, originalStart: occurrence, data: { excluded: true } });
    else deleteFollowing.mutate({ id: item.id, originalStart: occurrence, data: { excluded: true } });
  };
  const deleting = del.isPending || exclude.isPending || deleteFollowing.isPending;
  const [deleteMenu, setDeleteMenu] = useState<HTMLElement | null>(null);
  const deviations = item.recurrenceRule ? seriesDeviationRows(item) : [];
  const memberCalendars = item.calendars
    .filter((m) => m.status !== 'Removed')
    .flatMap((m) => calendars.filter((c) => c.id === m.calendarId));
  const banded = memberCalendars.some((c) => c.kind === 'Availability');

  const zone = eventZone(item.startTimezone);
  const zoneAt = shown.startsAt ? new Date(shown.startsAt) : undefined;
  const zoneOptions = zoneChoices(zone);
  const zonePatch = (z: string): UpdateCalendarItemRequest => ({
    startTimezone: z, startTimezoneProvided: true, endTimezone: z, endTimezoneProvided: true,
  });
  // A zoneless item takes the zone its times were just edited in, as the mobile editor does on save.
  const stampZone: UpdateCalendarItemRequest = item.startTimezone || !zone ? {} : zonePatch(zone);
  const zoneStamp = seriesOnly ? {} : stampZone;

  // Moving the start carries the end along, keeping the duration on the event's own clock.
  const moveStart = (value: string) => {
    const startsAt = localInputToIso(value, zone);
    if (!startsAt || sameInstant(startsAt, shown.startsAt)) return;
    const endsAt = shown.startsAt && shown.endsAt ? movedEnd(shown.startsAt, shown.endsAt, startsAt, zone) : undefined;
    patch({ startsAt, ...(endsAt ? { endsAt } : {}), ...zoneStamp });
  };
  const moveEnd = (value: string) => {
    const endsAt = localInputToIso(value, zone);
    if (endsAt && !sameInstant(endsAt, shown.endsAt)) patch({ endsAt, ...zoneStamp });
  };
  // A new zone keeps the wall clock: "09:00" now means 09:00 there.
  const changeZone = (z: string) => {
    if (!z || z === zone) return;
    const reread = (iso?: string | null) => (iso ? localInputToIso(isoToLocalInput(iso, zone), z) : null);
    patch({ ...zonePatch(z), startsAt: reread(shown.startsAt), endsAt: reread(shown.endsAt) });
  };

  const [title, setTitle] = useState(shown.title ?? '');
  const [description, setDescription] = useState(shown.description ?? '');
  const [rrule, setRrule] = useState(item.recurrenceRule ?? '');
  const [newTag, setNewTag] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  return (
    <Box sx={{ px: 2, pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {!banded && (
          <ColorDot
            value={isItemColor(base.color) ? base.color : null}
            calendarFill={memberCalendars[0] ? calendarColor(memberCalendars[0]) : 'var(--mui-palette-border)'}
            onChange={(color) => patch({ color, colorProvided: true })}
            disabled={seriesOnly}
          />
        )}
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
          onBlur={() => title !== (shown.title ?? '') && patch({ title })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <CompletenessBadge score={item.completeness} />
      </Box>

      {panelsLocked && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1 }}>
          Dimmed fields apply to all events.
        </Typography>
      )}
      {scope === 'this' && view?.change && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
            Changed from the series
          </Typography>
          <Button size="small" onClick={() => restore.mutate({ id: item.id, originalStart: view.originalStart })} disabled={restore.isPending}>
            Revert to series
          </Button>
        </Box>
      )}

      <WrapRow>
        <SeriesOnly locked={seriesOnly}>
          <CategorySelect label="Type" value={item.category ?? 'General'} onChange={(category) => category !== item.category && patch({ category })} />
        </SeriesOnly>
        <TextField
          select
          label="Status"
          value={shown.status ?? ''}
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
            disabled={seriesOnly}
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
            All day · {shown.startDate ? fmtDate(parseYmd(shown.startDate)) : '?'}
            {shown.endDate && shown.endDate > (shown.startDate ?? '') ? ` – ${fmtDate(parseYmd(shown.endDate))}` : ''}
          </Typography>
        ) : (
          <WrapRow>
            <TextField type="datetime-local" defaultValue={isoToLocalInput(shown.startsAt, zone)} onBlur={(e) => moveStart(e.target.value)} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>→</Typography>
            <TextField type="datetime-local" defaultValue={isoToLocalInput(shown.endsAt, zone)} onBlur={(e) => moveEnd(e.target.value)} />
            {zone && (
              <TextField
                select
                label="Time zone"
                disabled={seriesOnly}
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
            disabled={seriesOnly}
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
            disabled={seriesOnly}
            value={rrule}
            onChange={(e) => setRrule(e.target.value)}
            onBlur={() => rrule && rrule !== (item.recurrenceRule ?? '') && patch({ recurrenceRule: rrule })}
          />
        </WrapRow>
        {item.recurrenceRule && <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">{describeRrule(item.recurrenceRule)}</Typography>}
      </DrawerSection>

      <DrawerSection title="Where">
        <SeriesOnly locked={seriesOnly}>
          <PlaceField
            value={item.placeId ? fromStored(item.placeId, null) : null}
            context={{
              kind: 'event',
              category: isItemCategory(item.category) ? item.category : 'General',
              attendeeIds: item.attendees.map((a) => a.contactId),
              day: itemDay(item) ?? ymd(new Date()),
            }}
            legacyText={item.locationLabel}
            onChange={(place) => patch({ placeId: place?.placeId ?? null, placeIdProvided: true })}
          />
        </SeriesOnly>
      </DrawerSection>

      <DrawerSection title="Description">
        <TextField
          multiline
          minRows={3}
          value={description}
          placeholder="Notes…"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (shown.description ?? '') && patch({ description })}
        />
      </DrawerSection>

      {deviations.length > 0 && (
        <DrawerSection title="Changed occurrences">
          {deviations.map((d) => (
            <Box key={d.originalStart} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                {fmtWhen(d.originalStart, item.isAllDay)} · {DEVIATION_LABELS[d.kind]}
                {d.change?.startsAt ? ` → ${fmtWhen(d.change.startsAt, item.isAllDay)}` : ''}
                {d.change?.title ? ` · ${d.change.title}` : ''}
              </Typography>
              <Button size="small" onClick={() => restore.mutate({ id: item.id, originalStart: d.originalStart })} disabled={restore.isPending}>
                Revert
              </Button>
            </Box>
          ))}
        </DrawerSection>
      )}

      <KindDetailsCard details={item.details} />
      <SeriesOnly locked={panelsLocked}>
        <AttendeesPanel item={item} />
        <CalendarsPanel item={item} />
      </SeriesOnly>
      <HierarchyPanel item={item} />
      <ItemPhotosPanel itemId={item.id} item={item} />
      <SeriesOnly locked={panelsLocked}>
        <RelationsPanel itemId={item.id} />
      </SeriesOnly>
      <Button variant="outlined" onClick={() => setAddingTask(true)}>
        Task for this event
      </Button>
      {addingTask && (
        <NewTaskDialog event={{ id: item.id, title: item.title ?? UNTITLED, day: itemDay(item) }} onClose={() => setAddingTask(false)} />
      )}
      <DrawerSection title="Tags">
        <SeriesOnly locked={seriesOnly}>
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
        </SeriesOnly>
      </DrawerSection>

      <SeriesOnly locked={panelsLocked}>
        <PayloadPanel item={item} />
        <MetadataPanel itemId={item.id} metadata={item.metadata} />
      </SeriesOnly>

      <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} title={`iCal UID ${item.externalId} · etag ${item.etag}`}>
          {item.category ?? 'General'} item
        </Typography>
        {occurrence && scopes.length > 1 ? (
          <>
            <Button variant="outlined" color="error" onClick={(e) => setDeleteMenu(e.currentTarget)} disabled={deleting}>
              Delete…
            </Button>
            <Menu anchorEl={deleteMenu} open={!!deleteMenu} onClose={() => setDeleteMenu(null)}>
              {scopes.map((s) => (
                <MenuItem
                  key={s}
                  onClick={() => {
                    setDeleteMenu(null);
                    deleteIn(s);
                  }}
                >
                  {SCOPE_LABELS[s]}
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : (
          <Button variant="outlined" color="error" onClick={() => deleteIn('series')} disabled={deleting}>
            Delete item
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** The local day an item starts on, 'yyyy-MM-dd' — all-day dates as stored, timed starts in this zone. */
function itemDay(item: CalendarItemDto): string | null {
  if (item.isAllDay) return item.startDate ?? null;
  return item.startsAt ? ymd(new Date(item.startsAt)) : null;
}


function SeriesOnly({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <Box inert={locked} sx={locked ? { opacity: 0.5 } : undefined}>
      {children}
    </Box>
  );
}

function occurrencePatch(data: UpdateCalendarItemRequest): OccurrencePatch {
  const patch: OccurrencePatch = {};
  if ('startsAt' in data) patch.startsAt = data.startsAt;
  if ('endsAt' in data) patch.endsAt = data.endsAt;
  if ('title' in data) patch.title = data.title;
  if ('description' in data) patch.description = data.description;
  if ('status' in data) patch.status = data.status as ItemStatus | null;
  return patch;
}

const sameInstant = (a: string, b?: string | null) => !!b && Date.parse(a) === Date.parse(b);
