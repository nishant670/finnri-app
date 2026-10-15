import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { ReceiptPhotoSource } from '@/lib/receipt-photo';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type ReceiptSourceSheetProps = {
  visible: boolean;
  onChoose: (source: ReceiptPhotoSource) => void;
  onClose: () => void;
};

const OPTIONS: { source: ReceiptPhotoSource; icon: IconName; label: string; hint: string }[] = [
  {
    source: 'camera',
    icon: 'camera-outline',
    label: 'Take a photo',
    hint: 'Of the bill in your hand',
  },
  {
    source: 'library',
    icon: 'image-outline',
    label: 'Choose a photo',
    hint: 'A bill or payment screenshot you already have',
  },
];

/**
 * "Scan a bill" asks where the photo comes from before anything opens.
 *
 * A native fade, not a Reanimated slide: this sheet opens straight before the
 * camera or photo picker takes over the screen, and a JS-driven animation is
 * exactly what got frozen part-way when the app was paused for the picker.
 */
export function ReceiptSourceSheet({ visible, onChoose, onClose }: ReceiptSourceSheetProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const isDark = theme.mode === 'dark';
  const muted = isDark ? 'rgba(255,255,255,0.58)' : '#6B7280';

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          testID="receipt-source-sheet"
          style={[
            styles.sheet,
            theme.shadows.soft,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <ThemedText style={[styles.title, { color: colors.text }]}>Scan a bill</ThemedText>
          <ThemedText style={[styles.subtitle, { color: muted }]}>
            Finnri reads the total, date and shop, and you check them before saving. It uses AI
            credits only when it finds a total.
          </ThemedText>

          <View style={styles.options}>
            {OPTIONS.map((option) => (
              <PressableView
                key={option.source}
                testID={`receipt-source-${option.source}`}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityHint={option.hint}
                onPress={() => onChoose(option.source)}
                style={[
                  styles.option,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
                    borderColor: colors.border,
                  },
                ]}
                pressedStyle={styles.pressed}>
                <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialCommunityIcons name={option.icon} size={22} color={colors.accent} />
                </View>
                <View style={styles.optionText}>
                  <ThemedText style={[styles.optionLabel, { color: colors.text }]}>
                    {option.label}
                  </ThemedText>
                  <ThemedText style={[styles.optionHint, { color: muted }]}>
                    {option.hint}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={muted} />
              </PressableView>
            ))}
          </View>

          <PressableView
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancel}
            pressedStyle={styles.cancelPressed}>
            <ThemedText style={[styles.cancelLabel, { color: muted }]}>Cancel</ThemedText>
          </PressableView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 6,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  options: {
    gap: 10,
    marginTop: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  optionHint: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.72,
  },
  cancelPressed: {
    opacity: 0.6,
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
