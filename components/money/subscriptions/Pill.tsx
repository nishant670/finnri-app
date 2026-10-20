import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

/** A choice chip (board R5-NewLoan): tinted, ringed and bold when chosen; ink, never accent text. */
export function Pill({ label, selected, onPress, colors }: PillProps) {
  return (
    <PressableView
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? colors.selectedFill : colors.card,
          borderColor: selected ? colors.selectedBorder : colors.border,
        },
      ]}
      pressedStyle={styles.pressed}>
      <ThemedText style={[styles.label, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
        {label}
      </ThemedText>
    </PressableView>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
