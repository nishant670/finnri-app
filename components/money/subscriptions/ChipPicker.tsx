import { View } from 'react-native';

import { Pill } from './Pill';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type ChipPickerProps = {
  label: string;
  /** One line under the label saying what the choice is for. */
  hint?: string;
  options: readonly string[];
  active: string;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

export function ChipPicker({ label, hint, options, active, onSelect, colors }: ChipPickerProps) {
  return (
    <View className="mb-4">
      <ThemedText
        className="mb-2 text-[11px] font-black uppercase"
        style={{ color: `${colors.text}99` }}>
        {label}
      </ThemedText>
      {hint ? (
        <ThemedText className="-mt-1 mb-2 text-xs" style={{ color: `${colors.text}99` }}>
          {hint}
        </ThemedText>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pill
            key={option}
            label={option}
            selected={active === option}
            onPress={() => onSelect(option)}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}
