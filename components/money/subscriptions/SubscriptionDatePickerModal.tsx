import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Pressable, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SubscriptionDatePickerModalProps = {
  visible: boolean;
  target: 'due' | 'cancel' | 'start';
  pendingDate: Date;
  onChangePendingDate: (date: Date) => void;
  onClose: () => void;
  onDone: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
};

/** The iOS date sheet for the next payment, start and cancellation-reminder dates. */
export function SubscriptionDatePickerModal({
  visible,
  target: datePickerTarget,
  pendingDate,
  onChangePendingDate,
  onClose,
  onDone,
  colors,
  muted,
}: SubscriptionDatePickerModalProps) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="rounded-t-[28px] p-5" style={{ backgroundColor: colors.card }}>
          <View className="mb-4 flex-row items-center justify-between">
            <Pressable onPress={onClose}>
              <ThemedText className="text-sm font-black" style={{ color: muted }}>
                Cancel
              </ThemedText>
            </Pressable>
            <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
              {datePickerTarget === 'cancel'
                ? 'Cancellation reminder'
                : datePickerTarget === 'start'
                  ? 'Started on'
                  : 'Next payment on'}
            </ThemedText>
            <Pressable onPress={onDone}>
              <ThemedText className="text-sm font-black" style={{ color: colors.accent }}>
                Done
              </ThemedText>
            </Pressable>
          </View>
          <DateTimePicker
            value={pendingDate}
            mode="date"
            display="spinner"
            // A loan or SIP started in the past; only upcoming dates are bounded.
            minimumDate={datePickerTarget === 'start' ? undefined : new Date()}
            onValueChange={(_, selectedDate) => {
              if (selectedDate) onChangePendingDate(selectedDate);
            }}
            onDismiss={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}
