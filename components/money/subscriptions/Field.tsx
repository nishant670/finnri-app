import { TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  autoFocus?: boolean;
};

export function Field({
  label,
  value,
  onChangeText,
  colors,
  placeholder,
  keyboardType = 'default',
  autoFocus = false,
}: FieldProps) {
  return (
    <View className="mb-3">
      <ThemedText
        className="mb-1 text-[11px] font-black uppercase"
        style={{ color: `${colors.text}99` }}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={`${colors.text}66`}
        autoFocus={autoFocus}
        className="h-12 rounded-2xl border px-4 text-sm"
        style={{
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.background,
        }}
      />
    </View>
  );
}
