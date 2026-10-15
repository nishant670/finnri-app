import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatDateLabel, parseDateLabel } from '@/lib/transactions';

type TransactionRefundFieldsProps = {
  refundableAmount: string;
  expectedOn: string;
  reminderEnabled: boolean;
  /** iOS shows the date as an inline picker; the parent owns whether it is open. */
  isPickerVisible: boolean;
  onChangeAmount: (value: string) => void;
  onChangeExpectedOn: (value: string) => void;
  onToggleReminder: () => void;
  onChangePickerVisible: (visible: boolean) => void;
};

/** The refund tracking card, shown when a personal payment is tagged Refundable. */
export function TransactionRefundFields({
  refundableAmount,
  expectedOn,
  reminderEnabled,
  isPickerVisible,
  onChangeAmount,
  onChangeExpectedOn,
  onToggleReminder,
  onChangePickerVisible,
}: TransactionRefundFieldsProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const detailInputPlaceholderColor =
    themeTokens.mode === 'dark' ? 'rgba(255,255,255,0.45)' : '#9CA3AF';

  return (
    <View className="px-5 mb-6">
      <View
        className="rounded-[24px] border p-4"
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
            <TextInput
              value={refundableAmount}
              onChangeText={(text) => onChangeAmount(text)}
              placeholder="5,000"
              placeholderTextColor={detailInputPlaceholderColor}
              keyboardType="decimal-pad"
              className="p-0 text-sm font-bold"
              style={{ color: theme.text }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const current = parseDateLabel(expectedOn) ?? new Date();
              if (Platform.OS === 'android') {
                DateTimePickerAndroid.open({
                  value: current,
                  mode: 'date',
                  onValueChange: (_event, selected) => {
                    if (selected) onChangeExpectedOn(formatDateLabel(selected));
                  },
                  onDismiss: () => undefined,
                });
              } else {
                onChangePickerVisible(true);
              }
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
          {isPickerVisible && Platform.OS !== 'android' ? (
            <DateTimePicker
              value={parseDateLabel(expectedOn) ?? new Date()}
              mode="date"
              display="inline"
              onChange={(_event, selected) => {
                if (selected) onChangeExpectedOn(formatDateLabel(selected));
                onChangePickerVisible(false);
              }}
            />
          ) : null}
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
