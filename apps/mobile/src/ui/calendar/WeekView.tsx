import { clampToDay, layoutColumns, packLanes, type Positioned } from '@lupira/cal-domain/occurrences';
import { daysFrom, fmtTime, isToday, minutesOfDay, ymd } from '@lupira/cal-domain/time';
import { textOn } from '@lupira/cal-tokens/contrast';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from 'react-native-paper';
import Animated, {
  scrollTo, useAnimatedRef, useAnimatedStyle, useScrollOffset, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { GridRow } from '../../data/mirror';
import { isMultiDayTimed, lastDayOf } from '../../domain/occurrenceDays';
import { isTaskRow } from '../../domain/taskRows';
import { usePrefs } from '../../state/prefs-store';
import { useOverlappingOccurrences, type CalRow } from '../../state/useOccurrences';
import { usePlaceCoords } from '../../state/usePlaceLookup';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { BIRTHDAY_COLOR, availabilityColor, useCalendarColors } from '../hooks/palette';
import { useBackDismiss } from '../hooks/useBackDismiss';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

const MIN_HOUR_H = 16;
const MAX_HOUR_H = 160;
const DAY_MIN = 24 * 60;
const pct = (min: number) => `${(min / DAY_MIN) * 100}%` as const;
const colPct = (col: number) => `${(col / 7) * 100}%` as const;

const slotTime = (slot: number) => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
const DEFAULT_END_MIN = 30;   // open-ended timed occurrences render as a half-hour block
const LEAD_HOURS = 2;         // "now" opens this far below the top of the lanes
const LANE_H = 17;
const MAX_LANES = 2;          // collapsed strip height; with more lanes the last row becomes "+N" per day

const hoursBeforeNow = () => Math.max(0, minutesOfDay(new Date()) / 60 - LEAD_HOURS);

type Bar = { row: CalRow; startCol: number; endCol: number; before: boolean; after: boolean };

/** Week grid: a strip of day-spanning bars on top (all-day items, deadlines, and timed items of a day or
 *  more), timed lanes below. Placement is the domain's clampToDay + layoutColumns (the same math the web
 *  grid uses) and packLanes for the strip; data is the mirror's rows overlapping the 7 days.
 *  `slide` is the period swipe's offset — the day columns ride it, the hour gutter stays put.
 *  `focusNow` bumps when Today is tapped, scrolling the current time back into view. */
export const WeekView = memo(function WeekView({ weekStart, slide, focusNow, onPressOccurrence, onCreateSlot }: {
  weekStart: Date;
  slide: SharedValue<number>;
  focusNow: number;
  onPressOccurrence: (row: CalRow) => void;
  onCreateSlot: (day: string, time: string) => void;
}) {
  // First tap on an empty lane drops a ＋ chip on that hour; tapping the chip opens the prefilled editor.
  // Slot granularity is 30 min; the ＋ chip covers the tapped half hour (prefill length stays 1h).
  const c = useColors();
  const [pendingSlot, setPendingSlot] = useState<{ day: string; slot: number } | null>(null);
  const clearSlot = useCallback(() => setPendingSlot(null), []);
  useBackDismiss(pendingSlot !== null, clearSlot);
  const days = daysFrom(weekStart, 7);
  const dayKeys = days.map(ymd);
  const { rows } = useOverlappingOccurrences(dayKeys);
  const taskRows = useTaskDeadlines(dayKeys);
  const colorOf = useCalendarColors();
  const [initialHours] = useState(() => (dayKeys.includes(ymd(new Date())) ? hoursBeforeNow() : 7.5));
  const zoom = useTimeZoom(initialHours);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  const lastFocus = useRef(focusNow);
  const { scrollToHours } = zoom;
  useEffect(() => {
    if (focusNow === lastFocus.current) return;
    lastFocus.current = focusNow;
    scrollToHours(hoursBeforeNow());
  }, [focusNow, scrollToHours]);

  const first = dayKeys[0];
  const last = dayKeys[6];
  const colOf = (day: string) => (day <= first ? 0 : day >= last ? 6 : dayKeys.indexOf(day));
  const bars: Bar[] = [];
  const timed: GridRow[] = [];
  const availByDay = new Map<string, string | null>();
  for (const r of [...rows, ...taskRows]) {
    const end = lastDayOf(r);
    if (r.is_availability === 1) {
      // Renders as the column tint, never a chip.
      for (const k of dayKeys) if (k >= r.start_day && k <= end) availByDay.set(k, r.avail_status);
      continue;
    }
    if (r.all_day === 1 || isMultiDayTimed(r)) {
      bars.push({ row: r, startCol: colOf(r.start_day), endCol: colOf(end), before: r.start_day < first, after: end > last });
    } else {
      timed.push(r as GridRow);
    }
  }
  const places = usePlaceCoords(timed.map((r) => r.place_id));
  const rowColor = (r: CalRow) => (r.source === 'birthday' ? BIRTHDAY_COLOR : colorOf(r.calendar_id));

  return (
    <View style={styles.root}>
      <View style={[styles.headerRow, { borderColor: c.divider }]}>
        <SlidingDays slideStyle={slideStyle}>
          {days.map((d) => (
            <View key={ymd(d)} style={styles.dayHeader}>
              <Text style={[styles.dayHeaderText, { color: isToday(d) ? c.primary : c.textMuted }, isToday(d) && styles.today]}>
                {d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)} {d.getDate()}
              </Text>
            </View>
          ))}
        </SlidingDays>
      </View>

      <AllDayStrip bars={bars} slideStyle={slideStyle} rowColor={rowColor} onPress={onPressOccurrence} />

      <GestureDetector gesture={zoom.pinch}>
        <View style={styles.viewport} onLayout={zoom.onViewportLayout}>
          <GestureDetector gesture={zoom.scroll}>
            <Animated.ScrollView ref={zoom.scrollRef} contentOffset={zoom.initialOffset}>
              <Animated.View style={[styles.lanes, zoom.lanesStyle]}>
                <SlidingDays
                  slideStyle={slideStyle}
                  gutter={Array.from({ length: 24 }, (_, h) => (
                    <Text key={h} style={[styles.hourLabel, { top: pct(h * 60), color: c.textMuted }]}>
                      {String(h).padStart(2, '0')}
                    </Text>
                  ))}
                >
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    {Array.from({ length: 48 }, (_, i) => (
                      <View key={i} style={[styles.line, { top: pct(i * 30), backgroundColor: i % 2 ? c.surface : c.divider }]} />
                    ))}
                  </View>
                  {days.map((day) => {
                    const dayKey = ymd(day);
                    const spans = timed.flatMap((r) => {
                      const start = new Date(r.start_utc);
                      const end = r.end_utc ? new Date(r.end_utc) : new Date(start.getTime() + DEFAULT_END_MIN * 60_000);
                      const span = clampToDay(start, end, day);
                      return span ? [{ ...span, item: r }] : [];
                    });
                    const slot = pendingSlot?.day === dayKey ? pendingSlot.slot : null;
                    return (
                      <Pressable
                        key={dayKey}
                        style={[
                          styles.dayColumn,
                          { borderColor: c.divider },
                          availByDay.has(dayKey) && { backgroundColor: `${availabilityColor(availByDay.get(dayKey) ?? null)}14` },
                        ]}
                        onPress={(e) => {
                          const tapped = Math.max(0, Math.min(47, Math.floor(e.nativeEvent.locationY / (zoom.hourH.value / 2))));
                          setPendingSlot((cur) => (cur && cur.day === dayKey && cur.slot === tapped ? null : { day: dayKey, slot: tapped }));
                        }}
                      >
                        {slot !== null && (
                          <View style={[styles.slotCell, { top: pct(slot * 30), height: pct(30) }]}>
                            <Pressable
                              style={[styles.slotChip, { borderColor: c.primary, backgroundColor: c.primary + '22' }]}
                              onPress={() => {
                                onCreateSlot(dayKey, slotTime(slot));
                                setPendingSlot(null);
                              }}
                            >
                              <Text style={[styles.slotChipText, { color: c.primary }]} numberOfLines={1}>＋ {slotTime(slot)}</Text>
                            </Pressable>
                          </View>
                        )}
                        {layoutColumns(spans, 30).map((p) => (
                          <EventBlock
                            key={`${p.item.source_id}-${p.item.start_utc}`}
                            placed={p}
                            color={rowColor(p.item)}
                            placeName={p.item.place_id ? places.get(p.item.place_id)?.name : undefined}
                            onPress={onPressOccurrence}
                          />
                        ))}
                      </Pressable>
                    );
                  })}
                  <NowLine dayKeys={dayKeys} />
                </SlidingDays>
              </Animated.View>
            </Animated.ScrollView>
          </GestureDetector>
        </View>
      </GestureDetector>
    </View>
  );
});

