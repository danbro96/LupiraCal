import { isToday, monthMatrix, parseYmd, ymd } from '@lupira/cal-domain/time';
import { textOn } from '@lupira/cal-tokens/contrast';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { isTaskRow } from '../../domain/taskRows';
import { useDaysOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { BIRTHDAY_COLOR, availabilityColor, useCalendarColors } from '../hooks/palette';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

/** Month grid straight off the mirror: monthMatrix (domain) for the day layout, one occurrence query per
 *  touched month bucket, up to three title bars per cell. Day selection drives the agenda in MonthPane.
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
  const { rows } = useDaysOccurrences(dayKeys);
  const taskRows = useTaskDeadlines(dayKeys);
  const colorOf = useCalendarColors();

  const fillOf = (r: CalRow) => (r.source === 'birthday' ? BIRTHDAY_COLOR : colorOf(r.calendar_id));
  const byDay = new Map<string, CalRow[]>();
  const availByDay = new Map<string, string | null>();
  const merged: CalRow[] = [...rows, ...taskRows].sort((a, b) => (a.start_utc < b.start_utc ? -1 : a.start_utc > b.start_utc ? 1 : 0));
  for (const r of merged) {
    if (r.is_availability === 1) {
      availByDay.set(r.start_day, r.avail_status);   // the band, never a chip
      continue;
    }
    const list = byDay.get(r.start_day) ?? [];
    list.push(r);
    byDay.set(r.start_day, list);
  }

  return (
    <View style={styles.grid}>
      <View style={styles.weekdayRow}>
        {weeks[0].map((d) => (
          <Text key={ymd(d)} style={[styles.weekday, { color: c.textMuted }]}>
            {d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
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
            return (
              <Pressable
                key={key}
                style={[styles.cell, { borderColor: c.divider }, selected && [styles.cellSelected, { borderColor: c.primary }]]}
                onPress={() => onSelectDay(key)}
              >
                {availByDay.has(key) && (
                  <View style={[styles.availStrip, { backgroundColor: availabilityColor(availByDay.get(key) ?? null) }]} />
                )}
                <Text
                  style={[
                    styles.dayNum,
                    { color: isToday(d) ? c.primary : inMonth ? c.text : c.textMuted },
                    isToday(d) && styles.dayNumToday,
                  ]}
                >
                  {d.getDate()}
                </Text>
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
                        <Glyph name={ICONS.schedule} size={11} /> {r.title ?? '(untitled)'}
                      </Text>
                    </View>
                  ) : (
                    <View
                      key={`${r.source}-${r.source_id}-${r.start_utc}`}
                      style={[styles.bar, { backgroundColor: fillOf(r) }]}
                    >
                      <Text style={[styles.barText, { color: textOn(fillOf(r)) }]} numberOfLines={1}>
                        {r.source === 'birthday' ? <><Glyph name={ICONS.cake} size={11} /> {r.title ?? ''}</> : (r.title ?? '(untitled)')}
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
  availStrip: { height: 3, borderRadius: 2, marginBottom: 1 },
  dayNum: { fontSize: 11, paddingLeft: 2 },
  dayNumToday: { fontWeight: '700' },
  bar: { borderRadius: 3, paddingHorizontal: 2, paddingVertical: 0.5 },
  barText: { fontSize: 8.5 },
  // Deadlines read as outlines, not filled calendar bars (web parity: muted, danger when overdue).
  taskBar: { borderRadius: 3, paddingHorizontal: 2, paddingVertical: 0.5, borderWidth: 0.5 },
  taskBarText: { fontSize: 8.5 },
  more: { fontSize: 9, paddingLeft: 2 },
});
