import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

const THUMB = 24;
const TRACK = 4;

type SliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** The words a screen reader says for the value, e.g. "₹10,000". */
  accessibilityValueText?: string;
  /** The range's two ends, drawn under the track ("₹500", "₹2,50,000"). */
  minLabel?: string;
  maxLabel?: string;
  testID?: string;
};

/**
 * A worklet: the drag runs on the UI thread and calls it there. Without the
 * directive Reanimated throws "Tried to synchronously call a Remote Function"
 * on the first touch — a crash Jest cannot see, found on the device.
 */
const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

/** Snaps to the step, and keeps floating-point noise (0.30000000000000004) out of the value. */
const snap = (value: number, min: number, max: number, step: number) => {
  const snapped = Math.round((value - min) / step) * step + min;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(clamp(snapped, min, max).toFixed(decimals));
};

/**
 * A slider under a calculator field (boards R11-SIP-Proposals and
 * R11-EMI-Proposals, P51), drawn with gesture-handler and Reanimated — both
 * already in the app — rather than a native slider package, so it ships
 * without a new native build.
 *
 * The field above it stays typeable: the slider is the quick way to move, the
 * field the exact one. A value typed outside the range parks the thumb at
 * that end.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
  minLabel,
  maxLabel,
  testID,
}: SliderProps) {
  const { colors } = useThemeTokens();
  const [width, setWidth] = useState(0);
  const span = Math.max(max - min, step);
  const fraction = (clamp(value, min, max) - min) / span;

  const travel = useSharedValue(0);
  const position = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastSent = useRef(value);
  lastSent.current = value;

  useEffect(() => {
    travel.value = Math.max(0, width - THUMB);
  }, [travel, width]);

  // Follow the value from outside (typed into the field) unless a drag is on.
  useEffect(() => {
    if (!dragging.value) position.value = fraction * Math.max(0, width - THUMB);
  }, [dragging, fraction, position, width]);

  const emit = (x: number) => {
    const usable = Math.max(1, width - THUMB);
    const next = snap(min + (clamp(x, 0, usable) / usable) * span, min, max, step);
    if (next !== lastSent.current) {
      lastSent.current = next;
      haptics.select();
      onChange(next);
    }
  };

  // Only a sideways drag moves the thumb: a page scroll that starts on the
  // track fails the pan (found on the device, where scrolling the calculator
  // changed its tenure). A tap jumps the thumb to where it landed.
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-10, 10])
    .hitSlop({ top: 12, bottom: 12 })
    .onStart((event) => {
      dragging.value = true;
      position.value = clamp(event.x - THUMB / 2, 0, travel.value);
      runOnJS(emit)(position.value);
    })
    .onUpdate((event) => {
      position.value = clamp(event.x - THUMB / 2, 0, travel.value);
      runOnJS(emit)(position.value);
    })
    .onFinalize(() => {
      dragging.value = false;
    });
  const tap = Gesture.Tap()
    .hitSlop({ top: 12, bottom: 12 })
    .onEnd((event) => {
      position.value = clamp(event.x - THUMB / 2, 0, travel.value);
      runOnJS(emit)(position.value);
    });
  const gesture = Gesture.Race(pan, tap);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: position.value + THUMB / 2 }));

  const nudge = (direction: 1 | -1) => {
    const next = snap(value + direction * step, min, max, step);
    if (next !== value) onChange(next);
  };

  return (
    <View testID={testID}>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ min, max, now: value, text: accessibilityValueText }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            nudge(event.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          style={styles.hit}>
          <View style={[styles.track, { backgroundColor: colors.track }]}>
            <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
          </View>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: colors.card, borderColor: colors.accent },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
      {minLabel || maxLabel ? (
        <View style={styles.ends} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <ThemedText tone="muted" style={styles.end}>
            {minLabel}
          </ThemedText>
          <ThemedText tone="muted" style={styles.end}>
            {maxLabel}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    height: 32,
    justifyContent: 'center',
  },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  end: {
    fontSize: 11,
    lineHeight: 14,
  },
});
