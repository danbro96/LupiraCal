import { compareDayEntries } from '@lupira/cal-domain/occurrences';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { isToday, monthMatrix, parseYmd, weekdayNames, ymd } from '@danbro96/lupira-domain-core/time';
import { textOn } from '@danbro96/lupira-tokens-core/contrast';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { lastDayOf } from '@lupira/cal-domain/occurrences';
import { isTaskRow } from '../../domain/taskRows';
import { useOverlappingOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { useCalendarColors } from '../hooks/palette';
import { AvailStrip, addStatus } from './AvailStrip';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';

const BAR_GLYPH = 9;
const WEEKDAYS = weekdayNames();
const orderKey = (r: CalRow) => ({ allDay: r.all_day === 1, start: Date.parse(r.start_utc) });

/** Month grid straight off the mirror: monthMatrix (domain) for the day layout, one occurrence query per
 *  touched month bucket, up to three title bars per cell. A multi-day item — and an availability range —
 *  marks every day it covers, as on the web. Day selection drives the agenda in MonthPane.
 *  `monthKey` ('yyyy-MM') rather than a Date, so the memo holds for the pages a swipe keeps. */
export const MonthView = memo(function MonthView({ monthKey, selectedDay, onSelectDay }: {
  monthKey: string;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const c = useColors();
  const anchor = parseYmd(`${monthKey}-01`);
  const weeks = monthMatrix(anchor);
  const dayKeys = weeks.flat().map(ymd);
  const { rows } = useOverlappingOccurrences(dayKeys);
  const taskRows = useTaskDeadlines(dayKeys);
  const colorOf = useCalendarColors();

  const fillOf = (r: CalRow) => colorOf(r.calendar_id, r.source);
  const byDay = new Map<string, CalRow[]>();
  const availByDay = new Map<string, (string | null)[]>();
  const merged: CalRow[] = [...rows, ...taskRows].sort((a, b) => compareDayEntries(orderKey(a), orderKey(b)));
  for (const r of merged) {
    const end = lastDayOf(r.start_day, r.end_utc, r.all_day === 1);
    for (const k of dayKeys) {
      if (k < r.start_day || k > end) continue;
      if (r.is_availability === 1) {
        addStatus(availByDay, k, r.avail_status);   // the band, never a chip
        continue;
      }
      const list = byDay.get(k) ?? [];
      list.push(r);
      byDay.set(k, list);
    }
  }

  return (
    <View style={styles.grid}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((name) => (
          <Text key={name} style={[styles.weekday, { color: c.textMuted }]}>
            {name}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((d) => {
            const key = ymd(d);
            const dayRows = byDay.get(key) ?? [];
            const inMonth = d.getMonth() === anchor.getMonth();
            const selected = key === selectedDay;
            const today = isToday(d);
            return (
              <Pressable
                key={key}
                style={[
                  styles.cell,
                  { borderColor: c.divider },
                  !inMonth && { backgroundColor: c.surface },
                  today &&{ backgroundColor: c.primary + '14' },
                  selected && [styles.cellSelected, { borderColor: c.primary }],
                ]}
                onPress={() => onSelectDay(key)}
              >
                {availByDay.has(key) && <AvailStrip statuses={availByDay.get(key) ?? []} style={styles.availStrip} />}
                <View style={[styles.dayNumBadge, today && { backgroundColor: c.primary }]}>
                  <Text
                    style={[
                      styles.dayNum,
                      { color: today ? c.onPrimary : inMonth ? c.text : c.textMuted },
                      today && styles.dayNumToday,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                {dayRows.slice(0, 3).map((r) =>
                  isTaskRow(r) ? (
                    <View
                      key={`${r.source}-${r.source_id}-${r.start_utc}`}
                      style={[
                        styles.taskBar,
                        { backgroundColor: c.surface, borderColor: c.border },
                        r.task.overdue && { borderColor: c.danger, backgroundColor: c.danger + '22' },
                      ]}
                    >
                      <Text
                        style={[styles.taskBarText, { color: r.task.overdue ? c.danger : c.textMuted }]}
                        numberOfLines={1}
                      >
                        <Glyph name={ICONS.schedule} size={BAR_GLYPH} /> {displayTitle(r.title)}
                      </Text>
                    </View>
                  ) : (
                    <View
                      key={`${r.source}-${r.source_id}-${r.start_utc}`}
                      style={[styles.bar, { backgroundColor: fillOf(r) }]}
                    >
                      <Text style={[styles.barText, { color: textOn(fillOf(r)) }]} numberOfLines={1}>
                        {r.source === 'birthday' ? <><Glyph name={ICONS.cake} size={BAR_GLYPH} /> {displayTitle(r.title)}</> : displayTitle(r.title)}
                      </Text>
                    </View>
                  ),
                )}
                {dayRows.length > 3 && <Text style={[styles.more, { color: c.textMuted }]}>+{dayRows.length - 3}</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  // Fills whatever height the parent gives: weeks flex-share it, so collapsing the day sheet
  // stretches the grid to the whole screen.
  grid: { paddingHorizontal: 2, flex: 1 },
  weekRow: { flexDirection: 'row', flex: 1 },
  weekdayRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: 2 },
  cell: { flex: 1, minHeight: 56, borderWidth: 0.5, padding: 1, gap: 1, overflow: 'hidden' },
  cellSelected: { borderWidth: 1.5 },
  availStrip: { marginBottom: 1 },
  // Today's number sits in a filled circle; other days keep the same box so numbers line up.
  dayNumBadge: { alignSelf: 'flex-start', minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 11 },
  dayNumToday: { fontWeight: '700' },
  bar: { borderRadius: 3, paddingHorizontal: 2, paddingVertical: 0.5 },
  // Fixed line box so the inline icon can't push the label down and clip it (see BAR_GLYPH).
  barText: { fontSize: 8.5, lineHeight: 11, includeFontPadding: false },
  // Deadlines read as outlines, not filled calendar bars (web parity: muted, danger when overdue).
  taskBar: { borderRadius: 3, paddingHorizontal: 2, paddingVertical: 0.5, borderWidth: 0.5 },
  taskBarText: { fontSize: 8.5, lineHeight: 11, includeFontPadding: false },
  more: { fontSize: 9, paddingLeft: 2 },
});
