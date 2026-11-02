import { LabelRow } from '@/components/ui/LabelRow';
import { RECURRING_LABEL_WIDTH } from '@/components/money/subscriptions/FormRows';
import { formatDueDateLabel } from '@/lib/subscription-form';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** A date as a row of a card: the label, the date with a calendar, a chevron. */
export function DateRow({
  label,
  value,
  onPress,
  divider = false,
  placeholder = 'Pick a date',
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onPress: () => void;
  divider?: boolean;
  placeholder?: string;
  /** The full name when the label is shortened to fit. */
  accessibilityLabel?: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <LabelRow
      label={label}
      value={value ? formatDueDateLabel(value) : placeholder}
      icon="calendar-blank-outline"
      iconColor={value ? colors.text : colors.muted}
      valueMuted={!value}
      divider={divider}
      labelWidth={RECURRING_LABEL_WIDTH}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
    />
  );
}
