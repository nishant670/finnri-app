import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The pill heights the redesign boards use, each with its own label size:
 * 36 for "+ Add" on a summary line, 40 for an empty state's Add, 44 inside a
 * card ("Settle up"), 48 for a screen's bottom bar, 50 for a sheet's Save.
 */
export type ButtonHeight = 36 | 40 | 44 | 48 | 50;

const LABEL_SIZE: Record<ButtonHeight, { fontSize: number; lineHeight: number }> = {
  36: { fontSize: 13, lineHeight: 18 },
  40: { fontSize: 14, lineHeight: 18 },
  44: { fontSize: 14, lineHeight: 18 },
  48: { fontSize: 15, lineHeight: 20 },
  50: { fontSize: 16, lineHeight: 20 },
};

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /**
   * `primary` is the accent fill — one per screen. `outline` is the card fill
   * with a `borderStrong` ring, for everything beside it.
   */
  variant?: 'primary' | 'outline';
  height?: ButtonHeight;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Shows a spinner in place of the icon and blocks presses; the label stays. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The redesign's pill button, in its two weights.
 *
 * Text on the primary fill is `onAccent`, which is dark on Finnri and Mint and
 * white on Sky and Plum (palette update, 11 Oct) — never a literal white.
 */
export function Button({
  label,
  variant = 'primary',
  height,
  icon,
  loading = false,
  disabled,
  style,
  accessibilityState,
  ...props
}: ButtonProps) {
  const { colors } = useThemeTokens();
  const primary = variant === 'primary';
  const size = height ?? (primary ? 50 : 36);
  const ink = primary ? colors.onAccent : colors.text;
  const iconSize = size >= 44 ? 18 : 16;
  const inactive = Boolean(disabled) || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), busy: loading, ...accessibilityState }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          height: size,
          borderRadius: size / 2,
          gap: size >= 48 ? 8 : 6,
          // The 36 pill is drawn tighter on the icon side, so "+ Add" sits
          // optically centred. The tall ones are usually stretched to share a
          // row ("Repeat for today" beside "Edit"), where the boards give the
          // label all the width they can.
          paddingLeft: size === 36 ? (icon ? 10 : 14) : size === 40 ? 16 : 12,
          paddingRight: size === 36 ? 14 : size === 40 ? 16 : 12,
          backgroundColor: primary ? colors.accent : colors.card,
          borderColor: primary ? colors.accent : colors.borderStrong,
          opacity: disabled && !loading ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={iconSize} color={ink} />
      ) : null}
      <ThemedText
        numberOfLines={1}
        style={[LABEL_SIZE[size], { color: ink, fontWeight: primary ? '700' : '600' }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** The sheet's or screen's one accent action: 50 tall, 16/700 on the accent. */
export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
