import { fmtTime, parseYmd } from '@lupira/cal-domain/time';
import { textOn } from '@lupira/cal-tokens/contrast';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Chip, FAB, Text } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { isTaskRow } from '../../domain/taskRows';
import { useDaysOccurrences, type CalRow } from '../../state/useOccurrences';
import { useTaskDeadlines } from '../../state/useTaskDeadlines';
import { Glyph } from '../components/Glyph';
import { BIRTHDAY_COLOR, availabilityColor, useCalendarColors } from '../hooks/palette';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

// Fractions of the month area: two snap heights, a drag ceiling, and the line below which a release closes.
const LOW = 0.38;
const HIGH = 0.78;
const CEILING = 0.85;
const CLOSE_BELOW = 0.2;
const SPRING = { damping: 22, stiffness: 220 };

/** The selected day's agenda over the month grid. Opens at the low snap; the handle drags it between
 *  snaps, and releasing it low closes it. Stays mounted (and keeps its height) while the day changes. */
export function DaySheet({ day, areaH, onDismiss, onOpenOccurrence }: {
  day: string;
  areaH: SharedValue<number>;
  onDismiss: () => void;
  onOpenOccurrence: (row: CalRow) => void;
}) {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const height = useSharedValue(0);
  const startH = useSharedValue(0);

  useEffect(() => {
    height.value = withSpring(areaH.value * LOW, SPRING);
  }, [height, areaH]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const [drag] = useState(() => {
    const dismiss = () => onDismissRef.current();
    return Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onStart(() => {
        startH.value = height.value;
      })
      .onUpdate((e) => {
        height.value = Math.max(0, Math.min(areaH.value * CEILING, startH.value - e.translationY));
      })
      .onEnd(() => {
        const H = areaH.value;
        if (height.value < H * CLOSE_BELOW) {
          height.value = withTiming(0, { duration: 150 }, (done) => {
            if (done) scheduleOnRN(dismiss);
          });
        } else {
          height.value = withSpring(height.value > H * (LOW + HIGH) / 2 ? H * HIGH : H * LOW, SPRING);
        }
      });
  });
  const sheetStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.divider }, sheetStyle]}>
      <GestureDetector gesture={drag}>
        <View style={styles.header}>
          <View style={[styles.handle, { backgroundColor: c.divider }]} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {parseYmd(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={() => navigation.navigate('AvailabilityEdit', { day })} hitSlop={6}>
                <Text style={[styles.link, { color: c.primary }]}>Availability</Text>
              </Pressable>
              <FAB size="small" icon={ICONS.add} onPress={() => navigation.navigate('ItemEdit', { day })} />
            </View>
          </View>
        </View>
      </GestureDetector>
      <ScrollView>
        <DayAgenda day={day} onPress={onOpenOccurrence} />
      </ScrollView>
    </Animated.View>
  );
}

function DayAgenda({ day, onPress }: { day: string; onPress: (row: CalRow) => void }) {
  const c = useColors();
  const { rows } = useDaysOccurrences([day]);
  const taskRows = useTaskDeadlines([day]);
  const colorOf = useCalendarColors();
  const sorted: CalRow[] = [...rows, ...taskRows].sort((a, b) => b.all_day - a.all_day || (a.start_utc < b.start_utc ? -1 : 1));

  return (
    <View style={styles.agenda}>
      {sorted.length === 0 && <Text style={[styles.empty, { color: c.textMuted }]}>Nothing scheduled</Text>}
      {sorted.map((r) => {
        const key = `${r.source}-${r.source_id}-${r.start_utc}`;
        if (r.is_availability === 1) {
          const fill = availabilityColor(r.avail_status);
          return (
            <Pressable key={key} style={styles.row} onPress={() => onPress(r)}>
              <Chip compact style={{ backgroundColor: fill }} textStyle={[styles.availText, { color: textOn(fill) }]}>
                {r.avail_status ?? 'Availability'}
              </Chip>
            </Pressable>
          );
        }
        const dot = isTaskRow(r) ? (r.task.overdue ? c.danger : c.textMuted) : r.source === 'birthday' ? BIRTHDAY_COLOR : colorOf(r.calendar_id);
        return (
          <Pressable key={key} style={styles.row} onPress={() => onPress(r)}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text style={[styles.time, { color: c.textMuted }]}>
              {isTaskRow(r) ? <Glyph name={ICONS.schedule} /> : r.source === 'birthday' ? <Glyph name={ICONS.cake} /> : r.all_day === 1 ? 'all day' : fmtTime(new Date(r.start_utc))}
            </Text>
            <Text style={styles.text} numberOfLines={1}>{r.title ?? '(untitled)'}</Text>
            {isTaskRow(r) && r.task.overdue && <Text style={[styles.flag, { color: c.danger }]}>overdue</Text>}
            {r.status === 'Cancelled' && <Text style={[styles.flag, { color: c.danger }]}>cancelled</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden',
    borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 0.5,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -3 }, elevation: 8,
  },
  header: { paddingTop: 6, paddingBottom: 4, paddingHorizontal: 14 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  link: { fontSize: 13, fontWeight: '600' },
  availText: { fontSize: 12, fontWeight: '600' },
  agenda: { paddingHorizontal: 14, paddingBottom: 24, gap: 2 },
  empty: { fontSize: 13, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  time: { width: 52, fontSize: 12 },
  text: { flex: 1, fontSize: 14 },
  flag: { fontSize: 11 },
});
