import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import {
  CalendarMonth,
  isDayAllowed,
  sameDay,
  startOfMonth,
  withDay,
} from '@/components/ui/CalendarMonth';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type PickDateOptions = {
  /** The date already set; the calendar opens on its month. */
  value?: Date | null;
  /** The sheet's title: "Start date", "Due date". Defaults to "Date". */
  title?: string;
  minimumDate?: Date | null;
  maximumDate?: Date | null;
};

type DatePickerContextValue = {
  /**
   * Resolves with the chosen day (at `value`'s time of day, as the platform
   * picker did), or null when the sheet is closed without choosing.
   */
  pickDate: (options?: PickDateOptions) => Promise<Date | null>;
};

/** Exported for the test setup's bare-render fallback; screens use `useDatePicker`. */
export const DatePickerContext = createContext<DatePickerContextValue | null>(null);

type Request = PickDateOptions & { resolve: (date: Date | null) => void };

/**
 * One themed date picker for the whole app, the way `AppDialogProvider` is
 * one themed dialog.
 *
 * Every date that is not a transaction's own opened the platform picker: on
 * Android a teal Material dialog, on iOS a grey spinner, on top of sheets that
 * are otherwise entirely Finnri's. `await pickDate(...)` is as short as the
 * `DateTimePickerAndroid.open(...)` it replaces, so the themed path is also
 * the easy one, and the calendar is the same `CalendarMonth` the
 * transaction's Date sheet draws.
 */
export function DatePickerProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [pending, setPending] = useState<Date | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const requestRef = useRef<Request | null>(null);

  const finish = useCallback((date: Date | null) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(date);
  }, []);

  const pickDate = useCallback((options: PickDateOptions = {}) => {
    // A second request replaces the first; the first resolves as cancelled.
    requestRef.current?.resolve(null);
    return new Promise<Date | null>((resolve) => {
      const next: Request = { ...options, resolve };
      requestRef.current = next;
      const value = options.value ?? null;
      setPending(value);
      setMonth(startOfMonth(value ?? options.maximumDate ?? new Date()));
      setRequest(next);
    });
  }, []);

  const contextValue = useMemo(() => ({ pickDate }), [pickDate]);

  return (
    <DatePickerContext.Provider value={contextValue}>
      {children}
      <DatePickerSheet
        request={request}
        pending={pending}
        month={month}
        onMonthChange={setMonth}
        onPick={(day) => {
          setPending(withDay(request?.value ?? new Date(), day));
          setMonth(startOfMonth(day));
        }}
        onClose={() => finish(null)}
        onDone={() => finish(pending)}
      />
    </DatePickerContext.Provider>
  );
}

export function useDatePicker(): DatePickerContextValue {
  const context = useContext(DatePickerContext);
  if (!context) {
    throw new Error('useDatePicker must be used inside DatePickerProvider');
  }
  return context;
}

type DatePickerSheetProps = {
  request: Request | null;
  pending: Date | null;
  month: Date;
  onMonthChange: (month: Date) => void;
  onPick: (day: Date) => void;
  onClose: () => void;
  onDone: () => void;
};

function DatePickerSheet({
  request,
  pending,
  month,
  onMonthChange,
  onPick,
  onClose,
  onDone,
}: DatePickerSheetProps) {
  const { colors } = useThemeTokens();
  const minimumDate = request?.minimumDate ?? null;
  const maximumDate = request?.maximumDate ?? null;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  // A future-only date (a due date) offers Tomorrow; anything else Yesterday.
  const futureOnly = Boolean(minimumDate && isDayAllowed(today, minimumDate) && !isDayAllowed(yesterday, minimumDate));
  const quickPicks = [
    { label: 'Today', day: today },
    futureOnly ? { label: 'Tomorrow', day: tomorrow } : { label: 'Yesterday', day: yesterday },
  ].filter(({ day }) => isDayAllowed(day, minimumDate, maximumDate));

  return (
    <PickerSheet
      visible={Boolean(request)}
      title={request?.title ?? 'Date'}
      onClose={onClose}
      maxBodyHeight={640}>
      {quickPicks.length > 0 ? (
        <View style={styles.quickRow}>
          {quickPicks.map(({ label, day }) => {
            const selected = pending ? sameDay(pending, day) : false;
            return (
              <PressableView
                key={label}
                testID={`date-picker-quick-${label.toLowerCase()}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onPick(day)}
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
      ) : null}

      <CalendarMonth
        value={pending}
        onSelect={onPick}
        month={month}
        onMonthChange={onMonthChange}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        testIDPrefix="date-picker-day"
      />

      <PrimaryButton
        testID="date-picker-done"
        label="Done"
        disabled={!pending}
        onPress={onDone}
        style={styles.done}
      />
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
  done: {
    marginTop: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
