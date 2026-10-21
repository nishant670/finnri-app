import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { LabelRow } from '@/components/ui/LabelRow';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

/**
 * The recurring sheet's rows (board R5-NewLoan): one card of 48-tall rows,
 * the field's name in a 96-wide column on the left. The board draws only the
 * sheet's first screen; the folds under it are drawn with these same rows.
 */
export const RECURRING_LABEL_WIDTH = 96;

/** A card holding rows; each row after the first passes `divider`. */
export function RowsCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

/** A muted line under a card, saying what its rows are for. */
export function RowsNote({ children }: { children: ReactNode }) {
  return (
    <ThemedText tone="muted" style={styles.note}>
      {children}
    </ThemedText>
  );
}

type InputRowProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  /** Before the input: "₹". */
  prefix?: string;
  /** After the input: "% a year". */
  suffix?: string;
  multiline?: boolean;
  divider?: boolean;
  autoFocus?: boolean;
  /** The field's full name when the label is shortened to fit: "EMIs already paid". */
  accessibilityLabel?: string;
  testID?: string;
};

/** A text field as a row: the name on the left, the input filling the rest. */
export function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  prefix,
  suffix,
  multiline = false,
  divider = false,
  autoFocus = false,
  accessibilityLabel,
  testID,
}: InputRowProps) {
  const { colors } = useThemeTokens();
  return (
    <LabelRow label={label} divider={divider} labelWidth={RECURRING_LABEL_WIDTH}>
      {prefix ? <ThemedText style={[styles.affix, { color: colors.muted }]}>{prefix}</ThemedText> : null}
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        autoFocus={autoFocus}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, { color: colors.text }]}
      />
      {suffix ? <ThemedText style={[styles.affix, { color: colors.muted }]}>{suffix}</ThemedText> : null}
    </LabelRow>
  );
}

type ToggleRowProps = {
  title: string;
  caption?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  divider?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/** A setting that is on or off: title and caption, the switch on the right. The whole row toggles. */
export function ToggleRow({
  title,
  caption,
  value,
  onValueChange,
  divider = false,
  accessibilityLabel,
  testID,
}: ToggleRowProps) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={() => {
        haptics.toggle(!value);
        onValueChange(!value);
      }}
      style={[styles.toggle, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <View style={styles.toggleText}>
        <ThemedText style={[styles.toggleTitle, { color: colors.text }]}>{title}</ThemedText>
        {caption ? (
          <ThemedText tone="muted" style={styles.toggleCaption}>
            {caption}
          </ThemedText>
        ) : null}
      </View>
      {/* The row is the control screen readers announce; the switch only shows its state. */}
      <HapticSwitch
        value={value}
        onValueChange={onValueChange}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </PressableView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  note: {
    marginTop: 6,
    marginHorizontal: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  affix: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    padding: 0,
    fontSize: 14,
  },
  multiline: {
    paddingVertical: 14,
    textAlignVertical: 'top',
  },
  toggle: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  toggleCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
