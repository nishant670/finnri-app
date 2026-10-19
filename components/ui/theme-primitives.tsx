import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PressableView, type PressableViewProps } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type ScreenProps = SafeAreaViewProps & {
  padded?: boolean;
};

export function Screen({ style, padded = false, children, ...props }: ScreenProps) {
  const theme = useThemeTokens();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: padded ? theme.components.screen.horizontalPadding : 0,
        },
        style,
      ]}
      {...props}>
      {children}
    </SafeAreaView>
  );
}

type CardProps = ViewProps & {
  compact?: boolean;
  /**
   * Holds the card 16 in from both screen edges, the redesign's one gutter.
   * Off by default because most screens still pad their own content; a
   * screen moves to it when it is rebuilt on the 16 grid.
   */
  inset?: boolean;
};

/** The redesign's card: flat, `card` fill, a 1dp `border`, radius 16. */
export const CARD_RADIUS = 16;
export const SCREEN_GUTTER = 16;

export function Card({ style, compact = false, inset = false, children, ...props }: CardProps) {
  const theme = useThemeTokens();
  const card = compact ? theme.components.compactCard : theme.components.card;

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: CARD_RADIUS,
          borderWidth: 1,
          padding: card.padding,
        },
        inset ? { marginHorizontal: SCREEN_GUTTER } : undefined,
        style,
      ]}
      {...props}>
      {children}
    </View>
  );
}

type GroupHeaderProps = {
  /** "Today", "Yesterday", "October 2026". */
  label: string;
  /**
   * The group's total, already formatted — `−₹9,672`. Omit it where a total
   * would be wrong, such as a day that is only partly loaded.
   */
  total?: string;
  /** `negative` for a group that is a warning in itself, such as "Overdue". */
  tone?: 'muted' | 'negative';
};

/**
 * The label over a group of rows — a day, a month, a status — with its total
 * on the right. Sits outside the card it heads (board R3-List).
 */
export function GroupHeader({ label, total, tone = 'muted' }: GroupHeaderProps) {
  const theme = useThemeTokens();

  return (
    <View style={styles.groupHeader}>
      <ThemedText
        accessibilityRole="header"
        numberOfLines={1}
        tone={tone}
        style={styles.groupLabel}>
        {label}
      </ThemedText>
      {total ? (
        <ThemedText numberOfLines={1} style={[styles.groupTotal, { color: theme.colors.text }]}>
          {total}
        </ThemedText>
      ) : null}
    </View>
  );
}

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const theme = useThemeTokens();

  return (
    <View style={styles.sectionHeader}>
      <ThemedText variant="sectionTitle" style={{ color: theme.colors.text, fontSize: 14, lineHeight: 18 }}>
        {title}
      </ThemedText>
      {actionLabel && onAction ? (
        // A link is ink, bolder, with a chevron — never accent text on a light
        // surface (palette rule, 11 Oct).
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={10}
          style={styles.sectionAction}>
          <ThemedText style={[styles.sectionActionLabel, { color: theme.colors.text }]}>
            {actionLabel}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

type TextActionProps = Omit<PressableViewProps, 'children'> & {
  label: string;
  expanded?: boolean;
  children?: ReactNode;
};

export function TextAction({ label, expanded, style, children, ...props }: TextActionProps) {
  const theme = useThemeTokens();

  return (
    <PressableView
      accessibilityRole="button"
      hitSlop={10}
      style={[
        styles.textAction,
        {
          minHeight: theme.components.textAction.minHeight,
          gap: theme.components.textAction.gap,
        },
        style,
      ]}
      pressedStyle={{ opacity: 0.7 }}
      {...props}>
      <ThemedText variant="captionStrong" style={{ color: theme.colors.text }}>
        {label}
      </ThemedText>
      {children}
    </PressableView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 32,
  },
  sectionActionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: SCREEN_GUTTER,
  },
  groupLabel: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  groupTotal: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  textAction: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
