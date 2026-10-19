import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type LabelRowProps = {
  /** The field's name, in the left column: "Category", "Paid via". */
  label: string;
  /** The field's value. Ignored when `children` is given. */
  value?: string;
  /** A 16 glyph in front of the value. */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** The glyph's colour; the caption colour unless the value has its own hue. */
  iconColor?: string;
  /** A muted aside after the value — "· no account linked". */
  detail?: string;
  /**
   * Makes the row a button with a chevron, for a field that opens a picker.
   * Without it the row is read-only, as on the detail screen.
   */
  onPress?: () => void;
  /** Draws the 1dp rule above the row: every row in a card but the first. */
  divider?: boolean;
  /** Replaces the value, for a field that is not just text (the date chips). */
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
};

/** The label column, from the boards: 84 wide, then a 10 gap. */
const LABEL_WIDTH = 84;

/**
 * One field as a 48-tall row: name on the left, value with its icon, and a
 * chevron when it opens something (boards R2-Entry, R4-Detail).
 *
 * The same row serves the form and the read-only detail screen, so the two
 * line up when one replaces the other. A read-only screen hides a row whose
 * value is empty rather than drawing it blank.
 */
export function LabelRow({
  label,
  value,
  icon,
  iconColor,
  detail,
  onPress,
  divider = false,
  children,
  testID,
  accessibilityLabel,
}: LabelRowProps) {
  const { colors } = useThemeTokens();
  const content = (
    <>
      <ThemedText tone="muted" numberOfLines={1} style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.value}>
        {children ?? (
          <>
            {icon ? (
              <MaterialCommunityIcons name={icon} size={16} color={iconColor ?? colors.muted} />
            ) : null}
            <ThemedText numberOfLines={1} style={[styles.valueText, { color: colors.text }]}>
              {value}
              {detail ? (
                <ThemedText tone="muted" style={styles.detail}>
                  {` ${detail}`}
                </ThemedText>
              ) : null}
            </ThemedText>
          </>
        )}
      </View>
      {onPress ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={16}
          color={withAlpha(colors.text, 0.6)}
        />
      ) : null}
    </>
  );
  const rowStyle = [
    styles.row,
    onPress ? styles.rowPressable : undefined,
    divider ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined,
  ];

  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} style={rowStyle}>
        {content}
      </View>
    );
  }

  return (
    <PressableView
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      onPress={onPress}
      style={rowStyle}
      pressedStyle={{ opacity: 0.7 }}>
      {content}
    </PressableView>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  rowPressable: {
    paddingRight: 10,
  },
  label: {
    width: LABEL_WIDTH,
    fontSize: 13,
    lineHeight: 18,
  },
  value: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  detail: {
    fontSize: 12,
    fontWeight: '400',
  },
});
