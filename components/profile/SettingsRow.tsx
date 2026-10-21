import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { getMoodIconName } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** A 36dp neutral tile with its glyph in ink, the Profile screens' row icon (boards R8-*). */
export function NeutralTile({ icon, size = 36 }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; size?: number }) {
  const theme = useThemeTokens();
  // The Icon style setting (App mood) swaps glyphs for their outline versions.
  const name = getMoodIconName(icon, theme.mood.iconStyle) as keyof typeof MaterialCommunityIcons.glyphMap;
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: theme.colors.track }]}>
      <MaterialCommunityIcons name={name} size={Math.round(size / 2)} color={theme.colors.text} />
    </View>
  );
}

/**
 * One 60dp settings row: neutral tile, title, caption, then a chevron when it
 * opens something or an accessory (a switch) when it changes something here.
 */
export function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  accessory,
  divider = false,
  tone = 'default',
  testID,
  accessibilityLabel,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  accessory?: ReactNode;
  divider?: boolean;
  /** `negative` for a destructive row: red title and icon, no tile tint. */
  tone?: 'default' | 'negative';
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useThemeTokens();
  const negative = tone === 'negative';
  return (
    <PressableView
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      {negative ? (
        <View style={styles.bareIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.negative} />
        </View>
      ) : (
        <NeutralTile icon={icon} />
      )}
      <View style={styles.text}>
        <ThemedText
          numberOfLines={1}
          style={[styles.title, { color: negative ? colors.negative : colors.text, fontWeight: negative ? '600' : '500' }]}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText tone="muted" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {accessory ?? (onPress && !negative ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} /> : null)}
    </PressableView>
  );
}

/** A section's 14/700 title over its card (board R8-Profile). */
export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
          {title}
        </ThemedText>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bareIcon: {
    width: 20,
    alignItems: 'center',
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 12,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
});
