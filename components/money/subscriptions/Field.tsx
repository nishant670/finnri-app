import { StyleSheet, TextInput, View } from 'react-native';

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

/** A labelled 48dp input on the card, as the redesign's sheets draw them. */
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
      <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
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
  label: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 14,
    fontSize: 15,
  },
});
