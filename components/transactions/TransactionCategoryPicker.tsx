import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TransactionCategoryPickerProps = {
  visible: boolean;
  selected: string;
  options: readonly string[];
  /** Categories inferred from the user's history for this title or merchant. */
  suggestions: readonly string[];
  customCategory: string;
  onChangeCustomCategory: (value: string) => void;
  onClose: () => void;
  onSelect: (category: string) => void;
  onAddCustom: () => void;
};

/** The category sheet: history suggestions, the type's categories and a custom entry. */
export function TransactionCategoryPicker({
  visible,
  selected,
  options,
  suggestions,
  customCategory,
  onChangeCustomCategory,
  onClose,
  onSelect,
  onAddCustom,
}: TransactionCategoryPickerProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const colorScheme = themeTokens.mode;
  const accent = theme.accent;
  const accentSurface = theme.secondary;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} backdropOpacity={0.3}>
      <View className="rounded-t-3xl px-4 pb-10 pt-4" style={{ backgroundColor: theme.background }}>
        <ThemedText className="text-center text-base font-bold mb-6">Choose a category</ThemedText>
        <ScrollView style={{ maxHeight: 430 }}>
          {suggestions.length > 0 && (
            <View className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
              <ThemedText
                tone="warning"
                className="mb-2 text-[10px] font-black uppercase tracking-widest">
                Suggested from history
              </ThemedText>
              <View className="flex-row flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    accessibilityRole="button"
                    onPress={() => onSelect(suggestion)}
                    className="rounded-full px-3 py-2"
                    style={{ backgroundColor: theme.card }}>
                    <ThemedText className="text-xs font-black" style={{ color: accent }}>
                      {suggestion}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View className="flex-row flex-wrap gap-4 justify-between">
            {options.map((c) => (
              <Pressable
                key={c}
                onPress={() => onSelect(c)}
                className="w-[47%] items-center gap-2 rounded-3xl border p-4"
                style={{
                  backgroundColor:
                    selected === c
                      ? accentSurface
                      : colorScheme === 'dark'
                        ? theme.card
                        : '#F9FAFB',
                  borderColor: selected === c ? accent : 'transparent',
                }}>
                <ThemedText
                  className="text-xs font-bold"
                  style={{ color: selected === c ? accent : theme.text }}>
                  {c}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <View className="mt-5 rounded-3xl border p-4" style={{ borderColor: theme.border }}>
            <ThemedText
              tone="muted"
              className="mb-3 text-[10px] font-black uppercase tracking-widest">
              Custom category
            </ThemedText>
            <View className="flex-row gap-3">
              <TextInput
                testID="entry-custom-category-input"
                value={customCategory}
                onChangeText={onChangeCustomCategory}
                placeholder="Add category"
                placeholderTextColor="#9CA3AF"
                className="flex-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold dark:bg-gray-800"
                style={{ color: theme.text }}
              />
              <Pressable
                testID="entry-add-custom-category-button"
                accessibilityRole="button"
                onPress={onAddCustom}
                className="items-center justify-center rounded-2xl px-4"
                style={{ backgroundColor: accent }}>
                <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );
}
