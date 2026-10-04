import {
  clampToDay, drawnEnd, foldLanes, hiddenPerColumn, inAllDayStrip, lastDayOf, layoutColumns, packLanes, type Positioned,
} from '@lupira/cal-domain/occurrences';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { addDays, daysFrom, fmtBlockTime, fmtDayShort, isToday, minutesOfDay, parseYmd, ymd } from '@danbro96/lupira-domain-core/time';
import { textOn } from '@danbro96/lupira-tokens-core/contrast';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { Text } from 'react-native-paper';
import Animated, {
  scrollTo, useAnimatedRef, useAnimatedStyle, useScrollOffset, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PlaceDto } from '@lupira/cal-api/models';
import { EMPHASIS } from '@lupira/cal-tokens/color';
import { withAlpha } from '@danbro96/lupira-tokens-core/color';
import type { GridRow } from '../../data/mirror';
import { isTaskRow } from '../../domain/taskRows';
import { usePrefs } from '../../state/prefs-store';
import { useOverlappingOccurrences, type CalRow } from '../../state/useOccurrences';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { availabilityColor, useCalendarColors } from '../hooks/palette';
import { useBackDismiss } from '@danbro96/lupira-expo-paper/hooks/useBackDismiss';
import { AvailStrip, addStatus } from './AvailStrip';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';
import { useJump, type CalendarJump } from './jump';
import { usePager } from './usePager';

const MIN_HOUR_H = 16;
const MAX_HOUR_H = 160;
const DAY_MIN = 24 * 60;
const DAY_MS = 86_400_000;
const pct = (min: number) => `${(min / DAY_MIN) * 100}%` as const;
/** Day columns are placed in percent of one week's width, counted from the view's origin day. */
const colPct = (col: number) => `${(col / 7) * 100}%` as const;
const dayIndex = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);

const slotTime = (slot: number) => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
const MAX_STRIP_SHARE = 0.3;
const LEAD_HOURS = 2;         // "now" opens this far below the top of the lanes
const HEADER_H = 24;
const LANE_H = 17;
const CHIP_GLYPH = 10;

const hoursBeforeNow = () => Math.max(0, minutesOfDay(new Date()) / 60 - LEAD_HOURS);

type Bar = { row: CalRow; startCol: number; endCol: number; before: boolean; after: boolean };

/** Week grid: a strip of day-spanning bars on top (all-day items, deadlines, and timed items of a day or
 *  more), timed lanes below. Placement is the domain's clampToDay + layoutColumns (the same math the web
 *  grid uses) and packLanes for the strip; data is the mirror's rows overlapping the rendered days.
 *
 *  Paging (usePager): the previous, current and next week are rendered as 21 columns keyed by date and
 *  placed on a day axis fixed at mount, one week per page — so the neighbour is live under the finger,
 *  and after a step the new far-side week mounts off-screen. A jump snaps, and Today also scrolls the
 *  current time back into view. */
