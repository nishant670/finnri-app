import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The capture card, shrinking to a pill as the feed scrolls under it.
 *
 * The mic card is ~286px and never changed size, so on an 812dp screen it and
 * the header owned the first viewport outright and the feed started below the
 * fold — permanently, no matter how far you scrolled. This gives that space
 * back after the first flick without moving capture off the screen: at rest it
 * is the full card, and collapsed it is a 56dp pill with the mic still on it.
 *
 * ## Why the collapse distance is not the 120px the backlog asked for
 *
 * The header block is pinned above a scroll view whose frame never changes, so
 * the feed scrolls 1:1 with the finger while this block shrinks. For the top of
 * the feed to stay glued to the bottom of the shrinking card, the card has to
 * lose exactly one pixel of height per pixel scrolled — so the scroll range
 * *is* the collapse distance (expanded height − 56), around 230px in practice.
 *
 * Collapsing over a shorter 120px would run the card up faster than the content
 * beneath it, opening a gap between the pill and the first row that then closes
 * again as you kept scrolling. Same class of correction as S5: the stated
 * number described the intent, not a mechanism that works.
 */

/** Height of the collapsed pill, per the spec. */
export const CAPTURE_PILL_HEIGHT = 56;

/** Horizontal inset, matching the capture card's own `marginHorizontal: 16`. */
const CAPTURE_INSET = 16;

/** The pill is fully formed before the card is completely gone. */
const CROSSFADE_END = 0.55;

/**
 * Air below the pill. Without it the pinned block ends on the pill's own edge
 * and feed rows slide up to touch it, so the two surfaces read as one.
 */
const PILL_BOTTOM_GAP = 12;

/**
 * What the whole capture region shrinks to.
 *
 * Exported because the screen has to guarantee the collapse can *finish*: the
 * scroll range it needs is the expanded height minus this, and a feed shorter
 * than that strands the crossfade half-done. See `app/(tabs)/index.tsx`.
 */
export const CAPTURE_COLLAPSED_HEIGHT = CAPTURE_PILL_HEIGHT + PILL_BOTTOM_GAP;
const COLLAPSED_HEIGHT = CAPTURE_COLLAPSED_HEIGHT;

type CollapsibleCaptureProps = {
  scrollY: SharedValue<number>;
  /** The full capture card plus anything that should collapse away with it. */
  children: ReactNode;
  /** Expand back to the card and put the cursor in the text field. */
  onExpand: () => void;
  /** Start or stop recording straight from the pill. */
  onMicPress: () => void;
  /**
   * Open manual entry from the pill (P11). The floating + is gone, so the bar
   * that stays on screen while scrolling carries both ways in.
   */
  onAddPress?: () => void;
  isRecording: boolean;
  /**
   * Held open regardless of scroll — while recording, or with a draft or a
   * finished recording in hand, collapsing the card would hide controls the
   * user is in the middle of using. Home also locks it on a feed too short to
   * be worth reclaiming space from; see `MIN_ENTRIES_FOR_COLLAPSE` there.
   */
  locked?: boolean;
  /** Reports the expanded height so the list can pad itself to match. */
  onExpandedHeightChange: (height: number) => void;
};

