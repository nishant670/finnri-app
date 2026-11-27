import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

/**
 * The parts every capture tray shares: the bill tray (`app/bills.tsx`, canvas
 * Round 20) and the spoken-day tray (`app/batch.tsx`, Round 21, P117). Each
 * screen keeps its own reading logic; these keep the two looking and moving
 * the same.
 */

/** A drag past this share of the row drops it. */
const DROP_FRACTION = 0.35;

export type SaveMode = 'separate' | 'one';

export function TrayHeader({
  title,
  chip,
  onClose,
}: {
  title: string;
  chip?: string | null;
  onClose: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.header}>
      <PressableView
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.headerButton}
        pressedStyle={styles.pressed}>
        <MaterialCommunityIcons name="close" size={24} color={colors.text} />
      </PressableView>
      <ThemedText variant="screenTitle" style={styles.headerTitle} numberOfLines={1}>
        {title}
      </ThemedText>
      {chip ? (
        <View style={[styles.headerChip, { backgroundColor: colors.secondary }]}>
          <ThemedText variant="captionStrong">{chip}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/** Separate | One total (P100, P111). */
export function SaveModeSwitch({
  mode,
  onChange,
  separateLabel,
  oneLabel,
}: {
  mode: SaveMode;
  onChange: (mode: SaveMode) => void;
  separateLabel: string;
  oneLabel: string;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  return (
    <View accessibilityRole="radiogroup" style={[styles.switchTrack, { backgroundColor: colors.secondary }]}>
      {(['separate', 'one'] as const).map((option) => {
        const selected = mode === option;
        return (
          <PressableView
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => {
              haptics.select();
              onChange(option);
            }}
            style={[
              styles.switchOption,
              selected && { backgroundColor: theme.mode === 'dark' ? colors.border : colors.card },
            ]}
            pressedStyle={styles.pressed}>
            <ThemedText variant={selected ? 'bodyStrong' : 'body'} numberOfLines={1}>
              {option === 'separate' ? separateLabel : oneLabel}
            </ThemedText>
          </PressableView>
        );
      })}
    </View>
  );
}

/** Cancel on the left, the one accent button on the right. */
export function TrayFooter({
  bottomInset,
  onCancel,
  primaryLabel,
  onPrimary,
  busy,
}: {
  bottomInset: number;
  onCancel: () => void;
  primaryLabel: string;
  /** Null shows the button disabled (still reading, say). */
  onPrimary: (() => void) | null;
  busy?: boolean;
}) {
  const { colors } = useThemeTokens();
  const disabled = !onPrimary || !!busy;
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: bottomInset, borderTopColor: colors.border, backgroundColor: colors.background },
      ]}>
      <PressableView
        accessibilityRole="button"
        onPress={onCancel}
        style={[styles.secondary, { borderColor: colors.border, backgroundColor: colors.card }]}
        pressedStyle={styles.pressed}>
        <ThemedText variant="button">Cancel</ThemedText>
      </PressableView>
      <PressableView
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: !!busy }}
        disabled={disabled}
        onPress={onPrimary ?? undefined}
        style={[styles.primary, styles.flex, { backgroundColor: onPrimary ? colors.accent : colors.secondary }]}
        pressedStyle={styles.pressed}>
        <ThemedText variant="button" tone={onPrimary ? 'onAccent' : 'muted'} numberOfLines={1}>
          {primaryLabel}
        </ThemedText>
      </PressableView>
    </View>
  );
}

