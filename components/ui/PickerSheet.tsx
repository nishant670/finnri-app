import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PressableView } from '@/components/ui/PressableView';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type PickerSheetProps = {
  visible: boolean;
  /** Says what is being picked, on the left: "Category", "Paid via". */
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Caps the scrolling body, for lists that can outgrow the screen. */
  maxBodyHeight?: number;
  avoidKeyboard?: boolean;
};

/**
 * The frame every picker opened from the transaction form shares (boards
 * R2-Category, R2-Payment, R2-Date): a handle, the title on the left, the
 * round × on the right, then the choices.
 */
export function PickerSheet({
  visible,
  title,
  onClose,
  children,
  maxBodyHeight = 520,
  avoidKeyboard = false,
}: PickerSheetProps) {
  const { colors } = useThemeTokens();

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={onClose}
      backdropOpacity={0.3}
      avoidKeyboard={avoidKeyboard}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.header}>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>
          <SheetCloseButton onPress={onClose} />
        </View>
        <ScrollView
          style={{ maxHeight: maxBodyHeight }}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );
}

export type PickerOption = {
  key: string;
  label: string;
  /** A muted second line — an account's provider. */
  caption?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  testID?: string;
};

type PickerOptionListProps = {
  options: readonly PickerOption[];
  selectedKey: string | null | undefined;
  onSelect: (key: string) => void;
  accessibilityLabel: string;
};

/**
 * One card of 52dp rows (board R2-Payment). The chosen row is tinted, bold,
 * and ticked — never accent text.
 */
export function PickerOptionList({
  options,
  selectedKey,
  onSelect,
  accessibilityLabel,
}: PickerOptionListProps) {
  const { colors } = useThemeTokens();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {options.map((option, index) => {
        const selected = option.key === selectedKey;
        return (
          <PressableView
            key={option.key}
            testID={option.testID}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.key)}
            style={[
              styles.option,
              index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
              selected && { backgroundColor: colors.selectedFill },
            ]}
            pressedStyle={styles.pressed}>
            {option.icon ? (
              <MaterialCommunityIcons name={option.icon} size={20} color={colors.text} />
            ) : null}
            <View style={styles.optionText}>
              <ThemedText
                numberOfLines={1}
                style={[styles.optionLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
                {option.label}
              </ThemedText>
              {option.caption ? (
                <ThemedText tone="muted" numberOfLines={1} style={styles.optionCaption}>
                  {option.caption}
                </ThemedText>
              ) : null}
            </View>
            {selected ? <MaterialCommunityIcons name="check" size={20} color={colors.text} /> : null}
          </PressableView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
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
    paddingLeft: 20,
    paddingRight: 8,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    paddingTop: 4,
    paddingHorizontal: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  optionCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