export function WeekView({ weekStart, jump, onStep, onPressOccurrence, onCreateSlot }: {
  weekStart: Date;
  jump: CalendarJump;
  onStep: (dir: 1 | -1) => void;
  onPressOccurrence: (row: CalRow) => void;
  onCreateSlot: (day: string, time: string) => void;
}) {
  // First tap on an empty lane drops a ＋ chip on that hour; tapping the chip opens the prefilled editor.
  // Slot granularity is 30 min; the ＋ chip covers the tapped half hour (prefill length stays 1h).
  const c = useColors();
  const [pendingSlot, setPendingSlot] = useState<{ day: string; slot: number } | null>(null);
  const clearSlot = () => setPendingSlot(null);
  useBackDismiss(pendingSlot !== null, clearSlot);
  const tapSlot = (day: string, slot: number) => {
    setPendingSlot((cur) => (cur && cur.day === day && cur.slot === slot ? null : { day, slot }));
  };
  const createFromSlot = (day: string, slot: number) => {
    onCreateSlot(day, slotTime(slot));
    setPendingSlot(null);
  };

  const [originIdx] = useState(() => dayIndex(weekStart));
  const page = (dayIndex(weekStart) - originIdx) / 7;
  const firstCol = page * 7 - 7;
  const days = daysFrom(addDays(weekStart, -7), 21);
  const dayKeys = days.map(ymd);
  const weekKeys = [dayKeys.slice(0, 7), dayKeys.slice(7, 14), dayKeys.slice(14)];

  const { rows } = useOverlappingOccurrences(dayKeys);
  // A week wider on each side, so the next step's deadlines are already fetched; bars filter by week.
  const taskRows = useTaskDeadlines(daysFrom(addDays(weekStart, -14), 35).map(ymd));
  const colorOf = useCalendarColors();
  const [initialHours] = useState(() => (weekKeys[1].includes(ymd(new Date())) ? hoursBeforeNow() : 7.5));
  const zoom = useTimeZoom(initialHours);
  const { scrollRef } = zoom;
  const pager = usePager(onStep);
  useJump(jump, (j) => {
    pager.snapTo(page);
    if (j.toNow) zoom.scrollToHours(hoursBeforeNow());
  });

  const bars: Bar[][] = [[], [], []];
  const timed: GridRow[] = [];
  const timedByDay = new Map<string, GridRow[]>();
  const availByDay = new Map<string, (string | null)[]>();
  for (const r of [...rows, ...taskRows]) {
    const end = lastDayOf(r.start_day, r.end_utc, r.all_day === 1);
    if (r.is_availability === 1) {
      // Renders as the column tint, never a chip.
      for (const k of dayKeys) if (k >= r.start_day && k <= end) addStatus(availByDay, k, r.avail_status);
      continue;
    }
    if (inAllDayStrip({ isAllDay: r.all_day === 1, start: new Date(r.start_utc), end: r.end_utc ? new Date(r.end_utc) : null })) {
      // Split per week: each week packs its own lanes, the way a paged calendar shows a long span.
      weekKeys.forEach((keys, w) => {
        const first = keys[0];
        const last = keys[6];
        if (r.start_day > last || end < first) return;
        bars[w].push({
          row: r,
          startCol: r.start_day <= first ? 0 : keys.indexOf(r.start_day),
          endCol: end >= last ? 6 : keys.indexOf(end),
          before: r.start_day < first,
          after: end > last,
        });
      });
    } else {
      timed.push(r as GridRow);
      for (const k of dayKeys) {
        if (k < r.start_day || k > end) continue;
        const list = timedByDay.get(k) ?? [];
        list.push(r as GridRow);
        timedByDay.set(k, list);
      }
    }
  }
  const places = usePlaceCoords(timed.map((r) => r.place_id));
  const rowColor = (r: CalRow) => colorOf(r.calendar_id, r.source);

  return (
    <GestureDetector gesture={pager.gesture}>
      <View style={styles.root}>
        <View style={[styles.headerRow, { borderColor: c.divider }]}>
          <SlidingDays slideStyle={pager.slideStyle} onClipLayout={pager.onPageLayout}>
            {days.map((d, i) => (
              <View key={dayKeys[i]} style={[styles.dayHeader, { left: colPct(firstCol + i), width: colPct(1) }]}>
                <Text style={[styles.dayHeaderText, { color: isToday(d) ? c.primary : c.textMuted }, isToday(d) && styles.today]}>
                  {fmtDayShort(d)}
                </Text>
                {availByDay.has(dayKeys[i]) && <AvailStrip statuses={availByDay.get(dayKeys[i]) ?? []} style={styles.availStrip} />}
              </View>
            ))}
          </SlidingDays>
        </View>

        <AllDayStrip weeks={bars} firstCol={firstCol} slideStyle={pager.slideStyle} rowColor={rowColor} onPress={onPressOccurrence} />

        <GestureDetector gesture={zoom.pinch}>
          <View style={styles.viewport} onLayout={zoom.onViewportLayout}>
            <GestureDetector gesture={zoom.scroll}>
              <Animated.ScrollView ref={scrollRef} contentOffset={zoom.initialOffset}>
                <Animated.View style={[styles.lanes, zoom.lanesStyle]}>
                  <SlidingDays
                    slideStyle={pager.slideStyle}
                    gutter={Array.from({ length: 24 }, (_, h) => (
                      <Text key={h} style={[styles.hourLabel, { top: pct(h * 60), color: c.textMuted }]}>
                        {String(h).padStart(2, '0')}
                      </Text>
                    ))}
                    // Hour lines are the same every week, so they stay still behind the sliding columns.
                    behind={Array.from({ length: 48 }, (_, i) => (
                      <View key={i} style={[styles.line, { top: pct(i * 30), backgroundColor: i % 2 ? c.surface : c.divider }]} />
                    ))}
                  >
                    {dayKeys.map((dayKey, i) => (
                      <DayColumn
                        key={dayKey}
                        dayKey={dayKey}
                        col={firstCol + i}
                        rows={timedByDay.get(dayKey) ?? NO_ROWS}
                        places={places}
                        avail={availByDay.get(dayKey)?.[0]}
                        slot={pendingSlot?.day === dayKey ? pendingSlot.slot : null}
                        hourH={zoom.hourH}
                        onTapSlot={tapSlot}
                        onCreateFromSlot={createFromSlot}
                        onPressOccurrence={onPressOccurrence}
                      />
                    ))}
                    <NowLine dayKeys={dayKeys} firstCol={firstCol} />
                  </SlidingDays>
                </Animated.View>
              </Animated.ScrollView>
            </GestureDetector>
          </View>
        </GestureDetector>
      </View>
    </GestureDetector>
  );
}

