import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useGetItem } from '@lupira/cal-api/query/cal';
import { useGetContact } from '@lupira/cal-api/query/contact';
import { ItemStatus, OriginKind, type CalendarItemOccurrenceDto, type ContainerDto } from '@lupira/cal-api/models';
import { groupOccurrences } from '@lupira/cal-domain/itemTree';
import { occurrenceKey } from '@lupira/cal-domain/seriesOccurrences';
import { statusBadge, displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { RANGE_PRESETS } from '@lupira/cal-domain/searchRange';
import { plural } from '@danbro96/lupira-domain-core/wording';
import { calendarLabel, useContainers } from '../../state/useContainers';
import { SEARCH_PAGE_SIZE, useItemSearch } from '../../state/useItemSearch';
import { errText } from '../errText';
import { calendarColor } from '../theme/kinds';
import { CategoryIcon, NamedIcon } from '../components/KindIcon';
import { CategorySelect } from '../components/CategorySelect';
import { useIsPhone } from '../hooks/useIsPhone';
import { PageHead } from '../components/Page';
import { Row, RowName } from '../components/Rows';
import { Page } from '../components/Page';
import { PersonIcon } from '@danbro96/lupira-web-mui/icons';

/** Global list/search over every readable calendar; rows deep-link into the ?item= drawer. */
export function ItemsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isPhone = useIsPhone();
  const { calendars } = useContainers();
  const { filters, occurrences, isLoading, isFetching, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useItemSearch();
  const [search, setSearch] = useState(filters.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { data: drillParent } = useGetItem(filters.parent, { query: { enabled: !!filters.parent } });
  const { data: drillContact } = useGetContact(filters.contact, { query: { enabled: !!filters.contact } });

  const setParam = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  // Drill-down is a fresh scoped view: all children of one item, other filters reset.
  const drill = (id: string) => {
    setSearch('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of ['item', 'occ', 'q', 'tag', 'cal', 'category', 'status', 'range', 'from', 'to', 'contact']) next.delete(k);
      next.set('parent', id);
      return next;
    });
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const byId = new Map(calendars.map((c) => [c.id, c]));
  const groups = groupOccurrences(occurrences);
  const secondaryCount = [filters.tag, filters.cal, filters.category, filters.status].filter(Boolean).length;

  // Birthdays and feed events are read-time projections, not stored items — link to their read-only cards
  // (their ids 404 the ?item= drawer); a holiday's row says all there is, so it links nowhere new; everything
  // else opens the shared item drawer.
  const occHref = (o: CalendarItemOccurrenceDto) => {
    if (o.origin?.kind === OriginKind.Holiday) return `?${searchParams.toString()}`;
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    next.delete('occ');
    next.delete('birthday');
    next.delete('year');
    next.delete('subscribed');
    next.delete('at');
    if (o.origin?.kind === OriginKind.Birthday) {
      next.set('birthday', o.origin.sourceId);
      next.set('year', o.start.slice(0, 4));
    } else if (o.origin?.kind === OriginKind.Subscription) {
      next.set('subscribed', `${o.calendarIds[0]}:${o.origin.sourceId}:${o.id}`);
      next.set('at', o.start);
    } else {
      next.set('item', o.id);
      if (o.originalStart) next.set('occ', occurrenceKey(o.originalStart));
    }
    return `?${next.toString()}`;
  };

  const filterControls = (
    <>
      <TextField
        placeholder="tag"
        defaultValue={filters.tag}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setParam('tag', (e.target as HTMLInputElement).value || null);
        }}
        onBlur={(e) => setParam('tag', e.target.value || null)}
      />
      <TextField
        select
        value={filters.cal}
        onChange={(e) => setParam('cal', e.target.value || null)}
        slotProps={{ htmlInput: { 'aria-label': 'Calendar' }, select: { displayEmpty: true } }}
      >
        <MenuItem value="">All calendars</MenuItem>
        {calendars.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {calendarLabel(c)}
          </MenuItem>
        ))}
      </TextField>
      <CategorySelect any value={filters.category} onChange={(c) => setParam('category', c || null)} />
      <TextField
        select
        value={filters.status}
        onChange={(e) => setParam('status', e.target.value || null)}
        slotProps={{ htmlInput: { 'aria-label': 'Status' }, select: { displayEmpty: true } }}
      >
        <MenuItem value="">Any status</MenuItem>
        {Object.values(ItemStatus).map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>
    </>
  );

  const rangeControls = (
    <>
      <ToggleButtonGroup
        exclusive
        value={filters.range}
        onChange={(_, nv) => nv != null && setParam('range', nv === 'upcoming' ? null : nv)}
      >
        {RANGE_PRESETS.map((r) => (
          <ToggleButton key={r} value={r}>
            {r}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {filters.range === 'custom' && (
        <>
          <TextField
            type="date"
            value={filters.from}
            onChange={(e) => setParam('from', e.target.value || null)}
            slotProps={{ htmlInput: { 'aria-label': 'From' } }}
          />
          <TextField
            type="date"
            value={filters.to}
            onChange={(e) => setParam('to', e.target.value || null)}
            slotProps={{ htmlInput: { 'aria-label': 'To' } }}
          />
        </>
      )}
    </>
  );

  return (
    <Page>
      <PageHead>
        <h2>Items</h2>
        {isFetching && !isFetchingNextPage && <Typography variant="caption" sx={{ color: 'text.secondary' }}>loading…</Typography>}
      </PageHead>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', search || null);
          }}
        >
          <TextField
            placeholder="Search title/description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        {filters.parent || filters.contact ? (
          <>
            {filters.parent && (
              <Chip
                variant="outlined"
                label={`↳ sub-items of ${drillParent?.title ?? '…'}`}
                onDelete={() => setParam('parent', null)}
              />
            )}
            {filters.contact && (
              <Chip
                variant="outlined"
                icon={<PersonIcon />}
                label={`with ${drillContact?.displayName ?? '…'}`}
                onDelete={() => setParam('contact', null)}
              />
            )}
          </>
        ) : (
          rangeControls
        )}
        {isPhone ? (
          <Button variant="outlined" startIcon={<FilterListIcon />} onClick={() => setSheetOpen(true)}>
            Filters{secondaryCount > 0 ? ` (${secondaryCount})` : ''}
          </Button>
        ) : (
          filterControls
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {groups.map((g, gi) => {
          const hasNested = g.children.length > 0;
          const open = !collapsed.has(g.occ.id);
          return (
            <Fragment key={`${g.occ.id}-${g.occ.start}-${gi}`}>
              <ItemRow
                occurrence={g.occ}
                byId={byId}
                href={occHref(g.occ)}
                open={hasNested ? open : undefined}
                onToggle={hasNested ? () => toggle(g.occ.id) : undefined}
                onDrill={drill}
                drilled={!!filters.parent}
              />
              {open &&
                g.children.map((c, ci) => (
                  <ItemRow key={`${c.id}-${c.start}-${ci}`} occurrence={c} byId={byId} href={occHref(c)} indent onDrill={drill} />
                ))}
            </Fragment>
          );
        })}
        {!isLoading && occurrences.length === 0 && !error && <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>No items match.</Typography>}
        {error && <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>{errText(error) ?? 'Search failed.'}</Typography>}
      </Box>
      {hasNextPage && (
        <Button variant="outlined" onClick={() => void fetchNextPage().catch(reportError)} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading…' : `Load ${SEARCH_PAGE_SIZE} more`}
        </Button>
      )}

      <SwipeableDrawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpen={() => setSheetOpen(true)}
        disableSwipeToOpen
        slotProps={{ paper: { sx: { maxHeight: '85dvh', p: 2 } } }}
      >
        {filterControls}
      </SwipeableDrawer>
    </Page>
  );
}