/** Title first, then start time and place: a short block clips to its title, and the rest appears as the
 *  block grows — including live, mid-pinch, without a re-render. */
function EventBlock({ placed, color, placeName, onPress }: {
  placed: Positioned<GridRow>;
  color: string;
  placeName: string | undefined;
  onPress: (row: CalRow) => void;
}) {
  const { item } = placed;
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
      <Text style={[styles.eventTitle, { color: fg }, cancelled && styles.struck]} numberOfLines={2}>{item.title ?? '(untitled)'}</Text>
      <Text style={[styles.eventMeta, { color: fg }]} numberOfLines={1}>{fmtTime(new Date(item.start_utc))}</Text>
      {placeName ? <Text style={[styles.eventMeta, { color: fg }]} numberOfLines={1}>{placeName}</Text> : null}
    </Pressable>
  );
}

/** Bars packed into lanes. Past MAX_LANES it collapses: the last visible row counts, per day, what is
 *  hidden, and tapping a count or the gutter chevron shows every lane. */
function AllDayStrip({ bars, slideStyle, rowColor, onPress }: {
  bars: Bar[];
  slideStyle: ReturnType<typeof useAnimatedStyle>;
  rowColor: (r: CalRow) => string;
  onPress: (row: CalRow) => void;
}) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  const laned = packLanes(bars);
  const laneCount = laned.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  if (laneCount === 0) return null;
  const collapsed = laneCount > MAX_LANES && !expanded;
  const shown = collapsed ? MAX_LANES - 1 : laneCount;
  const hidden = Array.from({ length: 7 }, () => 0);
  if (collapsed) {
    for (const b of laned) if (b.lane >= shown) for (let col = b.startCol; col <= b.endCol; col++) hidden[col]++;
  }

  return (
    <View style={[styles.allDayRow, { borderColor: c.divider, height: (collapsed ? MAX_LANES : laneCount) * LANE_H + 2 }]}>
      <SlidingDays
        slideStyle={slideStyle}
        gutter={laneCount > MAX_LANES && (
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
        {laned.filter((b) => b.lane < shown).map((b) => {
          const r = b.row;
          const task = isTaskRow(r) ? r.task : null;
          const fill = task ? null : rowColor(r);
          const cancelled = r.status === 'Cancelled';
          return (
            <Pressable
              key={`${r.source}-${r.source_id}-${r.start_utc}`}
              style={[
                styles.bar,
                { top: b.lane * LANE_H + 1, left: colPct(b.startCol), width: colPct(b.endCol - b.startCol + 1) },
                b.before && styles.barBefore,
                b.after && styles.barAfter,
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
                {task ? <><Glyph name={ICONS.schedule} /> {r.title ?? ''}</> : r.source === 'birthday' ? <><Glyph name={ICONS.cake} /> {r.title ?? ''}</> : (r.title ?? '(untitled)')}
              </Text>
            </Pressable>
          );
        })}
        {hidden.map((n, col) => n > 0 && (
          <Pressable
            key={`more-${col}`}
            style={[styles.more, { top: shown * LANE_H + 1, left: colPct(col), width: colPct(1) }]}
            onPress={() => setExpanded(true)}
            accessibilityLabel={`${n} more`}
          >
            <Text style={[styles.moreText, { color: c.textMuted }]}>+{n}</Text>
          </Pressable>
        ))}
      </SlidingDays>
    </View>
  );
}

/** The current-time rule across today's column; ticks on its own, so the grid doesn't re-render for it. */
function NowLine({ dayKeys }: { dayKeys: string[] }) {
  const c = useColors();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const col = dayKeys.indexOf(ymd(now));
  if (col < 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.nowLine, { top: pct(minutesOfDay(now)), left: colPct(col), width: colPct(1), backgroundColor: c.danger }]}
    >
      <View style={[styles.nowDot, { backgroundColor: c.danger }]} />
    </View>
  );
}

/** A fixed hour gutter beside a clipped strip of day columns that rides the swipe offset. */
function SlidingDays({ slideStyle, gutter, children }: {
  slideStyle: ReturnType<typeof useAnimatedStyle>;
  gutter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <View style={styles.gutter}>{gutter}</View>
      <View style={styles.clip}>
        <Animated.View style={[styles.days, slideStyle]}>{children}</Animated.View>
      </View>
    </>
  );
}

/** Pinch zoom on the time axis, anchored on the fingers: the time under the focal point stays under it.
 *  Everything in the lanes is placed in percent of the day, so a zoom frame animates one height on the
 *  UI thread instead of re-rendering the grid. */
function useTimeZoom(initialHours: number) {
  const savedHourH = usePrefs((p) => p.hourHeight);
  const [initialOffset] = useState(() => ({ x: 0, y: initialHours * savedHourH }));
  const hourH = useSharedValue(savedHourH);
  useEffect(() => {
    hourH.value = savedHourH;
  }, [hourH, savedHourH]);
  const viewportH = useSharedValue(0);
  const startH = useSharedValue(0);
  const anchorHours = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);

  const [gestures] = useState(() => {
    const save = (value: number) => void usePrefs.getState().setHourHeight(value);
    const pinch = Gesture.Pinch()
      .onStart((e) => {
        startH.value = hourH.value;
        anchorHours.value = (scrollY.value + e.focalY) / hourH.value;
      })
      .onUpdate((e) => {
        // Zoomed all the way out, the whole day fits the viewport — never smaller.
        const minH = Math.max(MIN_HOUR_H, viewportH.value / 24);
        const next = Math.min(MAX_HOUR_H, Math.max(minH, startH.value * e.scale));
        hourH.value = next;
        scrollTo(scrollRef, 0, Math.max(0, anchorHours.value * next - e.focalY), false);
      })
      .onEnd(() => {
        scheduleOnRN(save, Math.round(hourH.value * 10) / 10);
      });
    // The ScrollView joins RNGH's arbitration, so a pinch cancels its scroll and a vertical drag fails the swipe.
    return { pinch, scroll: Gesture.Native() };
  });

  const lanesStyle = useAnimatedStyle(() => ({ height: 24 * hourH.value }));
  const scrollToHours = useCallback((hours: number) => {
    scrollRef.current?.scrollTo({ y: hours * hourH.value, animated: true });
  }, [scrollRef, hourH]);
  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    viewportH.value = e.nativeEvent.layout.height;
  }, [viewportH]);

  return { ...gestures, hourH, scrollRef, initialOffset, lanesStyle, scrollToHours, onViewportLayout };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  gutter: { width: 34 },
  clip: { flex: 1, overflow: 'hidden' },
  days: { flex: 1, flexDirection: 'row' },
  viewport: { flex: 1 },
  dayHeader: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dayHeaderText: { fontSize: 12 },
  today: { fontWeight: '700' },
  allDayRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  stripToggle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute', height: LANE_H - 2, marginHorizontal: 1, paddingHorizontal: 3,
    borderRadius: 3, justifyContent: 'center', overflow: 'hidden',
  },
  barBefore: { marginLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  barAfter: { marginRight: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  more: { position: 'absolute', height: LANE_H - 2, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 10, fontWeight: '600' },
  chipText: { fontSize: 9 },
  // Deadlines read as outlines with dark text, distinct from the filled calendar chips.
  taskChip: { borderWidth: 0.5 },
  cancelled: { opacity: 0.5 },
  struck: { textDecorationLine: 'line-through' },
  lanes: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: 4, marginTop: -6, fontSize: 9 },
  dayColumn: { flex: 1, borderLeftWidth: 0.5 },
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