const NO_ROWS: GridRow[] = [];

type DayColumnProps = {
  dayKey: string;
  /** Position on the pager's day axis — fixed per date, so a step never moves a kept column. */
  col: number;
  /** Timed rows touching this day, in start order; the rows themselves are the query's own objects. */
  rows: GridRow[];
  places: Map<string, PlaceDto>;
  /** The day's first availability status, tinting the column (every status shows in the header strip). */
  avail: string | null | undefined;
  slot: number | null;
  hourH: SharedValue<number>;
  onTapSlot: (day: string, slot: number) => void;
  onCreateFromSlot: (day: string, slot: number) => void;
  onPressOccurrence: (row: CalRow) => void;
};

const placeNameOf = (places: Map<string, PlaceDto>, r: GridRow) => (r.place_id ? places.get(r.place_id)?.name : undefined);

/** A step re-renders WeekView with a new 21-day window and fresh arrays, but a kept day's content is
 *  unchanged — so compare what the column draws: its rows by identity, and only its own place names. */
function sameColumn(a: DayColumnProps, b: DayColumnProps): boolean {
  return a.dayKey === b.dayKey && a.col === b.col && a.avail === b.avail && a.slot === b.slot && a.hourH === b.hourH
    && a.onTapSlot === b.onTapSlot && a.onCreateFromSlot === b.onCreateFromSlot && a.onPressOccurrence === b.onPressOccurrence
    && a.rows.length === b.rows.length && a.rows.every((r, i) => r === b.rows[i])
    && a.rows.every((r) => placeNameOf(a.places, r) === placeNameOf(b.places, r));
}

/** One day's timed lane: tap for a ＋ slot, blocks placed by clampToDay + layoutColumns. */
const DayColumn = memo(function DayColumn({ dayKey, col, rows, places, avail, slot, hourH, onTapSlot, onCreateFromSlot, onPressOccurrence }: DayColumnProps) {
  const c = useColors();
  const colorOf = useCalendarColors();
  const day = parseYmd(dayKey);
  const spans = rows.flatMap((r) => {
    const start = new Date(r.start_utc);
    const end = drawnEnd(start, r.end_utc ? new Date(r.end_utc) : null);
    const span = clampToDay(start, end, day);
    return span ? [{ ...span, item: { row: r, when: fmtBlockTime(start, end, day) } }] : [];
  });
  return (
    <Pressable
      style={[
        styles.dayColumn,
        { left: colPct(col), width: colPct(1), borderColor: c.divider },
        avail !== undefined && { backgroundColor: withAlpha(availabilityColor(avail), EMPHASIS.availabilityBand) },
      ]}
      onPress={(e) => onTapSlot(dayKey, Math.max(0, Math.min(47, Math.floor(e.nativeEvent.locationY / (hourH.get() / 2)))))}
    >
      {slot !== null && (
        <View style={[styles.slotCell, { top: pct(slot * 30), height: pct(30) }]}>
          <Pressable
            style={[styles.slotChip, { borderColor: c.primary, backgroundColor: c.primary + '22' }]}
            onPress={() => onCreateFromSlot(dayKey, slot)}
          >
            <Text style={[styles.slotChipText, { color: c.primary }]} numberOfLines={1}>＋ {slotTime(slot)}</Text>
          </Pressable>
        </View>
      )}
      {layoutColumns(spans, 30).map((p) => (
        <EventBlock
          key={`${p.item.row.source_id}-${p.item.row.start_utc}`}
          placed={p}
          color={colorOf(p.item.row.calendar_id, p.item.row.source)}
          placeName={placeNameOf(places, p.item.row)}
          onPress={onPressOccurrence}
        />
      ))}
    </Pressable>
  );
}, sameColumn);

