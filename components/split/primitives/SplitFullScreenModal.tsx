import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Motion } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const ENTER_EASING = Easing.bezier(...Motion.ease.standard);
const EXIT_EASING = Easing.bezier(...Motion.ease.exit);

/**
 * The push transition for split's three full-screen screens — group detail,
 * members, settings.
 *
 * They used to lean on `Modal`'s built-in slide, which was dropped when the
 * feature moved onto the app's own motion vocabulary. Dropping it alone was a
 * regression: React Native's `Modal` defaults to `"none"`, so a group detail
 * that used to push in started appearing instantly, which reads as a glitch
 * rather than as speed.
 *
 * `animationType` is not the way back. It is a fixed platform curve at a fixed
 * platform duration, so it cannot honour `Motion.duration.sheet` and — the part
 * that actually matters — it cannot be turned off for reduced motion. This runs
 * the same travel off the same token the bottom sheet uses, and degrades to no
 * animation at all when the user has asked for that.
 *
 * ## Why the travel is a transform and not a layout animation
 *
 * The obvious spelling is `entering={SlideInRight}` / `exiting={SlideOutRight}`.
 * It was, and it cost a day. Reanimated's *layout* animations constrain the
 * animated view's children on Android: an absolutely positioned descendant gets
 * measured against the animating box rather than the container, and its hit box
 * is clipped to whatever overlaps. Group detail's "Add expense" pill was the
 * casualty — 196px of visible button reporting a 51px touch target, so every
 * tap on it missed and the button looked simply dead. Nothing about the pill
 * was wrong; five rewrites of it changed the number and never fixed it.
 *
 * A shared value driving `translateX` through `useAnimatedStyle` is the same
 * motion with none of that: it is an ordinary transform on an ordinary view, so
 * children lay out and hit-test exactly as they would standing still.
 *
 * ## Why it owns the close
 *
 * An exit animation needs the leaving view to still be mounted while it plays,
 * and these modals are rendered conditionally by the screen above them — the
 * moment `onClose` runs, the parent drops them and there is nothing left to
 * animate. So `close` is handed *down* to the content instead: it plays the
 * exit, and only then tells the parent. Children get it as a render prop rather
 * than a prop on a wrapper element, because both the header's back button and
 * Android's hardware back have to go through the same door.
 */
export function SplitFullScreenModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const { width } = useWindowDimensions();
  const duration = motion.duration('sheet');
  const exitDuration = motion.exitDuration('sheet');
  const progress = useSharedValue(duration === 0 ? 1 : 0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (duration === 0) {
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration, easing: ENTER_EASING });
  }, [duration, progress]);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    if (exitDuration === 0) {
      onClose();
      return;
    }
    progress.value = withTiming(0, { duration: exitDuration, easing: EXIT_EASING }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [closing, exitDuration, onClose, progress]);

  const travelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * width }],
  }));

  // `transparent` so the screen underneath stays visible for the length of the
  // travel — a push that slides in over a blank white field is not a push. The
  // sliding view carries the opaque background instead.
  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <Animated.View
        style={[{ flex: 1, backgroundColor: theme.background }, travelStyle]}>
        <SafeAreaView
          className="flex-1"
          edges={['top', 'left', 'right', 'bottom']}
          style={{ backgroundColor: theme.background }}>
          {children(close)}
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
