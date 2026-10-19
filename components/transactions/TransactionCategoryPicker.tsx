import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

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
  /** The user's own categories among `options` — the ones they can remove. */
  removable?: readonly string[];
  onRemoveCustom?: (category: string) => Promise<void>;
};

const REMOVE_RED = '#E5484D';

/**
 * The category sheet: history suggestions, the type's categories (the user's
 * own after the built-ins) and a custom entry.
 *
 * A category the user added stays in their list, so a typo would stay too.
 * Long-pressing one of theirs asks, inside the sheet, whether to remove it: a
 * dialog here would be a third layer over two sheets, for a question with two
 * answers.
 */
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
  removable = [],
  onRemoveCustom,
}: TransactionCategoryPickerProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const colorScheme = themeTokens.mode;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // A question left open from the last time the sheet was up is not one the
  // user is still being asked.
  useEffect(() => {
    if (!visible) {
      setPendingRemoval(null);
      setRemoveError(null);
    }
  }, [visible]);

  const isRemovable = (category: string) =>
    Boolean(onRemoveCustom) &&
    removable.some((name) => name.toLowerCase() === category.toLowerCase());

  const confirmRemoval = async () => {
    if (!pendingRemoval || !onRemoveCustom) return;
    setIsRemoving(true);
    setRemoveError(null);
    try {
      await onRemoveCustom(pendingRemoval);
      setPendingRemoval(null);
    } catch {
      setRemoveError("Couldn't remove it. Check your connection and try again.");
    } finally {
      setIsRemoving(false);
    }
  };

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
                accessibilityRole="button"
                accessibilityHint={
                  isRemovable(c) ? 'Long-press to remove it from your categories' : undefined
                }
                onPress={() => onSelect(c)}
                onLongPress={
                  isRemovable(c)
                    ? () => {
                        setRemoveError(null);
                        setPendingRemoval(c);
                      }
                    : undefined
                }
                className="w-[47%] items-center gap-2 rounded-3xl border p-4"
                style={{
                  backgroundColor:
                    selected === c
                      ? accentSurface
                      : colorScheme === 'dark'
                        ? theme.card
                        : '#F9FAFB',
                  borderColor:
                    pendingRemoval === c ? REMOVE_RED : selected === c ? accent : 'transparent',
                }}>
                <ThemedText
                  className="text-xs font-bold"
                  style={{ color: selected === c ? accent : theme.text }}>
                  {c}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {pendingRemoval && (
            <View
              testID="category-remove-confirm"
              className="mt-4 rounded-3xl border p-4"
              style={{ borderColor: REMOVE_RED, backgroundColor: theme.card }}>
              <ThemedText className="text-sm font-bold">
                Remove “{pendingRemoval}” from your categories?
              </ThemedText>
              <ThemedText tone="muted" className="mt-1 text-xs">
                Transactions that already use it keep it.
              </ThemedText>
              {removeError && (
                <ThemedText className="mt-2 text-xs font-bold" style={{ color: REMOVE_RED }}>
                  {removeError}
                </ThemedText>
              )}
              <View className="mt-3 flex-row justify-end gap-2">
                <Pressable
                  accessibilityRole="button"
                  disabled={isRemoving}
                  onPress={() => {
                    setPendingRemoval(null);
                    setRemoveError(null);
                  }}
                  className="rounded-2xl px-4 py-2.5">
                  <ThemedText className="text-xs font-bold">Keep</ThemedText>
                </Pressable>
                <Pressable
                  testID="category-remove-confirm-button"
                  accessibilityRole="button"
                  disabled={isRemoving}
                  onPress={() => void confirmRemoval()}
                  className="min-w-[84px] items-center rounded-2xl px-4 py-2.5"
                  style={{ backgroundColor: REMOVE_RED }}>
                  {isRemoving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <ThemedText className="text-xs font-bold" style={{ color: '#FFFFFF' }}>
                      Remove
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </View>
          )}
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
                // The API keeps names up to 40 characters.
                maxLength={40}
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
                <MaterialCommunityIcons name="plus" size={20} color={theme.onAccent} />
              </Pressable>
            </View>
            <ThemedText tone="muted" className="mt-3 text-xs">
              {removable.length > 0 && onRemoveCustom
                ? 'Categories you add stay in this list. Long-press one of yours to remove it.'
                : 'Categories you add stay in this list for next time.'}
            </ThemedText>
          </View>
        </ScrollView>
      </View>
    </AnimatedBottomSheet>
  );
}
