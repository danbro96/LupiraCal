import { useLayoutEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const LOCK_PX = 12;
const COMMIT_FRACTION = 0.25;
const COMMIT_VELOCITY = 600;
const SLIDE_MS = 160;

/** Horizontal period paging: the content tracks the finger, and past a quarter of the width (or on a
 *  fling) slides out, `onStep` swaps the period, and the new one slides in from the far side.
 *  Direction lock is RNGH's — a drag that goes vertical first fails, so the hour scroll and the day
 *  sheet keep it. The PanResponder this replaced lost that race to the native ScrollView. */
export function usePeriodSwipe(onStep: (dir: 1 | -1) => void, pageKey: string) {
  const offset = useSharedValue(0);
  const width = useSharedValue(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const entering = useRef<1 | -1 | null>(null);

  const gesture = useMemo(() => {
    const commit = (dir: 1 | -1) => {
      entering.current = dir;
      onStepRef.current(dir);
    };
    return Gesture.Pan()
      .maxPointers(1)
      .activeOffsetX([-LOCK_PX, LOCK_PX])
      .failOffsetY([-LOCK_PX, LOCK_PX])
      .onUpdate((e) => {
        offset.value = e.translationX;
      })
      .onEnd((e, success) => {
        const w = width.value;
        const far = Math.abs(e.translationX) > w * COMMIT_FRACTION;
        const flung = Math.abs(e.velocityX) > COMMIT_VELOCITY && Math.sign(e.velocityX) === Math.sign(e.translationX);
        if (success && w > 0 && (far || flung)) {
          const dir = e.translationX < 0 ? 1 : -1;
          offset.value = withTiming(-dir * w, { duration: SLIDE_MS }, (done) => {
            if (done) scheduleOnRN(commit, dir);
          });
        } else {
          offset.value = withTiming(0, { duration: SLIDE_MS });
        }
      });
  }, [offset, width]);

  // Runs once the new period has committed; until then it sits off-screen where the old one left.
  useLayoutEffect(() => {
    const dir = entering.current;
    if (dir === null) return;
    entering.current = null;
    offset.value = withSequence(withTiming(dir * width.value, { duration: 0 }), withTiming(0, { duration: SLIDE_MS }));
  }, [pageKey, offset, width]);

  return { gesture, offset, width };
}
