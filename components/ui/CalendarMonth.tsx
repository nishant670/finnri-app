import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * Finnri's one month calendar (board R2-Date), in the app's own colours.
 *
 * It began inside the transaction's Date sheet. Every other date in the app
 * still opened the platform dialog (Android's teal header, Material type), so
 * a themed form ended on a stock box. Every date picker now draws this grid:
 * the transaction's Date sheet directly, everything else through
 * `useDatePicker()`.
 *
 * The month on show is the caller's (`month` / `onMonthChange`), so picking
 * "Yesterday" across a month boundary can turn the page with it.
 */

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** `day` at the time of day `time` already holds. */
export const withDay = (time: Date, day: Date) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes());

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** The cells of a month: blanks up to the 1st's weekday, then each day. */
export const monthCells = (month: Date): (Date | null)[] => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
};

/** Whether `day` falls inside the allowed range (whole days, inclusive). */
export const isDayAllowed = (day: Date, minimumDate?: Date | null, maximumDate?: Date | null) => {
  const time = startOfDay(day).getTime();
  if (minimumDate && time < startOfDay(minimumDate).getTime()) return false;
  if (maximumDate && time > startOfDay(maximumDate).getTime()) return false;
  return true;
};

type CalendarMonthProps = {
  /** The chosen day, or null when nothing is chosen yet. */
  value: Date | null;
  onSelect: (day: Date) => void;
  month: Date;
  onMonthChange: (month: Date) => void;
  minimumDate?: Date | null;
  maximumDate?: Date | null;
  testIDPrefix?: string;
};

export function CalendarMonth({
  value,
  onSelect,
  month,
  onMonthChange,
  minimumDate,
  maximumDate,
  testIDPrefix = 'date-sheet-day',
}: CalendarMonthProps) {
  const { colors } = useThemeTokens();
  const today = new Date();
  const monthLabel = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const previous = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  // A month entirely outside the range is not worth turning to.
  const canGoBack = !minimumDate || startOfMonth(minimumDate).getTime() <= previous.getTime();
  const canGoForward = !maximumDate || startOfMonth(maximumDate).getTime() >= next.getTime();

  return (
    <View style={[styles.calendar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.monthRow}>
        <ThemedText style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: !canGoBack }}
          disabled={!canGoBack}
          onPress={() => onMonthChange(previous)}
          style={[styles.monthButton, !canGoBack && styles.disabled]}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: !canGoForward }}
          disabled={!canGoForward}
          onPress={() => onMonthChange(next)}
          style={[styles.monthButton, !canGoForward && styles.disabled]}>
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
          const selected = value ? sameDay(day, value) : false;
          const isToday = sameDay(day, today);
          const allowed = isDayAllowed(day, minimumDate, maximumDate);
          return (
            <Pressable
              key={day.getDate()}
              testID={`${testIDPrefix}-${day.getDate()}`}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !allowed }}
              accessibilityLabel={`${day.getDate()} ${day.toLocaleString('en-US', { month: 'long' })}${isToday ? ', today' : ''}`}
              disabled={!allowed}
              onPress={() => onSelect(day)}
              style={styles.cell}>
              <View
                style={[
                  styles.dayCircle,
                  selected && { backgroundColor: colors.accent },
                  // Today is ringed when it is not the pick, so "where am I"
                  // reads at a glance in any month.
                  !selected && isToday && { borderWidth: 1, borderColor: colors.borderStrong },
                ]}>
                <ThemedText
                  style={[
                    styles.dayLabel,
                    {
                      color: selected ? colors.onAccent : colors.text,
                      fontWeight: selected || isToday ? '700' : '400',
                    },
                    !allowed && styles.disabled,
                  ]}>
                  {day.getDate()}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  disabled: {
    opacity: 0.3,
  },
});
