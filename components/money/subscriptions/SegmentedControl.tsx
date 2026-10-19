import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { haptics } from '@/lib/haptics';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SegmentedControlProps<T extends string> = {
  label: string;
  values: { value: T; label: string }[];
  active: T;
  onSelect: (value: T) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  /** Wrap into rows this many segments wide, for more choices than fit in one. */
  columns?: number;
};

export function SegmentedControl<T extends string>({
  label,
  values,
  active,
  onSelect,
  colors,
  columns,
}: SegmentedControlProps<T>) {
  return (
    <View className="mb-3">
      <ThemedText
        className="mb-1 text-[11px] font-black uppercase"
        style={{ color: `${colors.text}99` }}>
        {label}
      </ThemedText>
      <View
        className={`flex-row rounded-2xl p-1 ${columns ? 'flex-wrap' : ''}`}
        style={{ backgroundColor: colors.background }}>
        {values.map((option) => {
          const selected = option.value === active;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.select();
                onSelect(option.value);
              }}
              className={`min-h-11 items-center justify-center rounded-xl py-2 ${columns ? '' : 'flex-1'}`}
              style={{
                backgroundColor: selected ? colors.secondary : 'transparent',
                ...(columns ? { width: `${100 / columns}%` as const } : null),
              }}>
              <ThemedText
                className="text-[11px] font-black uppercase"
                style={{ color: selected ? colors.accent : `${colors.text}99` }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
