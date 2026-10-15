import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

export function Pill({ label, selected, onPress, colors }: PillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="min-h-11 justify-center rounded-full border px-3 py-2"
      style={{
        backgroundColor: selected ? colors.secondary : colors.background,
        borderColor: selected ? colors.accent : colors.border,
      }}>
      <ThemedText
        className="text-[11px] font-black"
        style={{ color: selected ? colors.accent : `${colors.text}99` }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
