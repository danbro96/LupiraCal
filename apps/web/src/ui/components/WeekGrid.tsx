import { useMemo, useState } from 'react';
import { NamedIcon } from './KindIcon';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import type { AvailabilitySegment } from '../../state/useAvailability';
import { clampToDay, drawnEnd, foldLanes, hiddenPerColumn, inAllDayStrip, layoutColumns, packLanes } from '@lupira/cal-domain/occurrences';
import { type DayRail, familyKey, railsForDay } from '@lupira/cal-domain/family';
import { addDays, fmtBlockTime, fmtDayShort, isToday, minutesOfDay, ymd } from '@lupira/cal-domain/time';
import { textOn } from '@lupira/cal-tokens/contrast';
import { availabilityColor } from '@lupira/cal-tokens/kinds';
import { EMPHASIS } from '@lupira/cal-tokens/color';
import { familyAccent } from '../theme/kinds';
import { coversDay, segmentSpan, type GridEntry } from '../entries';
import { ExpandIcon, ExpandLessIcon } from '../icons';

const HOUR_PX = 48;
const RAIL_SLOT_PX = 5; // 3px rail + 2px gap
const MIN_BLOCK_PX = 18; // min block height; drives column packing so short neighbours don't overlap
const MIN_BLOCK_MINUTES = (MIN_BLOCK_PX / HOUR_PX) * 60;
const HEADER_PX = 18; // timed-parent header height; children starting under it drop below
const LANE_PX = 20;
const MAX_ALL_DAY_ROWS = 3; // the strip's cap; past it, its last row counts per day what is hidden

const MOTION = {
  '@media (prefers-reduced-motion: no-preference)': {
    transition: 'opacity 120ms ease, box-shadow 120ms ease',
  },
} as const;

type Fam = 'hi' | 'dim' | null;
type Role = 'parent' | 'child' | null;

/** The family inset marks the role; the outer ring marks the highlight. Composing them here replaces
 *  the six selector combinations this used to need. */
function famShadow(role: Role, fam: Fam, accent: string | undefined): string | undefined {
  if (!accent) return undefined;
  const parts: string[] = [];
  if (role === 'parent') parts.push(`inset 3px 0 0 0 ${accent}`);
  if (role === 'child') parts.push(`inset 0 3px 0 0 ${accent}`);
  if (fam === 'hi') parts.push(`0 0 0 2px ${accent}`);
  return parts.length ? parts.join(', ') : undefined;
}

interface Props {
  days: Date[];
  entries: GridEntry[];
  segments: AvailabilitySegment[];
  onOpenItem: (id: string) => void;
  selectedFamilyKey?: string;
}

type FamOf = (key: string | undefined) => Fam;

/** A timed item of a day or more is a span, so it joins the all-day strip — unless it is a parent,
 *  which keeps its rail and header in the lanes. */
const inStrip = (e: GridEntry) => inAllDayStrip(e, e.childCount > 0);

