import { clampToDay, layoutColumns } from '@lupira/cal-domain/occurrences';
import { daysFrom, isToday, ymd } from '@lupira/cal-domain/time';
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from 'react-native-paper';
import Animated, {
  scrollTo, useAnimatedRef, useAnimatedStyle, useScrollOffset, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { GridRow } from '../../data/mirror';
import { isTaskRow } from '../../domain/taskRows';
import { usePrefs } from '../../state/prefs-store';
import { useDaysOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { BIRTHDAY_COLOR, availabilityColor, useCalendarColors } from '../hooks/palette';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

const MIN_HOUR_H = 16;
const MAX_HOUR_H = 160;
const DAY_MIN = 24 * 60;
const pct = (min: number) => `${(min / DAY_MIN) * 100}%` as const;

const slotTime = (slot: number) => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
const DEFAULT_END_MIN = 30;   // open-ended timed occurrences render as a half-hour block

/** Week grid: all-day chips on top, timed lanes below. Placement is the domain's clampToDay + layoutColumns
 *  (the same math the web grid uses); data is the mirror's occurrence rows for the 7 day buckets.
 *  `slide` is the period swipe's offset — the day columns ride it, the hour gutter stays put. */
export const WeekView = memo(function WeekView({ weekStart, slide, onPressOccurrence, onCreateSlot }: {
  weekStart: Date;
  slide: SharedValue<number>;
  onPressOccurrence: (row: CalRow) => void;
  onCreateSlot: (day: string, time: string) => void;
}) {
  // First tap on an empty lane drops a ＋ chip on that hour; tapping the chip opens the prefilled editor.
  // Slot granularity is 30 min; the ＋ chip covers the tapped half hour (prefill length stays 1h).
  const c = useColors();
  const [pendingSlot, setPendingSlot] = useState<{ day: string; slot: number } | null>(null);
  const days = daysFrom(weekStart, 7);
  const dayKeys = days.map(ymd);
  const { rows } = useDaysOccurrences(dayKeys);
  const taskRows = useTaskDeadlines(dayKeys);
  const colorOf = useCalendarColors();
  const zoom = useTimeZoom();
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  // Task rows are always all_day, so they land in the all-day strip; timed lanes stay mirror-only.
  const allDayByDay = new Map<string, CalRow[]>();
  const timedByDay = new Map<string, GridRow[]>();
  const availByDay = new Map<string, string | null>();
  for (const r of [...rows, ...taskRows]) {
    if (r.is_availability === 1) {
      availByDay.set(r.start_day, r.avail_status);   // renders as the column tint, never a chip
      continue;
    }
    if (r.all_day === 1) {
      const list = allDayByDay.get(r.start_day) ?? [];
      list.push(r);
      allDayByDay.set(r.start_day, list);
    } else {
      const list = timedByDay.get(r.start_day) ?? [];
      list.push(r as GridRow);
      timedByDay.set(r.start_day, list);
    }
  }
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

      {allDayByDay.size > 0 && (
        <View style={[styles.allDayRow, { borderColor: c.divider }]}>
          <SlidingDays slideStyle={slideStyle}>
            {days.map((d) => (
              <View key={ymd(d)} style={styles.allDayCell}>
                {(allDayByDay.get(ymd(d)) ?? []).map((r) => (
                  <Pressable
                    key={`${r.source}-${r.source_id}-${r.start_utc}`}
                    style={[
                      styles.allDayChip,
                      isTaskRow(r)
                        ? [
                            styles.taskChip,
                            { backgroundColor: c.surface, borderColor: c.border },
                            r.task.overdue && { borderColor: c.danger, backgroundColor: c.danger + '22' },
                          ]
                        : { backgroundColor: rowColor(r) },
                    ]}
                    onPress={() => onPressOccurrence(r)}
                  >
                    <Text
                      style={[styles.chipText, isTaskRow(r) && { color: r.task.overdue ? c.danger : c.textMuted }]}
                      numberOfLines={1}
                    >
                      {isTaskRow(r) ? <><Glyph name={ICONS.schedule} /> {r.title ?? ''}</> : r.source === 'birthday' ? <><Glyph name={ICONS.cake} /> {r.title ?? ''}</> : (r.title ?? '(untitled)')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </SlidingDays>
        </View>
      )}

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
                    const spans = (timedByDay.get(dayKey) ?? []).flatMap((r) => {
                      const start = new Date(r.start_utc);
                      const end = r.end_utc ? new Date(r.end_utc) : new Date(start.getTime() + DEFAULT_END_MIN * 60_000);
                      const span = clampToDay(start, end, day);
                      return span ? [{ ...span, item: r }] : [];
                    });
                    const placed = layoutColumns(spans, 30);
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
                        {placed.map((p) => (
                          <Pressable
                            key={`${p.item.source_id}-${p.item.start_utc}`}
                            style={[styles.event, {
                              top: pct(p.startMin),
                              height: pct(p.endMin - p.startMin),
                              left: `${(p.col / p.cols) * 100}%`,
                              width: `${(1 / p.cols) * 100}%`,
                              backgroundColor: rowColor(p.item),
                            }]}
                            onPress={() => onPressOccurrence(p.item)}
                          >
                            <Text style={styles.chipText} numberOfLines={2}>{p.item.title ?? '(untitled)'}</Text>
                          </Pressable>
                        ))}
                      </Pressable>
                    );
                  })}
                </SlidingDays>
              </Animated.View>
            </Animated.ScrollView>
          </GestureDetector>
        </View>
      </GestureDetector>
    </View>
  );
});

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
function useTimeZoom() {
  const savedHourH = usePrefs((p) => p.hourHeight);
  const [initialOffset] = useState(() => ({ x: 0, y: 7.5 * savedHourH }));
  const hourH = useSharedValue(savedHourH);
  useEffect(() => {
    hourH.value = savedHourH;
  }, [hourH, savedHourH]);
  const viewportH = useSharedValue(0);
  const startH = useSharedValue(0);
  const anchorHours = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);

  const gestures = useMemo(() => {
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
  }, [hourH, startH, anchorHours, scrollRef, scrollY, viewportH]);

  const lanesStyle = useAnimatedStyle(() => ({ height: 24 * hourH.value }));

  return {
    ...gestures,
    hourH,
    scrollRef,
    initialOffset,
    lanesStyle,
    onViewportLayout: (e: { nativeEvent: { layout: { height: number } } }) => {
      viewportH.value = e.nativeEvent.layout.height;
    },
  };
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
  allDayRow: { flexDirection: 'row', borderBottomWidth: 0.5, paddingVertical: 1 },
  allDayCell: { flex: 1, gap: 1, paddingHorizontal: 0.5 },
  allDayChip: { borderRadius: 3, paddingHorizontal: 2, paddingVertical: 1 },
  chipText: { fontSize: 9, color: '#fff' },
  // Deadlines read as outlines with dark text, distinct from the white-on-color calendar chips.
  taskChip: { borderWidth: 0.5 },
  lanes: { flexDirection: 'row' },
  hourLabel: { position: 'absolute', right: 4, marginTop: -6, fontSize: 9 },
  dayColumn: { flex: 1, borderLeftWidth: 0.5 },
  line: { position: 'absolute', left: 0, right: 0, height: 0.5 },
  event: { position: 'absolute', minHeight: 18, overflow: 'hidden', borderRadius: 4, padding: 2, borderWidth: 0.5, borderColor: '#ffffff88' },
  slotCell: { position: 'absolute', left: 0, right: 0, minHeight: 22, padding: 1 },
  slotChip: { flex: 1, marginHorizontal: 1, borderRadius: 6, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  slotChipText: { fontWeight: '600', fontSize: 13 },
});
