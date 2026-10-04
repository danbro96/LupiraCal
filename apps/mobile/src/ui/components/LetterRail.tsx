import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { hapticSelection } from '../../feedback/haptics';
import { useLatestCallback } from '../hooks/useLatestCallback';
import { radii, useColors } from '../theme';

const RAIL_WIDTH = 22;
const BUBBLE = 56;
// Each jump renders a whole screen of rows; a swipe across the rail jumps only where the finger rests.
const SETTLE_MS = 70;

/** Quick-scroll index: touch or drag along the letters to jump; a bubble shows the letter under the finger.
 *  Tracking and the bubble run on the UI thread, so they keep up while the list is busy rendering the jump. */
export function LetterRail({ letters, present, onSelect }: {
  letters: readonly string[];
  present: ReadonlySet<string>;
  onSelect: (letter: string) => void;
}) {
  const c = useColors();
  const height = useSharedValue(0);
  const active = useSharedValue(-1);
  const settle = useRef<{ timer: ReturnType<typeof setTimeout>; letter: string } | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current.timer); }, []);

  const flush = useLatestCallback(() => {
    const pending = settle.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    settle.current = null;
    onSelect(pending.letter);
  });
  const select = useLatestCallback((i: number) => {
    hapticSelection();
    if (settle.current) clearTimeout(settle.current.timer);
    settle.current = { timer: setTimeout(flush, SETTLE_MS), letter: letters[i] };
  });

  const gesture = useMemo(() => {
    const count = letters.length;
    const pick = (y: number) => {
      'worklet';
      if (height.get() <= 0) return;
      const i = Math.min(count - 1, Math.max(0, Math.floor((y / height.get()) * count)));
      if (i === active.get()) return;
      active.set(i);
      scheduleOnRN(select, i);
    };
    return Gesture.Pan()
      .minDistance(0)
      .onBegin((e) => pick(e.y))
      .onUpdate((e) => pick(e.y))
      .onFinalize(() => {
        active.set(-1);
        scheduleOnRN(flush);
      });
  }, [letters, select, flush, height, active]);

  const bubbleStyle = useAnimatedStyle(() => {
    const slot = height.get() / letters.length;
    return {
      opacity: active.get() < 0 ? 0 : 1,
      transform: [{ translateY: Math.max(active.get(), 0) * slot + slot / 2 - BUBBLE / 2 }],
    };
  });
  // The bubble's letter can't change text on the UI thread, so it windows a strip of every letter instead.
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(active.get(), 0) * BUBBLE }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.rail} onLayout={(e) => { height.set(e.nativeEvent.layout.height); }}>
        {letters.map((l) => (
          <View key={l} style={styles.slot}>
            <Text style={[styles.letter, { color: present.has(l) ? c.primary : c.textDisabled }]}>{l}</Text>
          </View>
        ))}
        <Animated.View pointerEvents="none" style={[styles.bubble, { backgroundColor: c.primary }, bubbleStyle]}>
          <Animated.View style={stripStyle}>
            {letters.map((l) => (
              <View key={l} style={styles.bubbleCell}>
                <Text style={[styles.bubbleText, { color: c.onPrimary }]}>{l}</Text>
              </View>
            ))}
          </Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  rail: { width: RAIL_WIDTH },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 11, fontWeight: '600' },
  bubble: {
    position: 'absolute',
    top: 0,
    right: RAIL_WIDTH + 12,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: radii.round,
    overflow: 'hidden',
  },
  bubbleCell: { width: BUBBLE, height: BUBBLE, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontSize: 28, fontWeight: '700' },
});