/** Timed week/day lanes: hour rows, an all-day strip, availability tint, and column-packed events. */
export function WeekGrid({ days, entries, segments, onOpenItem, selectedFamilyKey }: Props) {
  const allDay = useMemo(() => entries.filter(inStrip), [entries]);
  const timed = useMemo(() => entries.filter((e) => !inStrip(e)), [entries]);
  const nowMin = minutesOfDay(new Date());

  const [hoverFamily, setHoverFamily] = useState<string | null>(null);
  const activeFamily = hoverFamily ?? selectedFamilyKey ?? null;
  const famOf: FamOf = (key) => (activeFamily ? (key === activeFamily ? 'hi' : 'dim') : null);

  const railsByDay = useMemo(
    () => new Map(days.map((d) => [ymd(d), railsForDay(entries, d)])),
    [entries, days],
  );

  // The day count drove a --day-count custom property when this lived in CSS; sx can read it directly.
  const cols = { display: 'grid', gridTemplateColumns: `56px repeat(${days.length}, 1fr)` } as const;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ ...cols, flex: 'none' }}>
        <Box />
        {days.map((d) => (
          <Box
            key={d.toISOString()}
            sx={{
              p: '6px 8px',
              fontSize: 13,
              fontWeight: 700,
              borderLeft: 1,
              borderColor: 'divider',
              color: isToday(d) ? 'primary.main' : 'text.secondary',
            }}
          >
            {fmtDayShort(d)}
          </Box>
        ))}
      </Box>
      <AllDayStrip
        days={days}
        entries={allDay}
        cols={cols}
        famOf={famOf}
        onHoverFamily={setHoverFamily}
        onOpenItem={onOpenItem}
      />
      <Box sx={{ ...cols, flex: 1, overflowY: 'auto' }}>
        <Box sx={{ position: 'relative', height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, h) => (
            <Box
              key={h}
              sx={{ position: 'absolute', right: '6px', transform: 'translateY(-50%)', fontSize: 11, color: 'text.subtle' }}
              style={{ top: h * HOUR_PX }}
            >
              {String(h).padStart(2, '0')}:00
            </Box>
          ))}
        </Box>
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            timed={timed}
            segments={segments}
            nowMin={nowMin}
            rails={railsByDay.get(ymd(day)) ?? []}
            famOf={famOf}
            onHoverFamily={setHoverFamily}
            onOpenItem={onOpenItem}
          />
        ))}
      </Box>
    </Box>
  );
}

type StripBar = { entry: GridEntry; startCol: number; endCol: number; before: boolean; after: boolean };

/** All-day items (and day-long timed ones) as bars spanning the days they cover, packed into lanes. Past
 *  MAX_ALL_DAY_ROWS the last row counts per day what is hidden; a count or the chevron shows every lane. */
