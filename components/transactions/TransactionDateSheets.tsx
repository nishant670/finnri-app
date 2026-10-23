import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { LabelRow } from '@/components/ui/LabelRow';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { formatTime, rowTimeLabel, uses24HourClock } from '@/lib/datetime';

type DateSheetProps = {
  pendingDate: Date;
  onChangePendingDate: (date: Date) => void;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * The subscription date sheets below are iOS-only spinners: the sheet only
 * mounts while it is open, so the caller decides when (and on which platform)
 * to render it, and owns the pending date until the user confirms it.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** `day` at the time of day `time` already holds. */
const withDay = (time: Date, day: Date) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes());

/** The cells of a month: blanks up to the 1st's weekday, then each day. */
const monthCells = (month: Date): (Date | null)[] => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
};

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
  const monthLabel = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });
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

      <View style={[styles.calendar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.monthRow}>
          <ThemedText style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            style={styles.monthButton}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.week} importantForAccessibility="no-hide-descendants">
          {WEEKDAYS.map((weekday, index) => (
            <ThemedText key={index} tone="muted" style={styles.weekday}>
              {weekday}
            </ThemedText>
          ))}
        </View>
        <View accessibilityLabel={monthLabel} style={styles.days}>
          {monthCells(month).map((day, index) => {
            if (!day) return <View key={`blank-${index}`} style={styles.cell} />;
            const selected = sameDay(day, value);
            const isToday = sameDay(day, today);
            return (
              <Pressable
                key={day.getDate()}
                testID={`date-sheet-day-${day.getDate()}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${day.getDate()} ${day.toLocaleString('en-US', { month: 'long' })}${isToday ? ', today' : ''}`}
                onPress={() => pickDay(day)}
                style={styles.cell}>
                <View style={[styles.dayCircle, selected && { backgroundColor: colors.accent }]}>
                  <ThemedText
                    style={[
                      styles.dayLabel,
                      {
                        color: selected ? colors.onAccent : colors.text,
                        fontWeight: selected || isToday ? '700' : '400',
                      },
                    ]}>
                    {day.getDate()}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

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

/** When to be reminded to cancel a subscription. */
export function TransactionCancellationDateSheet({
  pendingDate,
  onChangePendingDate,
  onClose,
  onConfirm,
}: DateSheetProps) {
  const theme = useThemeTokens().colors;
  const sheetBottom = useBottomInset(24);
  const accent = theme.accent;

  return (
    <AnimatedBottomSheet visible onClose={onClose} backdropOpacity={0.3}>
      <View
        className="rounded-t-3xl px-4 pt-4"
        style={{ backgroundColor: theme.background, paddingBottom: sheetBottom }}>
        <ThemedText className="text-center text-sm font-bold">
          Cancellation reminder date
        </ThemedText>
        <DateTimePicker
          value={pendingDate}
          mode="date"
          display="spinner"
          minimumDate={new Date()}
          onValueChange={(_event, date) => date && onChangePendingDate(date)}
          onDismiss={onClose}
          style={{ width: '100%' }}
        />
        <Pressable
          className="mt-4 items-center rounded-2xl py-3"
          style={{ backgroundColor: accent }}
          onPress={onConfirm}>
          <ThemedText tone="onAccent" className="font-bold">
            Set reminder date
          </ThemedText>
        </Pressable>
      </View>
    </AnimatedBottomSheet>
  );
}

/** The next payment date of a subscription. */
export function TransactionSubscriptionDateSheet({
  pendingDate,
  onChangePendingDate,
  onClose,
  onConfirm,
}: DateSheetProps) {
  const theme = useThemeTokens().colors;
  const sheetBottom = useBottomInset(24);
  const accent = theme.accent;

  return (
    <AnimatedBottomSheet visible onClose={onClose} backdropOpacity={0.3}>
      <View
        className="rounded-t-3xl px-4 pt-4"
        style={{ backgroundColor: theme.background, paddingBottom: sheetBottom }}>
        <ThemedText className="text-center text-sm font-bold">Next payment date</ThemedText>
        <DateTimePicker
          value={pendingDate}
          mode="date"
          display="spinner"
          minimumDate={new Date()}
          onValueChange={(_event, date) => date && onChangePendingDate(date)}
          onDismiss={onClose}
          style={{ width: '100%' }}
        />
        <View className="mt-4 flex-row gap-3">
          <Pressable
            className="flex-1 items-center rounded-2xl border py-3"
            style={{ borderColor: theme.border }}
            onPress={onClose}>
            <ThemedText>Cancel</ThemedText>
          </Pressable>
          <Pressable
            className="flex-1 items-center rounded-2xl py-3"
            style={{ backgroundColor: accent }}
            onPress={onConfirm}>
            <ThemedText tone="onAccent" className="font-bold">
              Set date
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </AnimatedBottomSheet>
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
  calendar: {
    marginTop: 12,
    paddingTop: 4,
    paddingBottom: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  monthRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
  },
  monthLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  cell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
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
