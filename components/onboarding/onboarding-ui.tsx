import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryTile } from '@/lib/categories';

/**
 * The pieces the onboarding and welcome boards (R13) are drawn from: a rounded
 * panel holding a mock of a real app surface, and the one-colour title and body
 * under it.
 *
 * The mocks are static drawings of screens the app already has — a draft card,
 * a split, a month total — so a new user sees the thing they are about to use
 * rather than an abstract graphic. Their figures are illustrations, not data.
 */

/** The panel's design height on a 390×844 phone; smaller screens get less. */
export const PANEL_HEIGHT = 388;

/**
 * The rounded panel an illustration sits in. It takes whatever height the
 * screen leaves it, up to `maxHeight`, and scales its content down to fit
 * rather than clipping it — a mock with its Save button cut off reads as a
 * broken screen, not as a smaller one.
 */
export function IllustrationPanel({
  children,
  maxHeight = PANEL_HEIGHT,
  style,
  testID,
}: {
  children: ReactNode;
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const [panelHeight, setPanelHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const onPanelLayout = (event: LayoutChangeEvent) => setPanelHeight(event.nativeEvent.layout.height);
  const onContentLayout = (event: LayoutChangeEvent) =>
    setContentHeight(event.nativeEvent.layout.height);

  // 24 of breathing room above and below the mock, as the boards leave it.
  const room = panelHeight - 48;
  const scale = panelHeight > 0 && contentHeight > room ? Math.max(room / contentHeight, 0.5) : 1;

  return (
    <View
      testID={testID}
      onLayout={onPanelLayout}
      style={[styles.panel, { backgroundColor: colors.track, maxHeight }, style]}>
      <View onLayout={onContentLayout} style={{ transform: [{ scale }] }}>
        {children}
      </View>
    </View>
  );
}

/** A floating app surface inside a panel: the card fill, a hairline and a soft lift. */
export function MockCard({
  children,
  width = 300,
  style,
}: {
  children: ReactNode;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemeTokens();
  return (
    <View
      style={[
        styles.mockCard,
        { width, backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

/** An icon on a tinted square, coloured the way category tiles are in either mode. */
export function MockTile({
  icon,
  color,
  bgColor,
  size,
  radius,
  iconSize,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
  size: number;
  radius: number;
  iconSize: number;
}) {
  const { mode } = useThemeTokens();
  const tile = categoryTile({ color, bgColor }, mode);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: tile.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <MaterialCommunityIcons name={icon} size={iconSize} color={tile.foreground} />
    </View>
  );
}

/**
 * The tile pairs the mocks use. Food & Drinks is the category palette's own;
 * the others are the hues the boards give UPI, a group, a card and a renewal.
 */
export const MOCK_TILES = {
  food: { icon: 'silverware-fork-knife', color: '#B7860B', bgColor: '#FFF9C4' },
  upi: { icon: 'cellphone', color: '#00897B', bgColor: '#E0F2F1' },
  group: { icon: 'account-group-outline', color: '#00897B', bgColor: '#E0F2F1' },
  card: { icon: 'credit-card-outline', color: '#8B3FD9', bgColor: '#F3E8FF' },
  renewal: { icon: 'play-circle-outline', color: '#C2185B', bgColor: '#FCE4EC' },
} as const;

/** The title and body under a slide's panel: one colour, no accent second line. */
export function SlideText({
  title,
  body,
  align = 'left',
}: {
  title: string;
  body: string;
  align?: 'left' | 'center';
}) {
  return (
    <View style={[styles.text, align === 'center' && styles.textCentered]}>
      <ThemedText
        accessibilityRole="header"
        style={[styles.title, align === 'center' && styles.centered]}>
        {title}
      </ThemedText>
      <ThemedText tone="muted" style={[styles.body, align === 'center' && styles.centered]}>
        {body}
      </ThemedText>
    </View>
  );
}

/** The speech bubble a spoken or typed entry is drawn in: the accent's soft tint. */
export function useBubbleFill() {
  const { colors, mode } = useThemeTokens();
  return mode === 'dark' ? withAlpha(colors.accent, 0.16) : colors.secondary;
}

const styles = StyleSheet.create({
  panel: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    marginHorizontal: 16,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mockCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 2,
  },
  text: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 10,
  },
  textCentered: {
    alignItems: 'center',
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  centered: {
    textAlign: 'center',
  },
});