/** Title first, then start time and place: a short block clips to its title, and the rest appears as the
 *  block grows — including live, mid-pinch, without a re-render. */
function EventBlock({ placed, color, placeName, onPress }: {
  placed: Positioned<{ row: GridRow; when: string }>;
  color: string;
  placeName: string | undefined;
  onPress: (row: CalRow) => void;
}) {
  const { row: item, when } = placed.item;
  const fg = textOn(color);
  const cancelled = item.status === 'Cancelled';
  return (
    <Pressable
      style={[styles.event, {
        top: pct(placed.startMin),
        height: pct(placed.endMin - placed.startMin),
        left: `${(placed.col / placed.cols) * 100}%`,
        width: `${(1 / placed.cols) * 100}%`,
        backgroundColor: color,
      }, cancelled && styles.cancelled]}
      onPress={() => onPress(item)}
    >
      <Text style={[styles.eventTitle, { color: fg }, cancelled && styles.struck]} numberOfLines={2}>{displayTitle(item.title)}</Text>
      <Text style={[styles.eventMeta, { color: fg }]} numberOfLines={1}>{when}</Text>
      {placeName ? <Text style={[styles.eventMeta, { color: fg }]} numberOfLines={1}>{placeName}</Text> : null}
    </Pressable>
  );
}

/** Bars packed into lanes per week. The strip is as tall as the current week (index 1) needs, capped at the
 *  `allDayRows` pref: past it, the last row counts per day what is hidden instead of drawing bars. Tapping
 *  a count or the gutter chevron shows every lane. However many lanes are shown, the strip never takes more
 *  than a share of the screen — past that it scrolls, so the timed lanes stay reachable. */