function AllDayStrip({
  days,
  entries,
  cols,
  famOf,
  onHoverFamily,
  onOpenItem,
}: {
  days: Date[];
  entries: GridEntry[];
  cols: Record<string, string>;
  famOf: FamOf;
  onHoverFamily: (key: string | null) => void;
  onOpenItem: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const bars = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    return packLanes(entries.flatMap((entry): StripBar[] => {
      const covered = days.flatMap((d, i) => (coversDay(entry, d) ? [i] : []));
      if (covered.length === 0) return [];
      return [{
        entry,
        startCol: covered[0],
        endCol: covered[covered.length - 1],
        before: coversDay(entry, addDays(first, -1)),
        after: coversDay(entry, addDays(last, 1)),
      }];
    }));
  }, [entries, days]);
  const laneCount = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const { drawn, rows, folded } = foldLanes(laneCount, expanded ? Infinity : MAX_ALL_DAY_ROWS);
  const hidden = folded ? hiddenPerColumn(bars, drawn, days.length) : [];
  const allRows = `1 / span ${Math.max(rows, 1)}`;

  return (
    <Box
      sx={{
        ...cols,
        flex: 'none',
        gridAutoRows: `${LANE_PX}px`,
        rowGap: '2px',
        py: '2px',
        borderTop: 1,
        borderBottom: 1,
        borderColor: 'divider',
        minHeight: 28,
        // However many lanes are shown, the timed grid below stays reachable.
        maxHeight: '30vh',
        overflowY: 'auto',
      }}
    >
      <Box sx={{ gridColumn: 1, gridRow: allRows, display: 'flex', alignItems: 'flex-start', fontSize: 12, color: 'text.secondary' }}>
        all-day
        {laneCount > MAX_ALL_DAY_ROWS && (
          <IconButton
            size="small"
            sx={{ p: 0, ml: 0.5 }}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse all-day events' : 'Show all all-day events'}
          >
            {expanded ? <ExpandLessIcon fontSize="inherit" /> : <ExpandIcon fontSize="inherit" />}
          </IconButton>
        )}
      </Box>
      {days.map((d, i) => (
        <Box key={d.toISOString()} sx={{ gridColumn: i + 2, gridRow: allRows, borderLeft: 1, borderColor: 'divider' }} />
      ))}
      {bars.filter((b) => b.lane < drawn).map((b) => {
        const e = b.entry;
        const fk = familyKey(e);
        const accent = fk ? familyAccent(fk) : undefined;
        const fam = famOf(fk);
        const role: Role = e.childCount > 0 ? 'parent' : e.parentItemId ? 'child' : null;
        return (
          <ButtonBase
            key={e.key}
            onClick={() => onOpenItem(e.itemId)}
            onMouseEnter={fk ? () => onHoverFamily(fk) : undefined}
            onMouseLeave={fk ? () => onHoverFamily(null) : undefined}
            sx={{
              gridColumn: `${b.startCol + 2} / ${b.endCol + 3}`,
              gridRow: b.lane + 1,
              mx: '2px',
              border: 0,
              borderRadius: '3px',
              color: textOn(e.color),
              fontSize: 12,
              lineHeight: `${LANE_PX}px`,
              p: '0 6px',
              justifyContent: 'flex-start',
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
              // A span continuing past the visible days runs flush to that edge.
              ...(b.before && { ml: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }),
              ...(b.after && { mr: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }),
              // A deadline is an outlined pill, not a filled chip — it drops the entry colour.
              ...(e.task && {
                bgcolor: 'background.paper',
                color: e.task.overdue ? 'error.main' : 'text.primary',
                border: 1,
                borderColor: e.task.overdue ? 'error.main' : 'text.secondary',
              }),
              ...(e.status === 'Cancelled' && { opacity: EMPHASIS.cancelled, textDecoration: 'line-through' }),
              ...(e.ghost && { opacity: EMPHASIS.ghost, borderStyle: 'dashed' }),
              ...(role === 'parent' && { pl: '9px' }),
              boxShadow: famShadow(role, fam, accent),
              ...(fam === 'dim' && { opacity: 0.35 }),
              ...MOTION,
            }}
            style={{ background: e.task ? undefined : e.color }}
          >
            {e.icon && <NamedIcon name={e.icon} sx={{ verticalAlign: -2, mr: 0.25 }} />}
            {e.title}
            {e.childCount > 0 ? ` · ${e.childCount}` : ''}
          </ButtonBase>
        );
      })}
      {hidden.map((n, i) =>
        n > 0 ? (
          <ButtonBase
            key={`more-${i}`}
            onClick={() => setExpanded(true)}
            sx={{ gridColumn: i + 2, gridRow: rows, fontSize: 11, fontWeight: 600, color: 'text.secondary' }}
            aria-label={`${n} more`}
          >
            +{n}
          </ButtonBase>
        ) : null,
      )}
    </Box>
  );
}

