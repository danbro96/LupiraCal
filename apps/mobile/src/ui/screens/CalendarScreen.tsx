import { addDays, addMonths, fmtMonthTitle, fmtTime, parseYmd, startOfWeek } from '@lupira/cal-domain/time';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, FAB, IconButton, Text } from 'react-native-paper';
import { isTaskRow } from '../../domain/taskRows';
import { useDaysOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { SwipeHint } from '../calendar/SwipeHint';
import { useHorizontalSwipe } from '../calendar/useHorizontalSwipe';
import { MonthView } from '../calendar/MonthView';
import { WeekView } from '../calendar/WeekView';
import { BridgePrompt } from '../components/BridgePrompt';
import { BIRTHDAY_COLOR, availabilityColor, useCalendarColors } from '../hooks/palette';
import { ScreenToolbar } from '../components/ScreenToolbar';
import { SyncBanner } from '../components/SyncBanner';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

type Mode = 'month' | 'week';

/** Month mode: the grid flex-fills the screen; selecting a day slides up a draggable agenda sheet
 *  (snap points ≈ 38% / 78%, drag below ~20% deselects). Changing month or jumping to today clears
 *  the selection. Week mode: timed lanes with tap-to-create slots. */
export function CalendarScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const containerH = useRef(0);
  const sheetH = useRef(new Animated.Value(0)).current;
  const sheetCommitted = useRef(0);

  const animateSheet = useCallback((to: number) => {
    sheetCommitted.current = to;
    Animated.spring(sheetH, { toValue: to, useNativeDriver: false, bounciness: 2, speed: 18 }).start();
  }, [sheetH]);

  const deselect = useCallback(() => {
    setSelectedDay(null);
    animateSheet(0);
  }, [animateSheet]);

  const selectDay = useCallback((day: string) => {
    setSelectedDay(day);
    const d = parseYmd(day);
    setAnchor((a) => (d.getMonth() !== a.getMonth() ? d : a));
    if (sheetCommitted.current < containerH.current * 0.3) animateSheet(containerH.current * 0.38);
  }, [animateSheet]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        const h = Math.max(0, Math.min(containerH.current * 0.85, sheetCommitted.current - g.dy));
        sheetH.setValue(h);
      },
      onPanResponderRelease: (_, g) => {
        const target = sheetCommitted.current - g.dy;
        const H = containerH.current;
        if (target < H * 0.2) deselect();
        else animateSheet(target > H * 0.58 ? H * 0.78 : H * 0.38);
      },
    }),
  ).current;

  // Memoized: a new Date each render would defeat WeekView's memo.
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const title = mode === 'month'
    ? fmtMonthTitle(anchor)
    : `${weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  const step = (dir: 1 | -1) => {
    setAnchor(mode === 'month' ? addMonths(anchor, dir) : addDays(anchor, dir * 7));
    if (mode === 'month') deselect();
  };
  const goToday = () => {
    setAnchor(new Date());
    deselect();
  };
  // Swipe left/right = next/previous month or week (handlers stay fresh inside the hook).
  const swipe = useHorizontalSwipe(() => step(1), () => step(-1));
  const periodLabel = (dir: 1 | -1) => {
    if (mode === 'month') return fmtMonthTitle(addMonths(anchor, dir));
    const start = startOfWeek(addDays(anchor, dir * 7));
    return `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}–${addDays(start, 6).getDate()}`;
  };
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
      <ScreenToolbar>
        <IconButton icon={ICONS.chevronLeft} iconColor={c.primary} style={styles.nav} onPress={() => step(-1)} hitSlop={8} />
        <Text style={styles.period}>{title}</Text>
        <IconButton icon={ICONS.chevronRight} iconColor={c.primary} style={styles.nav} onPress={() => step(1)} hitSlop={8} />
        <Button mode="outlined" compact onPress={goToday}>
          Today
        </Button>
        <Button mode="outlined" compact onPress={() => setMode(mode === 'month' ? 'week' : 'month')}>
          {mode === 'month' ? 'Week' : 'Month'}
        </Button>
      </ScreenToolbar>

      {mode === 'month' ? (
        <View
          style={styles.monthArea}
          onLayout={(e) => {
            containerH.current = e.nativeEvent.layout.height;
          }}
          {...swipe.panHandlers}
        >
          <MonthView anchor={anchor} selectedDay={selectedDay} onSelectDay={selectDay} />
          <SwipeHint hint={swipe.hint} prevLabel={periodLabel(-1)} nextLabel={periodLabel(1)} />
          {selectedDay && (
            <Animated.View style={[styles.sheet, { height: sheetH, backgroundColor: c.surface, borderColor: c.divider }]}>
              <View style={styles.sheetHeader} {...pan.panHandlers}>
                <View style={[styles.handle, { backgroundColor: c.divider }]} />
                <View style={styles.sheetHeaderRow}>
                  <Text style={styles.sheetTitle}>
                    {parseYmd(selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  <View style={styles.sheetActions}>
                    <Pressable onPress={() => navigation.navigate('AvailabilityEdit', { day: selectedDay })} hitSlop={6}>
                      <Text style={[styles.sheetLink, { color: c.primary }]}>Availability</Text>
                    </Pressable>
                    <FAB size="small" icon={ICONS.add} onPress={() => navigation.navigate('ItemEdit', { day: selectedDay })} />
                  </View>
                </View>
              </View>
              <ScrollView>
                <DayAgendaList day={selectedDay} onPress={openOccurrence} />
              </ScrollView>
            </Animated.View>
          )}
        </View>
      ) : (
        <View style={styles.monthArea} {...swipe.panHandlers}>
          <WeekView weekStart={weekStart} onPressOccurrence={openOccurrence} onCreateSlot={createSlot} />
          <SwipeHint hint={swipe.hint} prevLabel={periodLabel(-1)} nextLabel={periodLabel(1)} />
        </View>
      )}
    </View>
  );
}

function DayAgendaList({ day, onPress }: { day: string; onPress: (row: CalRow) => void }) {
  const c = useColors();
  const { rows } = useDaysOccurrences([day]);
  const taskRows = useTaskDeadlines([day]);
  const colorOf = useCalendarColors();
  const sorted: CalRow[] = [...rows, ...taskRows].sort((a, b) => b.all_day - a.all_day || (a.start_utc < b.start_utc ? -1 : 1));

  return (
    <View style={styles.agenda}>
      {sorted.length === 0 && <Text style={[styles.agendaEmpty, { color: c.textMuted }]}>Nothing scheduled</Text>}
      {sorted.map((r) => (
        r.is_availability === 1 ? (
          <Pressable key={`${r.source}-${r.source_id}-${r.start_utc}`} style={styles.agendaRow} onPress={() => onPress(r)}>
            <Chip
              compact
              style={{ backgroundColor: availabilityColor(r.avail_status) }}
              textStyle={styles.availPillText}
            >
              {r.avail_status ?? 'Availability'}
            </Chip>
          </Pressable>
        ) : (
        <Pressable key={`${r.source}-${r.source_id}-${r.start_utc}`} style={styles.agendaRow} onPress={() => onPress(r)}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isTaskRow(r) ? (r.task.overdue ? c.danger : '#64748b') : r.source === 'birthday' ? BIRTHDAY_COLOR : colorOf(r.calendar_id) },
            ]}
          />
          <Text style={[styles.agendaTime, { color: c.textMuted }]}>
            {isTaskRow(r) ? <Glyph name={ICONS.schedule} /> : r.source === 'birthday' ? <Glyph name={ICONS.cake} /> : r.all_day === 1 ? 'all day' : fmtTime(new Date(r.start_utc))}
          </Text>
          <Text style={styles.agendaText} numberOfLines={1}>{r.title ?? '(untitled)'}</Text>
          {isTaskRow(r) && r.task.overdue && <Text style={[styles.cancelled, { color: c.danger }]}>overdue</Text>}
          {r.status === 'Cancelled' && <Text style={[styles.cancelled, { color: c.danger }]}>cancelled</Text>}
        </Pressable>
        )
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { margin: 0 },
  period: { flexGrow: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  monthArea: { flex: 1 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 0.5,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 }, elevation: 8,
  },
  sheetHeader: { paddingTop: 6, paddingBottom: 4, paddingHorizontal: 14 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 14, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetLink: { fontSize: 13, fontWeight: '600' },
  availPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  agenda: { paddingHorizontal: 14, paddingBottom: 24, gap: 2 },
  agendaEmpty: { fontSize: 13, paddingVertical: 8 },
  agendaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  agendaTime: { width: 52, fontSize: 12 },
  agendaText: { flex: 1, fontSize: 14 },
  cancelled: { fontSize: 11 },
});
