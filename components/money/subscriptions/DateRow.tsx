import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatDueDateLabel } from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export function DateRow({
  label,
  value,
  onPress,
  colors,
  muted,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mb-3 rounded-2xl border px-4 py-3"
      style={{ backgroundColor: colors.background, borderColor: colors.border }}>
      <ThemedText className="text-[11px] font-black uppercase" style={{ color: muted }}>
        {label}
      </ThemedText>
      <ThemedText
        className="mt-1 text-sm font-black"
        style={{ color: value ? colors.text : muted }}>
        {value ? formatDueDateLabel(value) : 'Pick a date'}
      </ThemedText>
    </Pressable>
  );
}
