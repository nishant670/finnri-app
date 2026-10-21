import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * A section of the Insights stack: its 15/700 title ("Needs review · 1"), an
 * optional ink link on the right, and the cards under it.
 */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const { colors } = useThemeTokens();

  return (
    <View>
      <View style={styles.head}>
        <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </ThemedText>
        {actionLabel ? (
          // A link is ink, bolder, with a chevron — never accent text on a
          // light surface (palette rule, 11 Oct).
          <Pressable
            accessibilityRole="button"
            onPress={onAction}
            hitSlop={10}
            style={styles.action}>
            <ThemedText style={[styles.actionLabel, { color: colors.text }]}>{actionLabel}</ThemedText>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