/** "Bill removed · Undo", floating over the footer. */
export function UndoToast({
  message,
  onUndo,
  bottom,
}: {
  message: string;
  onUndo: () => void;
  bottom: number;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const motion = useMotion();
  const dark = theme.mode === 'dark';
  return (
    <Animated.View
      entering={motion.reduced ? undefined : FadeIn.duration(motion.duration('instant'))}
      exiting={motion.reduced ? undefined : FadeOut.duration(motion.exitDuration('instant'))}
      style={[styles.undo, { bottom, backgroundColor: dark ? colors.card : colors.text }]}>
      <ThemedText variant="bodyStrong" style={{ color: dark ? colors.text : colors.background }}>
        {message}
      </ThemedText>
      <PressableView accessibilityRole="button" onPress={onUndo} style={styles.undoButton} pressedStyle={styles.pressed}>
        <ThemedText variant="bodyStrong" style={{ color: colors.accent }}>
          Undo
        </ThemedText>
      </PressableView>
    </Animated.View>
  );
}

/** The include tick at a row's left edge. */
export function TrayTick({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={styles.tickTarget}>
      <View
        style={[
          styles.tick,
          checked
            ? { backgroundColor: colors.accent }
            : { borderWidth: 2, borderColor: colors.borderStrong, backgroundColor: 'transparent' },
        ]}>
        {checked ? <MaterialCommunityIcons name="check" size={16} color={colors.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

/** What a saved row shows for the moment before it folds away. */
export function TraySavedRow() {
  const { colors } = useThemeTokens();
  const motion = useMotion();
  return (
    <Animated.View entering={motion.reduced ? undefined : FadeIn.duration(200)} style={styles.savedRow}>
      <View style={[styles.savedTick, { backgroundColor: colors.positive }]}>
        <MaterialCommunityIcons name="check" size={18} color={colors.card} />
      </View>
      <ThemedText variant="bodyStrong" tone="positive">
        Saved
      </ThemedText>
    </Animated.View>
  );
}

/**
 * One row of a tray: swipe left to drop it (with the screen's Undo), rises in
 * on arrival, fades out when it goes, and reflows its neighbours. `nudge` adds
 * a horizontal offset of the row's own, such as the bill tray's failure shake.
 */
export function TrayRowShell({
  index,
  canDrop,
  onRemove,
  attention,
  nudge,
  style,
  children,
}: {
  index: number;
  canDrop: boolean;
  onRemove: () => void;
  attention?: boolean;
  nudge?: { value: number };
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const motion = useMotion();
  const drag = useSharedValue(0);
  const [width, setWidth] = useState(0);
  // Read here, on the JS thread. `motion.duration` is not a worklet, and the
  // drop below runs on the UI thread: calling it there threw "Tried to
  // synchronously call a Remote Function", which killed a release build on
  // every swipe that went far enough to drop a row (27 Nov device test).
  const dropMs = motion.duration('base');

  const pan = Gesture.Pan()
    .enabled(canDrop && width > 0)
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      drag.value = Math.min(0, event.translationX);
    })
    .onEnd(() => {
      if (drag.value < -width * DROP_FRACTION) {
        drag.value = withTiming(-width, { duration: dropMs }, () => {
          runOnJS(onRemove)();
        });
      } else {
        drag.value = motion.springTo(0);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + (nudge ? nudge.value : 0) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        entering={motion.rowEntering(index)}
        exiting={motion.reduced ? undefined : FadeOut.duration(motion.exitDuration('base'))}
        layout={motion.reflow()}
        style={[
          styles.row,
          index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
          attention && { backgroundColor: theme.mode === 'dark' ? '#2A1E21' : '#FFF5F6' },
          style,
          rowStyle,
        ]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export const trayStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  totalBlock: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, gap: 2 },
  total: { fontVariant: ['tabular-nums'] },
  hint: { marginHorizontal: 20, marginTop: 10 },
  trayContent: { paddingBottom: 24 },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    paddingRight: 8,
  },
  openArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 4,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingLeft: 12,
  },
  amount: {
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tickSpacer: { width: 48 },
  pressed: { opacity: 0.6 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  headerChip: {
    marginRight: 12,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  switchTrack: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 4,
    borderRadius: 24,
    flexDirection: 'row',
    gap: 4,
  },
  switchOption: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },
  primary: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondary: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undo: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 52,
    borderRadius: 18,
    paddingLeft: 16,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  undoButton: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  row: { minHeight: 76, justifyContent: 'center' },
  tickTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 76,
  },
  savedTick: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
