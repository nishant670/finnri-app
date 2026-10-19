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
  /**
   * A value the AI was unsure of (board R2-Draft): the row turns amber, its
   * label goes warning-bold, and a "Check" tag sits before the chevron until
   * the field has been looked at.
   */
  flagged?: boolean;
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
  flagged = false,
}: LabelRowProps) {
  const { colors } = useThemeTokens();
  const content = (
    <>
      <ThemedText
        tone={flagged ? 'warning' : 'muted'}
        numberOfLines={1}
        style={[styles.label, flagged && styles.labelFlagged]}>
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
      {flagged ? <CheckTag /> : null}
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
    divider
      ? { borderTopWidth: 1, borderTopColor: flagged ? colors.warningBorder : colors.border }
      : undefined,
    flagged ? { backgroundColor: colors.warningSurface } : undefined,
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
      accessibilityHint={flagged ? 'Finnri was not sure about this. Check it.' : undefined}
      onPress={onPress}
      style={rowStyle}
      pressedStyle={{ opacity: 0.7 }}>
      {content}
    </PressableView>
  );
}

/** The amber "Check" tag on a field the AI was unsure of. */
export function CheckTag() {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.checkTag, { backgroundColor: withAlpha(colors.warning, 0.14) }]}>
      <ThemedText tone="warning" style={styles.checkTagLabel}>
        Check
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  checkTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  checkTagLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  labelFlagged: {
    fontWeight: '700',
  },
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