function AllDayStrip({ weeks, firstCol, slideStyle, rowColor, onPress }: {
  weeks: Bar[][];
  firstCol: number;
  slideStyle: ReturnType<typeof useAnimatedStyle>;
  rowColor: (r: CalRow) => string;
  onPress: (row: CalRow) => void;
}) {
  const c = useColors();
  const maxHeight = Math.round(useWindowDimensions().height * MAX_STRIP_SHARE);
  const [expanded, setExpanded] = useState(false);
  const laned = weeks.map((bars) => packLanes(bars));
  const laneCount = (w: number) => laned[w].reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const rowsPref = usePrefs((p) => p.allDayRows);
  const limit = rowsPref === 'all' ? Infinity : Number(rowsPref);
  const fold = (count: number) => (expanded ? foldLanes(count, Infinity) : foldLanes(count, limit));
  const current = laneCount(1);
  if (current === 0) return null;
  const overflows = current > limit;
  const height = fold(current).rows * LANE_H + 2;

  return (
    <View style={[styles.allDayStrip, { borderColor: c.divider, height: Math.min(height, maxHeight) }]}>
      <ScrollView scrollEnabled={height > maxHeight} contentContainerStyle={[styles.allDayRow, { height }]}>
        <SlidingDays
          slideStyle={slideStyle}
          gutter={overflows && (
            <Pressable
              style={styles.stripToggle}
              onPress={() => setExpanded((e) => !e)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Collapse all-day events' : 'Show all all-day events'}
            >
              <Text style={{ color: c.textMuted }}><Glyph name={expanded ? ICONS.collapse : ICONS.expand} size={18} /></Text>
            </Pressable>
          )}
        >
          {laned.flatMap((weekBars, w) => {
            const { drawn: shown, folded } = fold(laneCount(w));
            const weekCol = firstCol + w * 7;
            const hidden = folded ? hiddenPerColumn(weekBars, shown, 7) : [];
            return [
              ...weekBars.filter((b) => b.lane < shown).map((b) => (
                <StripBar key={`${w}-${b.row.source}-${b.row.source_id}-${b.row.start_utc}`} bar={b} left={weekCol + b.startCol} rowColor={rowColor} onPress={onPress} />
              )),
              ...hidden.flatMap((n, col) => (n > 0 ? [(
                <Pressable
                  key={`more-${w}-${col}`}
                  style={[styles.more, { top: shown * LANE_H + 1, left: colPct(weekCol + col), width: colPct(1) }]}
                  onPress={() => setExpanded(true)}
                  accessibilityLabel={`${n} more`}
                >
                  <Text style={[styles.moreText, { color: c.textMuted }]}>+{n}</Text>
                </Pressable>
              )] : [])),
            ];
          })}
        </SlidingDays>
      </ScrollView>
    </View>
  );
}

function StripBar({ bar, left, rowColor, onPress }: {
  bar: Bar & { lane: number };
  left: number;
  rowColor: (r: CalRow) => string;
  onPress: (row: CalRow) => void;
}) {
  const c = useColors();
  const r = bar.row;
  const task = isTaskRow(r) ? r.task : null;
  const fill = task ? null : rowColor(r);
  const cancelled = r.status === 'Cancelled';
  return (
    <Pressable
      style={[
        styles.bar,
        { top: bar.lane * LANE_H + 1, left: colPct(left), width: colPct(bar.endCol - bar.startCol + 1) },
        bar.before && styles.barBefore,
        bar.after && styles.barAfter,
        task
          ? [
              styles.taskChip,
              { backgroundColor: c.surface, borderColor: c.border },
              task.overdue && { borderColor: c.danger, backgroundColor: c.danger + '22' },
            ]
          : { backgroundColor: fill ?? undefined },
        cancelled && styles.cancelled,
      ]}
      onPress={() => onPress(r)}
    >
      <Text
        style={[styles.chipText, { color: task ? (task.overdue ? c.danger : c.textMuted) : textOn(fill ?? '') }, cancelled && styles.struck]}
        numberOfLines={1}
      >
        {task ? <><Glyph name={ICONS.schedule} size={CHIP_GLYPH} /> {displayTitle(r.title)}</> : r.source === 'birthday' ? <><Glyph name={ICONS.cake} size={CHIP_GLYPH} /> {displayTitle(r.title)}</> : displayTitle(r.title)}
      </Text>
    </Pressable>
  );
}

/** The current-time rule across today's column; ticks on its own, so the grid doesn't re-render for it. */
function NowLine({ dayKeys, firstCol }: { dayKeys: string[]; firstCol: number }) {
  const c = useColors();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const i = dayKeys.indexOf(ymd(now));
  if (i < 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.nowLine, { top: pct(minutesOfDay(now)), left: colPct(firstCol + i), width: colPct(1), backgroundColor: c.danger }]}
    >
      <View style={[styles.nowDot, { backgroundColor: c.danger }]} />
    </View>
  );
}

/** A fixed hour gutter beside a clipped, one-week-wide window; the day columns inside it ride the pager
 *  offset, `behind` stays still. */
function SlidingDays({ slideStyle, gutter, behind, onClipLayout, children }: {
  slideStyle: ReturnType<typeof useAnimatedStyle>;
  gutter?: ReactNode;
  behind?: ReactNode;
  onClipLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <>
      <View style={styles.gutter}>{gutter}</View>
      <View style={styles.clip} onLayout={onClipLayout}>
        {behind && <View pointerEvents="none" style={StyleSheet.absoluteFill}>{behind}</View>}
        <Animated.View style={[styles.days, slideStyle]}>{children}</Animated.View>
      </View>
    </>
  );
}

/** Pinch zoom on the time axis, anchored on the fingers: the time under the focal point stays under it.
 *  Everything in the lanes is placed in percent of the day, so a zoom frame animates one height on the
 *  UI thread instead of re-rendering the grid. */
