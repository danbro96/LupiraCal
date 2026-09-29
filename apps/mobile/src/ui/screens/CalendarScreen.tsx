import { addDays, addMonths, fmtMonthTitle, startOfWeek, ymd } from '@lupira/cal-domain/time';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isTaskRow } from '../../domain/taskRows';
import type { CalRow } from '../../state/useOccurrences';
import type { CalendarJump } from '../calendar/jump';
import { MonthPane } from '../calendar/MonthPane';
import { useCalendarHeader } from '../calendar/useCalendarHeader';
import { WeekView } from '../calendar/WeekView';
import { BridgePrompt } from '../components/BridgePrompt';
import { SyncBanner } from '../components/SyncBanner';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

type Mode = 'month' | 'week';

const fmtShort = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Owns what the two modes share — the mode, the anchor date and jumps — and routes taps; each pane owns
 *  its own paging and selection. Month: MonthPane (grid + day sheet). Week: timed lanes with
 *  tap-to-create slots. The header is the period control (useCalendarHeader), and swiping either grid
 *  steps the period, so the grid gets the rows a toolbar would take. */
export function CalendarScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [jump, setJump] = useState<CalendarJump>({ seq: 0, toNow: false });

  // Memoized: a new Date each render would defeat WeekView's memo.
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const title = mode === 'month' ? fmtMonthTitle(anchor) : `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`;

  // Functional: two quick swipes can both land before a re-render.
  const step = useCallback((dir: 1 | -1) => {
    setAnchor((a) => (mode === 'month' ? addMonths(a, dir) : addDays(a, dir * 7)));
  }, [mode]);
  const jumpTo = useCallback((date: Date, how: { toNow?: boolean; select?: boolean }) => {
    setAnchor(date);
    setJump((j) => ({ seq: j.seq + 1, toNow: how.toNow ?? false, day: how.select ? ymd(date) : undefined }));
  }, []);

  useCalendarHeader({
    title,
    mode,
    anchor,
    onToday: useCallback(() => jumpTo(new Date(), { toNow: true }), [jumpTo]),
    onPickDate: useCallback((d: Date) => jumpTo(d, { select: true }), [jumpTo]),
    onToggleMode: useCallback(() => setMode((m) => (m === 'month' ? 'week' : 'month')), []),
  });

  const openOccurrence = useCallback((row: CalRow) => {
    // Tasks live in LupiraTasks, not the mirror — route to the read-only TaskDetail screen.
    if (isTaskRow(row)) navigation.navigate('TaskDetail', { listId: row.task.listId, itemId: row.task.itemId });
    else if (row.source === 'birthday') navigation.navigate('ContactDetail', { contactId: row.source_id });
    else navigation.navigate('ItemDetail', { itemId: row.source_id });
  }, [navigation]);
  const createSlot = useCallback((day: string, time: string) => {
    navigation.navigate('ItemEdit', { day, time });
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SyncBanner />
      <BridgePrompt />
      {mode === 'month' ? (
        <MonthPane anchor={anchor} jump={jump} onStep={step} onOpenOccurrence={openOccurrence} />
      ) : (
        <View style={styles.area}>
          <WeekView
            weekStart={weekStart}
            jump={jump}
            onStep={step}
            onPressOccurrence={openOccurrence}
            onCreateSlot={createSlot}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  area: { flex: 1, overflow: 'hidden' },
});
