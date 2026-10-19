import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { withAlpha } from '@/constants/theme';
import { formatDueDateLabel } from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** A date as a 48dp row on the card: the label, the date with a calendar, a chevron. */
export function DateRow({
  label,
  value,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ThemedText tone="muted" numberOfLines={1} style={styles.label}>
        {label}
      </ThemedText>
      <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={colors.text} />
      <ThemedText
        numberOfLines={1}
        style={[styles.value, { color: value ? colors.text : colors.muted }]}>
        {value ? formatDueDateLabel(value) : 'Pick a date'}
      </ThemedText>
      <MaterialCommunityIcons name="chevron-right" size={16} color={withAlpha(colors.text, 0.6)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderRadius: 16,
  },
  label: {
    width: 84,
    marginRight: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  value: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
