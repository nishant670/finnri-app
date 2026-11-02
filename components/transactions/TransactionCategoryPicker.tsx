import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryVisual } from '@/lib/categories';

type TransactionCategoryPickerProps = {
  visible: boolean;
  selected: string;
  options: readonly string[];
  /** Expense or income, for each tile's icon. */
  type?: string;
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
 * The category sheet (board R2-Category): history suggestions, the type's
 * categories as a two-column grid of tiles (the user's own after the
 * built-ins), and a dashed "New category" that opens a field for one more.
 *
 * A category the user added stays in their list, so a typo would stay too.
 * Long-pressing one of theirs asks, inside the sheet, whether to remove it: a
 * dialog here would be a third layer over two sheets, for a question with two
 * answers.
 */
export function TransactionCategoryPicker({
  visible,
  selected: selected_,
  options,
  type,
  suggestions,
  customCategory,
  onChangeCustomCategory,
  onClose,
  onSelect,
  onAddCustom,
  removable = [],
  onRemoveCustom,
}: TransactionCategoryPickerProps) {
  const { colors } = useThemeTokens();
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // A question left open from the last time the sheet was up is not one the
  // user is still being asked.
  useEffect(() => {
    if (!visible) {
      setPendingRemoval(null);
      setRemoveError(null);
      setIsAddingCustom(false);
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

  const showCustomField = isAddingCustom || customCategory.length > 0;

  return (
    <PickerSheet
      visible={visible}
      title="Category"
      onClose={onClose}
      maxBodyHeight={480}
      avoidKeyboard>
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          <ThemedText tone="muted" style={styles.caption}>
            Suggested from history
          </ThemedText>
          <View style={styles.suggestionRow}>
            {suggestions.map((suggestion) => (
              <PressableView
                key={suggestion}
                accessibilityRole="button"
                onPress={() => onSelect(suggestion)}
                style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
                pressedStyle={styles.pressed}>
                <MaterialCommunityIcons name="creation-outline" size={16} color={colors.text} />
                <ThemedText style={[styles.suggestionLabel, { color: colors.text }]}>
                  {suggestion}
                </ThemedText>
              </PressableView>
            ))}
          </View>
        </View>
      )}

      <View accessibilityRole="radiogroup" accessibilityLabel="Category" style={styles.grid}>
        {options.map((category) => {
          const selected = selected_ === category;
          const visual = categoryVisual(category, type);
          return (
            <PressableView
              key={category}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityHint={
                isRemovable(category) ? 'Long-press to remove it from your categories' : undefined
              }
              onPress={() => onSelect(category)}
              onLongPress={
                isRemovable(category)
                  ? () => {
                      setRemoveError(null);
                      setPendingRemoval(category);
                    }
                  : undefined
              }
              style={[
                styles.tile,
                {
                  backgroundColor: selected ? colors.selectedFill : colors.card,
                  borderColor:
                    pendingRemoval === category
                      ? REMOVE_RED
                      : selected
                        ? colors.selectedBorder
                        : colors.border,
                },
              ]}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons name={visual.icon} size={20} color={colors.text} />
              <ThemedText
                numberOfLines={1}
                style={[styles.tileLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
                {category}
              </ThemedText>
              {selected ? <MaterialCommunityIcons name="check" size={18} color={colors.text} /> : null}
            </PressableView>
          );
        })}
      </View>

      {pendingRemoval && (
        <View
          testID="category-remove-confirm"
          style={[styles.confirm, { borderColor: REMOVE_RED, backgroundColor: colors.card }]}>
          <ThemedText style={[styles.confirmTitle, { color: colors.text }]}>
            Remove “{pendingRemoval}” from your categories?
          </ThemedText>
          <ThemedText tone="muted" style={styles.caption}>
            Transactions that already use it keep it.
          </ThemedText>
          {removeError && (
            <ThemedText style={[styles.caption, { color: REMOVE_RED, fontWeight: '700' }]}>
              {removeError}
            </ThemedText>
          )}
          <View style={styles.confirmActions}>
            <Button
              label="Keep"
              variant="outline"
              height={36}
              disabled={isRemoving}
              onPress={() => {
                setPendingRemoval(null);
                setRemoveError(null);
              }}
            />
            <Button
              testID="category-remove-confirm-button"
              label="Remove"
              height={36}
              loading={isRemoving}
              onPress={() => void confirmRemoval()}
              style={{ backgroundColor: REMOVE_RED, borderColor: REMOVE_RED }}
            />
          </View>
        </View>
      )}

      {showCustomField ? (
        <View style={[styles.customCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.customRow}>
            <TextInput
              testID="entry-custom-category-input"
              value={customCategory}
              onChangeText={onChangeCustomCategory}
              placeholder="New category name"
              autoFocus={isAddingCustom && customCategory.length === 0}
              // The API keeps names up to 40 characters.
              maxLength={40}
              placeholderTextColor={colors.muted}
              style={[styles.customInput, { color: colors.text, borderColor: colors.border }]}
            />
            <Button
              testID="entry-add-custom-category-button"
              accessibilityLabel="Add category"
              label="Add"
              height={40}
              onPress={onAddCustom}
            />
          </View>
          <ThemedText tone="muted" style={styles.caption}>
            {removable.length > 0 && onRemoveCustom
              ? 'Categories you add stay in this list. Long-press one of yours to remove it.'
              : 'Categories you add stay in this list for next time.'}
          </ThemedText>
        </View>
      ) : (
        <PressableView
          accessibilityRole="button"
          onPress={() => setIsAddingCustom(true)}
          style={[styles.newCategory, { borderColor: colors.borderStrong }]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
          <ThemedText style={[styles.newCategoryLabel, { color: colors.text }]}>
            New category
          </ThemedText>
        </PressableView>
      )}
    </PickerSheet>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    gap: 8,
    marginBottom: 12,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestion: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  suggestionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  tile: {
    width: '48.8%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  tileLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  confirm: {
    gap: 4,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  confirmTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  customCard: {
    gap: 8,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 14,
  },
  newCategory: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  newCategoryLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