function useTimeZoom(initialHours: number) {
  'use no memo';
  const savedHourH = usePrefs((p) => p.hourHeight);
  const [initialOffset] = useState(() => ({ x: 0, y: initialHours * savedHourH }));
  const hourH = useSharedValue(savedHourH);
  useEffect(() => {
    hourH.set(savedHourH);
  }, [hourH, savedHourH]);
  const viewportH = useSharedValue(0);
  const startH = useSharedValue(0);
  const anchorHours = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);

  // eslint-disable-next-line react-hooks/refs -- scrollRef is only used by the pinch worklet's scrollTo on the UI thread
  const [gestures] = useState(() => {
    const save = (value: number) => void usePrefs.getState().setHourHeight(value);
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        startH.set(hourH.get());
        anchorHours.set((scrollY.get() + e.focalY) / hourH.get());
      })
      .onUpdate((e) => {
        // Zoomed all the way out, the whole day fits the viewport — never smaller.
        const minH = Math.max(MIN_HOUR_H, viewportH.get() / 24);
        const next = Math.min(MAX_HOUR_H, Math.max(minH, startH.get() * e.scale));
        hourH.set(next);
        scrollTo(scrollRef, 0, Math.max(0, anchorHours.get() * next - e.focalY), false);
      })
      .onEnd(() => {
        scheduleOnRN(save, Math.round(hourH.get() * 10) / 10);
      });
    // The ScrollView joins RNGH's arbitration, so a pinch cancels its scroll and a vertical drag fails the swipe.
    return { pinch, scroll: Gesture.Native() };
  });

  const lanesStyle = useAnimatedStyle(() => ({ height: 24 * hourH.get() }));
  const scrollToHours = useCallback((hours: number) => {
    scrollRef.current?.scrollTo({ y: hours * hourH.get(), animated: true });
  }, [scrollRef, hourH]);
  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    viewportH.set(e.nativeEvent.layout.height);
  }, [viewportH]);

  return { ...gestures, hourH, scrollRef, initialOffset, lanesStyle, scrollToHours, onViewportLayout };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', height: HEADER_H, borderBottomWidth: 0.5 },
  gutter: { width: 34 },
  clip: { flex: 1, overflow: 'hidden' },
  days: { flex: 1 },
  viewport: { flex: 1 },
  dayHeader: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  // The same band as the month cell's: the tint alone is too faint to find a status by.
  availStrip: { position: 'absolute', left: 2, right: 2, bottom: 1 },
  dayHeaderText: { fontSize: 12 },
  today: { fontWeight: '700' },
  allDayStrip: { borderBottomWidth: 0.5 },
  allDayRow: { flexDirection: 'row' },
  stripToggle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute', height: LANE_H - 2, marginHorizontal: 1, paddingHorizontal: 3,
    borderRadius: 3, justifyContent: 'center', overflow: 'hidden',
  },
  barBefore: { marginLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  barAfter: { marginRight: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  more: { position: 'absolute', height: LANE_H - 2, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 10, fontWeight: '600' },
  // A fixed line box: an inline icon taller than the text would otherwise set the line height, drop the
  // label onto its baseline and clip it in the bar.
  chipText: { fontSize: 9, lineHeight: 12, includeFontPadding: false },
  // Deadlines read as outlines with dark text, distinct from the filled calendar chips.
  taskChip: { borderWidth: 0.5 },
  cancelled: { opacity: EMPHASIS.cancelled },
  struck: { textDecorationLine: 'line-through' },
  lanes: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: 4, marginTop: -6, fontSize: 9 },
  dayColumn: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: 0.5 },
  line: { position: 'absolute', left: 0, right: 0, height: 0.5 },
  event: { position: 'absolute', minHeight: 18, overflow: 'hidden', borderRadius: 4, padding: 2, borderWidth: 0.5, borderColor: '#ffffff88' },
  eventTitle: { fontSize: 10, fontWeight: '600' },
  eventMeta: { fontSize: 9, opacity: 0.85 },
  nowLine: { position: 'absolute', height: 2, marginTop: -1 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
  slotCell: { position: 'absolute', left: 0, right: 0, minHeight: 22, padding: 1 },
  slotChip: { flex: 1, marginHorizontal: 1, borderRadius: 6, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  slotChipText: { fontWeight: '600', fontSize: 13 },
});
