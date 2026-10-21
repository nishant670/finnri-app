import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

export type SegmentOption<Key extends string> = {
  key: Key;
  label: string;
  /**
   * A dot on the segment, for "there is something in here you have not seen".
   *
   * Deliberately a boolean rather than a count: a segment is a place to go, and
   * the number of things waiting inside it is what the place itself is for.
   * Whoever sets this owns the harder half — a dot driven by "anything
   * happened" never goes out, so it has to be driven by something the user can
   * actually clear.
   */
  badge?: boolean;
  testID?: string;
};

type SegmentsProps<Key extends string> = {
  active: Key;
  /** Two to four. The parts share the width equally, so more would not fit. */
  options: readonly SegmentOption<Key>[];
  onChange: (key: Key) => void;
  /** Placement only — margins and width. The control draws its own track. */
  style?: StyleProp<ViewStyle>;
  /** The transaction form's Expense · Income draws its labels at 14 (board R2-Entry). */
  labelSize?: 13 | 14;
};

/**
 * The fixed segmented control (boards R5-*, R6-*): a 40-tall track in the
 * mood's groove colour, split into equal parts, with the selected part lifted
 * onto a card-coloured pill.
 *
 * It replaced a scrolling row of chips. With four sections or fewer every
 * label fits at once, so nothing hides off the edge, and the selected part is
 * marked by the pill and bolder ink rather than by accent text — accent is not
 * a text colour on a light surface.
 */
export function Segments<Key extends string>({
  active,
  options,
  onChange,
  style,
  labelSize = 13,
}: SegmentsProps<Key>) {
  const theme = useThemeTokens();
  const { colors } = theme;

  return (
    <View accessibilityRole="tablist" style={[styles.track, { backgroundColor: colors.track }, style]}>
      {options.map((option) => {
        const selected = option.key === active;
        return (
          <Pressable
            key={option.key}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.badge ? `${option.label}, new items` : option.label}
            onPress={() => {
              haptics.select();
              onChange(option.key);
            }}
            style={[
              styles.part,
              selected && [
                { backgroundColor: colors.trackSelected },
                // The boards lift the pill with a hairline shadow in light mode
                // and draw it flat in dark, where a shadow does not read.
                theme.mode === 'light'
                  ? [styles.lifted, { shadowColor: colors.shadow }]
                  : undefined,
              ],
            ]}>
            <ThemedText
              numberOfLines={1}
              tone={selected ? 'default' : 'muted'}
              style={[styles.label, { fontSize: labelSize, fontWeight: selected ? '700' : '500' }]}>
              {option.label}
            </ThemedText>
            {option.badge ? (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={[styles.badge, { backgroundColor: colors.negative }]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 40,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 20,
  },
  part: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 17,
  },
  lifted: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