function ItemRow({
  occurrence: o,
  byId,
  href,
  indent,
  open,
  onToggle,
  onDrill,
  drilled,
}: {
  occurrence: CalendarItemOccurrenceDto;
  byId: Map<string, ContainerDto>;
  href: string;
  indent?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onDrill?: (id: string) => void;
  drilled?: boolean;
}) {
  const containers = o.calendarIds.map((id) => byId.get(id)).filter((c): c is ContainerDto => !!c);
  const first = containers[0];
  const childCount = o.childCount;
  // The row itself is a Link — embedded buttons must not trigger the navigation.
  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  return (
    <Row component={Link} to={href} sx={indent ? { ml: '26px', borderLeft: 2, borderColor: 'divider', pl: 1 } : undefined}>
      {onToggle && (
        <IconButton
          aria-label={open ? 'Collapse sub-items' : 'Expand sub-items'}
          onClick={(e) => stop(e, onToggle)}
          sx={{ flex: 'none' }}
        >
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
      )}
      {o.origin?.kind === OriginKind.Subscription
        ? <NamedIcon name="subscribed" sx={{ fontSize: 22 }} />
        : o.origin?.kind === OriginKind.Holiday
          ? <NamedIcon name="celebration" sx={{ fontSize: 22 }} />
          : <CategoryIcon category={o.category} sx={{ fontSize: 22 }} />}
      <RowName>{displayTitle(o.title)}</RowName>
      {!indent && o.parentItemId && !drilled && (
        <Chip
          variant="outlined"
          label={`↳ ${o.parentTitle ?? 'parent'}`}
          onClick={(e) => stop(e, () => onDrill?.(o.parentItemId!))}
        />
      )}
      {o.tags?.map((t) => (
        <Chip key={t} label={t} />
      ))}
      {statusBadge(o.status) && <Chip variant="outlined" label={statusBadge(o.status)} />}
      {childCount > 0 && (
        <Chip
          variant="outlined"
          label={plural(childCount, 'sub-item')}
          onClick={(e) => stop(e, () => onDrill?.(o.id))}
        />
      )}
      {first && (
        <Box component="span" sx={{ display: { xs: 'none', md: 'inline-flex' }, fontSize: 12, color: 'text.secondary', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flex: 'none' }}>
          <Box component="span" sx={{ width: 13, height: 13, borderRadius: '999px', border: 1, borderColor: 'border', flex: 'none', display: 'inline-block' }} style={{ background: calendarColor(first) }} />
          {calendarLabel(first)}
          {containers.length > 1 ? ` +${containers.length - 1}` : ''}
        </Box>
      )}
      <Box component="span" sx={{ display: 'inline-flex', fontSize: 12, color: 'text.secondary', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flex: 'none' }}>{fmtWhen(o.start, o.isAllDay)}</Box>
    </Row>
  );
}