function DayColumn({
  day,
  timed,
  segments,
  nowMin,
  rails,
  famOf,
  onHoverFamily,
  onOpenItem,
}: {
  day: Date;
  timed: GridEntry[];
  segments: AvailabilitySegment[];
  nowMin: number;
  rails: DayRail[];
  famOf: FamOf;
  onHoverFamily: (key: string | null) => void;
  onOpenItem: (id: string) => void;
}) {
  const positioned = useMemo(() => {
    // Parents drawn as a rail are excluded from column packing so they bracket their children
    // instead of stealing a column.
    const railIds = new Set(rails.map((r) => r.itemId));
    const spans = timed
      .filter((e) => !railIds.has(e.itemId))
      .flatMap((e) => {
        const span = clampToDay(e.start, drawnEnd(e.start, e.end), day);
        return span ? [{ ...span, item: e }] : [];
      });
    return layoutColumns(spans, MIN_BLOCK_MINUTES);
  }, [timed, day, rails]);

  const daySegments = useMemo(
    () =>
      segments.flatMap((s) => {
        if (s.isAllDay) return coversDay(segmentSpan(s), day) ? [{ startMin: 0, endMin: 1440, status: s.status }] : [];
        const span = clampToDay(new Date(s.start), s.end ? new Date(s.end) : new Date(s.start), day);
        return span ? [{ ...span, status: s.status }] : [];
      }),
    [segments, day],
  );

  // Earliest child top per timed parent — decides whether its header sits in the gap or above the start.
  const firstChildTopByRail = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positioned) {
      if (!p.item.parentItemId) continue;
      const top = (p.startMin / 60) * HOUR_PX;
      const cur = m.get(p.item.parentItemId);
      if (cur == null || top < cur) m.set(p.item.parentItemId, top);
    }
    return m;
  }, [positioned]);

  // A single rail tints its span (the whole column for an all-day parent, the parent's hours for a
  // timed one); two rails would blend into mud, so no tint then.
  const tintRail = rails.length === 1 ? rails[0] : null;

  return (
    <Box sx={{ position: 'relative', borderLeft: 1, borderColor: 'divider', minWidth: 0 }} style={{ height: 24 * HOUR_PX }}>
      {Array.from({ length: 24 }, (_, h) => (
        <Box
          key={h}
          sx={{ position: 'absolute', left: 0, right: 0, borderTop: 1, borderColor: 'divider' }}
          style={{ top: h * HOUR_PX }}
        />
      ))}
      {daySegments.map((s, i) => (
        <Box
          key={`seg-${i}`}
          title={s.status}
          sx={{ position: 'absolute', left: 0, right: 0, opacity: EMPHASIS.availabilityBand, borderRadius: '2px' }}
          style={{
            top: (s.startMin / 60) * HOUR_PX,
            height: ((s.endMin - s.startMin) / 60) * HOUR_PX,
            background: availabilityColor(s.status),
          }}
        >
          <Box
            component="span"
            sx={{ position: 'absolute', top: '2px', right: '4px', fontSize: 10, fontWeight: 700, color: 'text.primary' }}
          >
            {s.status}
          </Box>
        </Box>
      ))}
      {tintRail && (
        <Box
          sx={{ position: 'absolute', left: 0, right: 0, borderRadius: '2px' }}
          style={{
            top: tintRail.startMin != null ? (tintRail.startMin / 60) * HOUR_PX : 0,
            height:
              tintRail.startMin != null && tintRail.endMin != null
                ? ((tintRail.endMin - tintRail.startMin) / 60) * HOUR_PX
                : 24 * HOUR_PX,
            background: `color-mix(in srgb, ${familyAccent(tintRail.itemId)} 6%, transparent)`,
          }}
        />
      )}
      {rails.map((r, i) => {
        const fam = famOf(r.itemId);
        const accent = familyAccent(r.itemId);
        return (
          <ButtonBase
            key={`rail-${r.itemId}`}
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '3px',
              p: 0,
              border: 0,
              borderRadius: '2px',
              zIndex: 2,
              ...(fam === 'hi' && { boxShadow: `0 0 0 2px ${accent}` }),
              ...(fam === 'dim' && { opacity: 0.35 }),
              ...MOTION,
            }}
            style={{
              left: i * RAIL_SLOT_PX,
              top: r.startMin != null ? (r.startMin / 60) * HOUR_PX : 0,
              height: r.startMin != null && r.endMin != null ? ((r.endMin - r.startMin) / 60) * HOUR_PX : undefined,
              bottom: r.startMin != null ? 'auto' : 0,
              background: accent,
            }}
            title={r.title}
            aria-label={r.title}
            onClick={() => onOpenItem(r.itemId)}
            onMouseEnter={() => onHoverFamily(r.itemId)}
            onMouseLeave={() => onHoverFamily(null)}
          />
        );
      })}
      {/* Timed parents have no all-day chip, so label them with a header at the top of their span —
          in the gap before the first child when there's room, otherwise just above the start so it
          never hides a child that begins at the same time. */}
      {rails.map((r) => {
        if (r.startMin == null) return null;
        const railTopPx = (r.startMin / 60) * HOUR_PX;
        const firstChildTop = firstChildTopByRail.get(r.itemId);
        const atStart = firstChildTop == null || firstChildTop - railTopPx >= HEADER_PX;
        const fam = famOf(r.itemId);
        const accent = familyAccent(r.itemId);
        return (
          <ButtonBase
            key={`rail-hd-${r.itemId}`}
            sx={{
              position: 'absolute',
              right: '2px',
              zIndex: 2,
              color: textOn(accent),
              border: 0,
              borderRadius: '3px',
              fontSize: 11,
              fontWeight: 700,
              p: '1px 7px',
              justifyContent: 'flex-start',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              ...(fam === 'hi' && { boxShadow: `0 0 0 2px ${accent}` }),
              ...(fam === 'dim' && { opacity: 0.35 }),
            }}
            style={{
              top: atStart ? railTopPx : railTopPx - HEADER_PX,
              left: rails.length * RAIL_SLOT_PX,
              background: accent,
            }}
            title={r.title}
            onClick={() => onOpenItem(r.itemId)}
            onMouseEnter={() => onHoverFamily(r.itemId)}
            onMouseLeave={() => onHoverFamily(null)}
          >
            {r.title}
            {r.childCount > 0 ? ` · ${r.childCount}` : ''}
          </ButtonBase>
        );
      })}
      {positioned.map((p) => {
        const fk = familyKey(p.item);
        const accent = fk ? familyAccent(fk) : undefined;
        const fam = famOf(fk);
        const role: Role = p.item.parentItemId ? 'child' : null;
        const railIdx = p.item.parentItemId ? rails.findIndex((r) => r.itemId === p.item.parentItemId) : -1;
        const inset = railIdx >= 0 && p.col === 0 ? rails.length * RAIL_SLOT_PX : 0;
        return (
          <ButtonBase
            key={p.item.key}
            sx={{
              position: 'absolute',
              border: 0,
              borderRadius: 1,
              color: textOn(p.item.color),
              p: '2px 6px',
              textAlign: 'left',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              zIndex: 1,
              ...(p.item.status === 'Cancelled' && { opacity: EMPHASIS.cancelled }),
              ...(p.item.ghost && { opacity: EMPHASIS.ghost }),
              ...(role === 'child' && { pt: '5px' }),
              boxShadow: famShadow(role, fam, accent),
              ...(fam === 'dim' && { opacity: 0.35 }),
              ...MOTION,
            }}
            style={{
              top: (p.startMin / 60) * HOUR_PX,
              height: Math.max(((p.endMin - p.startMin) / 60) * HOUR_PX - 2, MIN_BLOCK_PX),
              left: `calc(${(p.col / p.cols) * 100}% + ${2 + inset}px)`,
              width: `calc(${(1 / p.cols) * 100}% - ${4 + inset}px)`,
              background: p.item.color,
            }}
            onClick={() => onOpenItem(p.item.itemId)}
            onMouseEnter={fk ? () => onHoverFamily(fk) : undefined}
            onMouseLeave={fk ? () => onHoverFamily(null) : undefined}
            title={p.item.ghost ? `${p.item.title} (proposed)` : p.item.title}
          >
            <Box
              component="span"
              sx={{
                fontSize: 12,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                ...(p.item.status === 'Cancelled' && { textDecoration: 'line-through' }),
              }}
            >
              {p.item.icon && <NamedIcon name={p.item.icon} sx={{ verticalAlign: -2, mr: 0.25 }} />}
              {p.item.title}
            </Box>
            <Box component="span" sx={{ fontSize: 11, opacity: 0.85 }}>
              {fmtBlockTime(p.item.start, drawnEnd(p.item.start, p.item.end), day)}
              {p.item.ghost ? ' · proposed' : ''}
            </Box>
            {p.item.place && (
              <Box component="span" sx={{ fontSize: 11, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {p.item.place}
              </Box>
            )}
          </ButtonBase>
        );
      })}
      {isToday(day) && (
        <Box
          sx={{ position: 'absolute', left: 0, right: 0, borderTop: 2, borderColor: 'error.main', zIndex: 2 }}
          style={{ top: (nowMin / 60) * HOUR_PX }}
        />
      )}
    </Box>
  );
}
