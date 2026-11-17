import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Ref } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useDatePicker } from '@/components/ui/DatePickerProvider';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { toAmount } from '@/lib/money';
import { formatDateLabel, parseDateLabel } from '@/lib/transactions';

type TransactionRefundFieldsProps = {
  refundableAmount: string;
  /** The payment's amount, offered as one tap when there is one. */
  fullAmount?: string;
  amountInputRef?: Ref<TextInput>;
  expectedOn: string;
  reminderEnabled: boolean;
  onChangeAmount: (value: string) => void;
  onChangeExpectedOn: (value: string) => void;
  onToggleReminder: () => void;
};

/** The refund tracking card, shown when a personal payment is tagged Refundable. */
export function TransactionRefundFields({
  refundableAmount,
  fullAmount = '',
  amountInputRef,
  expectedOn,
  reminderEnabled,
  onChangeAmount,
  onChangeExpectedOn,
  onToggleReminder,
}: TransactionRefundFieldsProps) {
  const { pickDate } = useDatePicker();
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const detailInputPlaceholderColor =
    themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';
  const canUseFull = toAmount(fullAmount) > 0;
  const isFull = canUseFull && toAmount(refundableAmount) === toAmount(fullAmount);

  return (
    <View className="px-4 mt-2">
      <View
        className="rounded-2xl border p-4"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-center gap-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: accentSurface }}>
            <MaterialCommunityIcons name="cash-refund" size={20} color={accent} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
              Refund tracking
            </ThemedText>
            <ThemedText tone="muted" className="text-xs">
              Track the part of this payment expected back.
            </ThemedText>
          </View>
        </View>
        <View className="mt-4 gap-3">
          <View className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <ThemedText
              tone="muted"
              className="mb-2 text-[10px] font-black uppercase tracking-widest">
              How much is refundable?
            </ThemedText>
            <View className="flex-row items-center gap-3">
              <TextInput
                ref={amountInputRef}
                testID="refund-amount-input"
                accessibilityLabel="How much is refundable?"
                value={refundableAmount}
                onChangeText={(text) => onChangeAmount(text)}
                placeholder="Enter amount"
                placeholderTextColor={detailInputPlaceholderColor}
                keyboardType="decimal-pad"
                className="flex-1 p-0 text-sm font-bold"
                style={{ color: theme.text }}
              />
              {canUseFull ? (
                <PressableView
                  testID="refund-full-amount"
                  accessibilityRole="button"
                  accessibilityState={{ selected: isFull }}
                  accessibilityLabel="Make the full amount refundable"
                  hitSlop={6}
                  onPress={() => onChangeAmount(fullAmount)}
                  style={{
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: isFull ? theme.selectedFill : theme.card,
                    borderColor: isFull ? theme.selectedBorder : theme.border,
                  }}
                  pressedStyle={{ opacity: 0.7 }}>
                  <ThemedText className="text-xs font-bold" style={{ color: theme.text }}>
                    Full amount
                  </ThemedText>
                </PressableView>
              ) : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              const selected = await pickDate({
                title: 'Expected back',
                value: parseDateLabel(expectedOn) ?? new Date(),
              });
              if (selected) onChangeExpectedOn(formatDateLabel(selected));
            }}
            className="flex-row items-center justify-between rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
            <View>
              <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
                Expected back
              </ThemedText>
              <ThemedText className="mt-1 text-sm font-bold" style={{ color: theme.text }}>
                {expectedOn || 'Choose a date'}
              </ThemedText>
            </View>
            <MaterialCommunityIcons name="calendar-outline" size={20} color={accent} />
          </Pressable>
          <View
            className="flex-row items-center justify-between rounded-2xl border p-3"
            style={{ borderColor: theme.border }}>
            <View className="flex-1 pr-3">
              <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                Remind me
              </ThemedText>
              <ThemedText tone="muted" className="text-xs">
                Notify me on the expected date.
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: reminderEnabled }}
              onPress={() => onToggleReminder()}
              className="h-8 w-14 justify-center rounded-full px-1"
              style={{
                backgroundColor: reminderEnabled ? accent : '#E5E7EB',
              }}>
              <View
                className="h-6 w-6 rounded-full bg-white"
                style={{
                  alignSelf: reminderEnabled ? 'flex-end' : 'flex-start',
                }}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
