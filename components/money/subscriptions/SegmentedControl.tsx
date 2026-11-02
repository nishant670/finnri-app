import { Pressable, StyleSheet, View } from 'react-native';

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

/**
 * A labelled choice of a few values, drawn like the redesign's segmented
 * control: the groove in the track colour, the chosen part lifted onto the
 * card in bold ink.
 */
export function SegmentedControl<T extends string>({
  label,
  values,
  active,
  onSelect,
  colors,
  columns,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.wrap}>
      <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
      <View style={[styles.track, columns ? styles.wrapRow : null, { backgroundColor: colors.track }]}>
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
              style={[
                styles.part,
                columns ? { width: `${100 / columns}%` as const } : styles.flex,
                selected && { backgroundColor: colors.trackSelected },
              ]}>
              <ThemedText
                numberOfLines={1}
                style={[
                  styles.partLabel,
                  { color: selected ? colors.text : colors.muted, fontWeight: selected ? '700' : '500' },
                ]}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 18,
  },
  wrapRow: {
    flexWrap: 'wrap',
  },
  flex: {
    flex: 1,
  },
  part: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 15,
  },
  partLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
});
