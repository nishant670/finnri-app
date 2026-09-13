import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import { SPLIT_BILL_SORT_OPTIONS, type SplitBillSort } from '@/lib/split-bill-sort';

const TText = cssInterop(ThemedText, { className: 'style' });

export function BillSortSheet({
  visible,
  selectedSort,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedSort: SplitBillSort;
  onSelect: (sort: SplitBillSort) => void;
  onClose: () => void;
}) {
  const theme = useThemeTokens().colors;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose}>
      <View
        className="rounded-t-[28px] border px-5 pb-8 pt-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="mb-4 flex-row items-center justify-between">
          <TText variant="sectionTitle">Sort expenses</TText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sort options"
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={20} color={theme.text} />
          </Pressable>
        </View>
        <View className="gap-2">
          {SPLIT_BILL_SORT_OPTIONS.map((option) => {
            const selected = selectedSort === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  haptics.select();
                  onSelect(option.key);
                }}
                className="flex-row items-center gap-3 rounded-2xl p-3"
                style={{ backgroundColor: selected ? theme.secondary : 'transparent' }}>
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: selected ? theme.accent : theme.secondary }}>
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={19}
                    color={selected ? theme.onAccent : theme.accent}
                  />
                </View>
                <View className="flex-1">
                  <TText className="text-sm" style={{ fontFamily: Fonts.title }}>
                    {option.label}
                  </TText>
                  <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
                    {option.hint}
                  </TText>
                </View>
                {selected ? (
                  <MaterialCommunityIcons name="check" size={20} color={theme.accent} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </AnimatedBottomSheet>
  );
}