export function CollapsibleCapture({
  scrollY,
  children,
  onExpand,
  onMicPress,
  onAddPress,
  isRecording,
  locked = false,
  onExpandedHeightChange,
}: CollapsibleCaptureProps) {
  const theme = useThemeTokens().colors;
  const reducedMotion = useReducedMotion();
  const [expandedHeight, setExpandedHeight] = useState(0);
  const [pillActive, setPillActive] = useState(false);

  // Reduced motion keeps the card open. A scroll-linked resize is finger-driven
  // rather than autonomous, but it is still a large moving surface, and the
  // honest degrade is no movement at all — the screen simply behaves the way it
  // did before this component existed.
  const collapsible = !reducedMotion && !locked && expandedHeight > COLLAPSED_HEIGHT;
  const collapseDistance = collapsible ? expandedHeight - COLLAPSED_HEIGHT : 0;

  const containerStyle = useAnimatedStyle(() => {
    if (!collapsible) return { height: expandedHeight || undefined };
    return {
      height: interpolate(
        scrollY.value,
        [0, collapseDistance],
        [expandedHeight, COLLAPSED_HEIGHT],
        'clamp'
      ),
    };
  });

  const cardStyle = useAnimatedStyle(() => {
    if (!collapsible) return { opacity: 1 };
    const progress = interpolate(scrollY.value, [0, collapseDistance], [0, 1], 'clamp');
    return { opacity: interpolate(progress, [0, CROSSFADE_END], [1, 0], 'clamp') };
  });

  const pillStyle = useAnimatedStyle(() => {
    if (!collapsible) return { opacity: 0 };
    const progress = interpolate(scrollY.value, [0, collapseDistance], [0, 1], 'clamp');
    return { opacity: interpolate(progress, [CROSSFADE_END, 1], [0, 1], 'clamp') };
  });

  /**
   * Which of the two faces is the one you can touch.
   *
   * This has to be React state, not a value returned from `useAnimatedStyle`.
   * `pointerEvents` is not an animatable property: Reanimated applies whatever
   * the style evaluates to on the first pass and never updates it again, so a
   * pill that started life untouchable stayed untouchable and every tap on it
   * did nothing. One state change per threshold crossing is cheap and, unlike
   * the animated-style version, actually happens.
   */
  useAnimatedReaction(
    () => collapsible && scrollY.value >= collapseDistance * CROSSFADE_END,
    (collapsed, previous) => {
      if (collapsed !== previous) runOnJS(setPillActive)(collapsed);
    },
    [collapsible, collapseDistance]
  );

  return (
    <Animated.View style={[{ overflow: 'hidden' }, containerStyle]}>
      {/* The card is measured where it sits. Its height changes with state —
          the text field opening, "Listening…" appearing — and a constant here
          would be wrong for every state but one. */}
      <Animated.View
        style={cardStyle}
        pointerEvents={pillActive ? 'none' : 'auto'}
        onLayout={(event) => {
          const height = Math.round(event.nativeEvent.layout.height);
          if (height > 0 && height !== expandedHeight) {
            setExpandedHeight(height);
            onExpandedHeightChange(height);
          }
        }}>
        {children}
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: CAPTURE_INSET,
            right: CAPTURE_INSET,
            bottom: PILL_BOTTOM_GAP,
            height: CAPTURE_PILL_HEIGHT,
          },
          pillStyle,
        ]}
        pointerEvents={pillActive ? 'auto' : 'none'}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Expand capture and write an expense"
          onPress={onExpand}
          style={[styles.pill, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText tone="muted" numberOfLines={1} style={styles.pillLabel}>
            {isRecording ? 'Listening…' : 'Log an expense'}
          </ThemedText>
          {onAddPress && !isRecording ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add manually"
              onPress={onAddPress}
              hitSlop={4}
              style={[styles.pillAdd, { backgroundColor: theme.card, borderColor: theme.borderStrong }]}>
              <MaterialCommunityIcons name="plus" size={22} color={theme.text} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            onPress={onMicPress}
            hitSlop={8}
            style={[styles.pillMic, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons
              name={isRecording ? 'stop' : 'microphone'}
              size={22}
              color={theme.onAccent}
            />
          </Pressable>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Board R3-Home-Proposals: a 56dp bar on the card, an outlined 44dp + and the
 * mic as a 44dp accent circle at its end.
 */
const styles = StyleSheet.create({
  pill: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 20,
    paddingRight: 6,
    borderRadius: CAPTURE_PILL_HEIGHT / 2,
    borderWidth: 1,
  },
  pillLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  pillAdd: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillMic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
