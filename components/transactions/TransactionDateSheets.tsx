import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { LabelRow } from '@/components/ui/LabelRow';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { CalendarMonth, sameDay, withDay } from '@/components/ui/CalendarMonth';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatTime, rowTimeLabel, uses24HourClock } from '@/lib/datetime';

type TransactionDateSheetProps = {
  visible: boolean;
  /** The date and time being chosen, owned by the caller until Done. */
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * The entry's date and time (board R2-Date): Today and Yesterday as chips, a
 * month calendar in the app's own colours, the time on a row of its own, and
 * Done. It replaces the platform's spinner, which drew in system colours on
 * top of a themed sheet.
 *
 * On Android the time row opens the system clock dialog; on iOS it unfolds a
 * time wheel in place.
 */
export function TransactionDateSheet({
  visible,
  value,
  onChange,
  onClose,
  onConfirm,
}: TransactionDateSheetProps) {
  const { colors } = useThemeTokens();
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const [isTimeOpen, setIsTimeOpen] = useState(false);

  // Opening on another entry shows that entry's month, not the last one seen.
  useEffect(() => {
    if (!visible) return;
    setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setIsTimeOpen(false);
    // Only on open: following `value` would jump months under the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const pickDay = (day: Date) => {
    onChange(withDay(value, day));
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };
  const timeLabel = rowTimeLabel(formatTime(value) ?? '');

  const openTime = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: uses24HourClock(),
        onValueChange: (_event, time) => {
          if (time) onChange(withDay(time, value));
        },
        onDismiss: () => undefined,
      });
      return;
    }
    setIsTimeOpen((open) => !open);
  };

  return (
    <PickerSheet visible={visible} title="Date" onClose={onClose} maxBodyHeight={640}>
      <View style={styles.quickRow}>
        {[
          { label: 'Today', day: today },
          { label: 'Yesterday', day: yesterday },
        ].map(({ label, day }) => {
          const selected = sameDay(value, day);
          return (
            <PressableView
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => pickDay(day)}
              style={[
                styles.quickChip,
                {
                  backgroundColor: selected ? colors.selectedFill : colors.card,
                  borderColor: selected ? colors.selectedBorder : colors.border,
                },
              ]}
              pressedStyle={styles.pressed}>
              <ThemedText
                style={[styles.chipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
                {label}
              </ThemedText>
            </PressableView>
          );
        })}
      </View>

      <CalendarMonth value={value} onSelect={pickDay} month={month} onMonthChange={setMonth} />

      <View style={[styles.timeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <LabelRow label="Time" value={timeLabel} onPress={openTime} testID="date-sheet-time" />
        {isTimeOpen ? (
          <DateTimePicker
            value={value}
            mode="time"
            display="spinner"
            onValueChange={(_event, time) => time && onChange(withDay(time, value))}
            style={{ width: '100%' }}
          />
        ) : null}
      </View>

      <PrimaryButton label="Done" onPress={onConfirm} style={styles.done} />
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickChip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  timeCard: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  done: {
    marginTop: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
