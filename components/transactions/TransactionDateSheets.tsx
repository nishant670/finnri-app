import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type DateSheetProps = {
  pendingDate: Date;
  onChangePendingDate: (date: Date) => void;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * The iOS date sheets opened from the composer. The sheet only mounts while it
 * is open, so the caller decides when (and on which platform) to render it, and
 * owns the pending date until the user confirms it.
 */

/** Date and time of the entry itself. */
export function TransactionDateTimeSheet({
  pendingDate,
  onChangePendingDate,
  onClose,
  onConfirm,
}: DateSheetProps) {
  const theme = useThemeTokens().colors;
  const accent = theme.accent;

  return (
    <AnimatedBottomSheet visible onClose={onClose} backdropOpacity={0.3}>
      <View className="rounded-t-3xl px-4 pb-6 pt-4" style={{ backgroundColor: theme.background }}>
        <ThemedText className="text-center text-sm font-bold">Date & time</ThemedText>
        <DateTimePicker
          value={pendingDate}
          mode="datetime"
          display="spinner"
          onValueChange={(_e, d) => d && onChangePendingDate(d)}
          onDismiss={onClose}
          style={{ width: '100%' }}
        />
        <View className="mt-4 flex-row gap-3">
          <Pressable
            className="flex-1 items-center rounded-2xl border py-3 border-gray-100"
            onPress={onClose}>
            <ThemedText>Cancel</ThemedText>
          </Pressable>
          <Pressable
            className="flex-1 items-center rounded-2xl py-3"
            style={{ backgroundColor: accent }}
            onPress={onConfirm}>
            <ThemedText tone="onAccent" className="font-bold">
              Done
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </AnimatedBottomSheet>
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
  const accent = theme.accent;

  return (
    <AnimatedBottomSheet visible onClose={onClose} backdropOpacity={0.3}>
      <View className="rounded-t-3xl px-4 pb-6 pt-4" style={{ backgroundColor: theme.background }}>
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
  const accent = theme.accent;

  return (
    <AnimatedBottomSheet visible onClose={onClose} backdropOpacity={0.3}>
      <View className="rounded-t-3xl px-4 pb-6 pt-4" style={{ backgroundColor: theme.background }}>
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
