import { addMonths, parseYmd, ymd } from '@lupira/cal-domain/time';
import { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue } from 'react-native-reanimated';
import type { CalRow } from '../../state/useOccurrences';
import { useBackDismiss } from '../hooks/useBackDismiss';
import { DaySheet } from './DaySheet';
import { useJump, type CalendarJump } from './jump';
import { MonthView } from './MonthView';
import { usePager } from './usePager';

const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const monthKeyOf = (d: Date) => ymd(d).slice(0, 7);

/** Month mode: the previous, current and next month rendered side by side on a month axis fixed at mount
 *  (see usePager), with the selected day's agenda sheet over them. Changing month clears the selection,
 *  except when the change came from tapping a neighbouring month's day — that slides over and selects it. */
export function MonthPane({ anchor, jump, onStep, onOpenOccurrence }: {
  anchor: Date;
  jump: CalendarJump;
  onStep: (dir: 1 | -1) => void;
  onOpenOccurrence: (row: CalRow) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const deselect = () => setSelectedDay(null);
  useBackDismiss(selectedDay !== null, deselect);

  const [originIdx] = useState(() => monthIndex(anchor));
  const page = monthIndex(anchor) - originIdx;
  const areaH = useSharedValue(0);

  const selectAfterStep = useRef<string | null>(null);
  const pager = usePager((dir: 1 | -1) => {
    onStep(dir);
    setSelectedDay(selectAfterStep.current);
    selectAfterStep.current = null;
  });

  const anchorRef = useRef(anchor);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
  });
  const { slide } = pager;
  const selectDay = (day: string) => {
    const dir = Math.sign(monthIndex(parseYmd(day)) - monthIndex(anchorRef.current));
    if (dir === 0) {
      setSelectedDay(day);
      return;
    }
    selectAfterStep.current = day;
    slide(dir as 1 | -1);
  };

  useJump(jump, (j) => {
    pager.snapTo(page);
    setSelectedDay(j.day ?? null);
  });

  const onLayout = (e: LayoutChangeEvent) => {
    areaH.set(e.nativeEvent.layout.height);
    pager.onPageLayout(e);
  };

  return (
    <View style={styles.area} onLayout={onLayout}>
      {/* The sheet is a sibling of the pager, so a sideways drag on the agenda never flips the month. */}
      <GestureDetector gesture={pager.gesture}>
        <Animated.View style={[styles.fill, pager.slideStyle]}>
          {[-1, 0, 1].map((o) => {
            const monthKey = monthKeyOf(addMonths(anchor, o));
            return (
              <View key={monthKey} style={[styles.page, { left: `${(page + o) * 100}%` }]}>
                <MonthView monthKey={monthKey} selectedDay={selectedDay} onSelectDay={selectDay} />
              </View>
            );
          })}
        </Animated.View>
      </GestureDetector>
      {selectedDay && (
        <DaySheet day={selectedDay} areaH={areaH} onDismiss={deselect} onOpenOccurrence={onOpenOccurrence} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, overflow: 'hidden' },
  // Never clipped itself: the neighbouring months sit outside its bounds, and the clip would move with it.
  fill: { flex: 1 },
  page: { position: 'absolute', top: 0, bottom: 0, width: '100%' },
});
