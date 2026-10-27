import { isRedDay } from '@lupira/cal-domain/holidays';
import { compareDayEntries, pickShown } from '@lupira/cal-domain/occurrences';
import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { isToday, monthMatrix, parseYmd, weekdayNames, ymd } from '@danbro96/lupira-domain-core/time';
import { textOn } from '@danbro96/lupira-tokens-core/contrast';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { lastDayOf } from '@lupira/cal-domain/occurrences';
import { isTaskRow } from '../../domain/taskRows';
import { useOverlappingOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { useCalendarColors } from '../hooks/palette';
import { AvailStrip, addStatus } from './AvailStrip';
import { isTentative, tentativeStyle } from './tentative';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';

const BAR_GLYPH = 9;
const WEEKDAYS = weekdayNames();
const orderKey = (r: CalRow) => ({ allDay: r.all_day === 1, start: Date.parse(r.start_utc) });
const isProjected = (r: CalRow) => r.source === 'birthday' || r.source === 'holiday';
const isRedDayRow = (r: CalRow) => !isTaskRow(r) && isRedDay({ holiday: r.holiday_kind });

// Slot heights from the styles below: a bar's tallest form (tentative: line + dashed border) and the
// "+N" line, each with the cell's gap; the chrome is the selected border, padding and day badge.
const BAR_SLOT = 15;
const MORE_SLOT = 12;
const AVAIL_SLOT = 5;
const CELL_CHROME = 23;
const UNMEASURED_BARS = 3;

/** How many bars a cell draws: every entry when they all fit, else as many as leave room for "+N". */
function barsThatFit(cellH: number, total: number, hasAvail: boolean): number {
  const room = cellH - CELL_CHROME - (hasAvail ? AVAIL_SLOT : 0);
  return total * BAR_SLOT <= room ? total : Math.floor((room - MORE_SLOT) / BAR_SLOT);
}

/** Month grid straight off the mirror: monthMatrix (domain) for the day layout, one occurrence query per
 *  touched month bucket, as many title bars as a cell fits, birthdays left out first. A multi-day item — and an availability range —
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
  const [rowH, setRowH] = useState<number | null>(null);

  const fillOf = (r: CalRow) => colorOf(r.calendar_id, r.source, r.color);
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
        <View
          key={wi}
          style={styles.weekRow}
          onLayout={wi === 0 ? (e) => setRowH(e.nativeEvent.layout.height) : undefined}
        >
          {week.map((d) => {
            const key = ymd(d);
            const dayRows = byDay.get(key) ?? [];
            const shown = pickShown(
              dayRows,
              rowH === null ? UNMEASURED_BARS : barsThatFit(rowH, dayRows.length, availByDay.has(key)),
              isProjected,
            );
            const redDay = dayRows.some(isRedDayRow);
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
                      { color: today ? c.onPrimary : redDay ? c.danger : inMonth ? c.text : c.textMuted },
                      today && styles.dayNumToday,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
                {shown.map((r) =>
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
                      style={[styles.bar, isTentative(r.status) ? [tentativeStyle(fillOf(r)), styles.tentativeBar] : { backgroundColor: fillOf(r) }]}
                    >
                      <Text style={[styles.barText, { color: isTentative(r.status) ? c.text : textOn(fillOf(r)) }]} numberOfLines={1}>
                        {r.source === 'birthday' ? <><Glyph name={ICONS.cake} size={BAR_GLYPH} /> {displayTitle(r.title)}</>
                          : r.source === 'subscribed' ? <><Glyph name={ICONS.subscribed} size={BAR_GLYPH} /> {displayTitle(r.title)}</>
                          : r.source === 'holiday' ? <><Glyph name={ICONS.celebration} size={BAR_GLYPH} /> {displayTitle(r.title)}</>
                          : displayTitle(r.title)}
                      </Text>
                    </View>
                  ),
                )}
                {dayRows.length > shown.length && <Text style={[styles.more, { color: c.textMuted }]}>+{dayRows.length - shown.length}</Text>}
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
  tentativeBar: { paddingHorizontal: 0.5, paddingVertical: 0 },
  more: { fontSize: 9, lineHeight: 11, includeFontPadding: false, paddingLeft: 2 },
});
