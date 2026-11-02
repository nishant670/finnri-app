import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, StyleSheet, View } from 'react-native';

import { PressableView } from '@/components/ui/PressableView';
import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';

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

/**
 * The iOS date sheet for the next payment, start and cancellation-reminder
 * dates, framed like the redesign's sheets: the handle, then Cancel, the
 * title and Done in ink.
 */
export function SubscriptionDatePickerModal({
  visible,
  target: datePickerTarget,
  pendingDate,
  onChangePendingDate,
  onClose,
  onDone,
  colors,
}: SubscriptionDatePickerModalProps) {
  const title =
    datePickerTarget === 'cancel'
      ? 'Cancellation reminder'
      : datePickerTarget === 'start'
        ? 'Started on'
        : 'Next payment on';
  const bottomInset = useBottomInset(24);
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: bottomInset }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.header}>
            <PressableView accessibilityRole="button" onPress={onClose} style={styles.action} pressedStyle={styles.pressed}>
              <ThemedText tone="muted" style={styles.actionLabel}>
                Cancel
              </ThemedText>
            </PressableView>
            <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {title}
            </ThemedText>
            <PressableView accessibilityRole="button" onPress={onDone} style={styles.action} pressedStyle={styles.pressed}>
              <ThemedText style={[styles.actionLabel, styles.done, { color: colors.text }]}>Done</ThemedText>
            </PressableView>
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

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    paddingHorizontal: 16,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  action: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  done: {
    textAlign: 'right',
    fontWeight: '700',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
