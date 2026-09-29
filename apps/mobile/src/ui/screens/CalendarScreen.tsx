import { addDays, addMonths, fmtMonthTitle, fmtTime, parseYmd, startOfMonth, startOfWeek, ymd } from '@lupira/cal-domain/time';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Chip, FAB, Text } from 'react-native-paper';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { isTaskRow } from '../../domain/taskRows';
import { useDaysOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { usePeriodSwipe } from '../calendar/usePeriodSwipe';
import { MonthView } from '../calendar/MonthView';
import { WeekView } from '../calendar/WeekView';
import { BridgePrompt } from '../components/BridgePrompt';
import { IconButton } from '../components/IconButton';
import { SettingsButton } from '../components/SettingsButton';
import { BIRTHDAY_COLOR, availabilityColor, useCalendarColors } from '../hooks/palette';
import { SyncBanner } from '../components/SyncBanner';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useColors } from '../theme';
import { ICONS } from '../icons';
import { Glyph } from '../components/Glyph';

type Mode = 'month' | 'week';
type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList, 'Calendar'>, NativeStackNavigationProp<RootStackParamList>>;

const fmtShort = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Month mode: the grid flex-fills the screen; selecting a day slides up a draggable agenda sheet
 *  (snap points ≈ 38% / 78%, drag below ~20% deselects). Changing month or jumping to today clears
 *  the selection. Week mode: timed lanes with tap-to-create slots.
 *  Period controls live in the native header — the title opens a date picker, and swiping the grid
 *  steps the period — so the grid gets the rows a toolbar would take. */
export function CalendarScreen() {
  const c = useColors();
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [focusNow, setFocusNow] = useState(0);

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
  const title = mode === 'month' ? fmtMonthTitle(anchor) : `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`;

  const step = (dir: 1 | -1) => {
    setAnchor(mode === 'month' ? addMonths(anchor, dir) : addDays(anchor, dir * 7));
    if (mode === 'month') deselect();
  };
  const swipe = usePeriodSwipe(step, `${mode}:${ymd(mode === 'month' ? startOfMonth(anchor) : weekStart)}`);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipe.offset.value }] }));
  const measureSwipe = (e: { nativeEvent: { layout: { width: number } } }) => {
    swipe.width.value = e.nativeEvent.layout.width;
  };

  useLayoutEffect(() => {
    const goToday = () => {
      setAnchor(new Date());
      setFocusNow((n) => n + 1);
      deselect();
    };
    const pickDate = () => DateTimePickerAndroid.open({
      value: selectedDay ? parseYmd(selectedDay) : anchor,
      mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        setAnchor(d);
        if (mode === 'month') selectDay(ymd(d));
      },
    });
    navigation.setOptions({
      headerTitle: () => (
        <Pressable style={styles.titleButton} onPress={pickDate} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${title}, pick a date`}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
          <Text style={{ color: c.textMuted }}><Glyph name={ICONS.dropDown} size={22} /></Text>
        </Pressable>
      ),
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton name={ICONS.search} accessibilityLabel="Search events" onPress={() => navigation.navigate('ItemSearch')} />
          <IconButton name={ICONS.today} accessibilityLabel="Today" onPress={goToday} />
          <IconButton
            name={mode === 'month' ? ICONS.viewWeek : ICONS.viewMonth}
            accessibilityLabel={mode === 'month' ? 'Week view' : 'Month view'}
            onPress={() => setMode(mode === 'month' ? 'week' : 'month')}
          />
          <SettingsButton />
        </View>
      ),
    });
  }, [navigation, title, mode, anchor, selectedDay, deselect, selectDay, c.text, c.textMuted]);

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
        <View
          style={styles.area}
          onLayout={(e) => {
            containerH.current = e.nativeEvent.layout.height;
          }}
        >
          {/* The sheet is a sibling, not a child: a sideways drag on the agenda must not flip the month. */}
          <GestureDetector gesture={swipe.gesture}>
            <Reanimated.View style={[styles.area, slideStyle]} onLayout={measureSwipe}>
              <MonthView anchor={anchor} selectedDay={selectedDay} onSelectDay={selectDay} />
            </Reanimated.View>
          </GestureDetector>
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
        <GestureDetector gesture={swipe.gesture}>
          <View style={styles.area} onLayout={measureSwipe}>
            <WeekView weekStart={weekStart} slide={swipe.offset} focusNow={focusNow} onPressOccurrence={openOccurrence} onCreateSlot={createSlot} />
          </View>
        </GestureDetector>
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
  area: { flex: 1, overflow: 'hidden' },
  titleButton: { flexShrink: 1, flexDirection: 'row', alignItems: 'center' },
  title: { flexShrink: 1, fontSize: 20, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
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
