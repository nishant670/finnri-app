import { StyleSheet, TextInput, View } from 'react-native';

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

/**
 * The sheet's name field (board R5-NewLoan): a 48dp input on the card with
 * only its placeholder — "Car loan, home loan, iPhone EMI" says what to type.
 * The label is what a screen reader announces.
 */
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
    <View style={styles.field}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        autoFocus={autoFocus}
        style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 12,
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 15,
  },
});
