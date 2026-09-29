import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const LOCK_PX = 12;
const COMMIT_FRACTION = 0.25;
const COMMIT_VELOCITY = 600;
const SLIDE_MS = 180;

/** Horizontal paging on the UI thread, for views that keep their neighbouring pages rendered and place
 *  each page at `page × width` on an axis fixed at mount. `offset` is that axis' translation, always
 *  -page × width at rest, and a swipe never resets it — so the page that slid in keeps its position, and
 *  the step's re-render changes nothing visible. `snapTo` is for jumps (Today, a picked date).
 *
 *  Direction lock is RNGH's: a drag that goes vertical first fails, so vertical scrolls and sheets keep
 *  it. Grabbing again mid-slide commits the pending step at once, so a quick double swipe keeps both. */
export function usePager(onStep: (dir: 1 | -1) => void) {
  const offset = useSharedValue(0);
  const width = useSharedValue(0);
  const page = useSharedValue(0);
  const pending = useSharedValue(0);
  const dragBase = useSharedValue(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const [actions] = useState(() => {
    const step = (dir: 1 | -1) => onStepRef.current(dir);
    const commitPending = () => {
      'worklet';
      const dir = pending.value;
      if (dir === 0) return;
      pending.value = 0;
      page.value += dir;
      scheduleOnRN(step, dir as 1 | -1);
    };
    const settle = (dir: number) => {
      'worklet';
      pending.value = dir;
      offset.value = withTiming(-(page.value + dir) * width.value, { duration: SLIDE_MS }, (done) => {
        if (done) commitPending();
      });
    };
    const gesture = Gesture.Pan()
      .maxPointers(1)
      .activeOffsetX([-LOCK_PX, LOCK_PX])
      .failOffsetY([-LOCK_PX, LOCK_PX])
      .onStart(() => {
        commitPending();
        cancelAnimation(offset);
        dragBase.value = offset.value;
      })
      .onUpdate((e) => {
        offset.value = dragBase.value + e.translationX;
      })
      .onEnd((e, success) => {
        const w = width.value;
        const moved = offset.value + page.value * w;
        const far = Math.abs(moved) > w * COMMIT_FRACTION;
        const flung = Math.abs(e.velocityX) > COMMIT_VELOCITY && Math.sign(e.velocityX) === Math.sign(moved);
        settle(success && w > 0 && (far || flung) ? (moved < 0 ? 1 : -1) : 0);
      });
    return { gesture, settle };
  });

  /** Animate one page over, as a swipe would, e.g. for a tap on a neighbouring page's content. */
  const slide = useCallback((dir: 1 | -1) => actions.settle(dir), [actions]);

  const snapTo = useCallback((p: number) => {
    cancelAnimation(offset);
    pending.value = 0;
    page.value = p;
    offset.value = -p * width.value;
  }, [offset, pending, page, width]);

  const onPageLayout = useCallback((e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
    offset.value = -page.value * e.nativeEvent.layout.width;
  }, [width, offset, page]);

  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return { gesture: actions.gesture, slideStyle, slide, snapTo, onPageLayout };
}
