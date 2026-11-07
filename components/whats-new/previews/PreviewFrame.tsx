import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** The width a preview lays out at, as if on a small phone. */
export const PREVIEW_LAYOUT_WIDTH = 300;
const SCALE = 0.72;
const FRAME_BORDER = 6;
const FRAME_WIDTH = Math.round(PREVIEW_LAYOUT_WIDTH * SCALE) + FRAME_BORDER * 2;

/**
 * A live preview's phone (boards R15-WhatsNew*): the top of a phone peeking up
 * from a tinted band, with the real screen inside at 72%, in the viewer's own
 * mood and mode. Touches are off: it is a picture, and Try it is the way in.
 */
export function PreviewFrame({ children, background }: { children: ReactNode; background?: string }) {
  const { colors, mode } = useThemeTokens();
  return (
    <View
      style={[styles.band, { backgroundColor: colors.secondary }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.badge, { backgroundColor: colors.card }]}>
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
        <ThemedText style={[styles.badgeText, { color: colors.text }]}>Live · your colours</ThemedText>
      </View>
      <View
        style={[
          styles.frame,
          {
            // Ink in light, near-black in dark: the frame reads as a phone either way.
            borderColor: mode === 'dark' ? '#000000' : colors.text,
            backgroundColor: background ?? colors.background,
          },
        ]}>
        <View style={styles.screen}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    height: 210,
    paddingTop: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    left: 10,
    top: 8,
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  frame: {
    width: FRAME_WIDTH,
    height: 230,
    borderWidth: FRAME_BORDER,
    borderBottomWidth: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  screen: {
    width: PREVIEW_LAYOUT_WIDTH,
    transform: [{ scale: SCALE }],
    transformOrigin: 'top left',
  },
});
