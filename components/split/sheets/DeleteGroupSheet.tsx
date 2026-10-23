import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { haptics } from '@/lib/haptics';
import type { SplitGroupEntryDisposition } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * Deleting a group asks one question, because there are two records here.
 *
 * A split bill and a Finnri transaction are two accounts of the same evening:
 * the bill says who owed whom, the transaction says money left the account.
 * Deleting the group settles the first and says nothing about the second — the
 * money really did leave — so the app cannot decide this on the user's behalf
 * in either direction. Removing the transactions silently would destroy spend
 * history; keeping them silently would leave a group's worth of expenses behind
 * with nothing to explain them.
 *
 * Keeping is the pre-selected answer, because it is the one that is recoverable.
 * A transaction kept can be deleted afterwards; a transaction deleted here is
 * gone.
 */

/** Copy that names a number rather than "the expenses", where there is one. */
const expenseNoun = (count: number) =>
  count === 1 ? '1 transaction' : `${count} transactions`;

export function DeleteGroupSheet({
  visible,
  groupName,
  expenseCount,
  disposition,
  saving,
  onChangeDisposition,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  groupName: string;
  /** How many split expenses the group is holding. */
  expenseCount: number;
  disposition: SplitGroupEntryDisposition;
  saving: boolean;
  onChangeDisposition: (next: SplitGroupEntryDisposition) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useThemeTokens().colors;
  const sheetBottom = useBottomInset(32);

  const options: {
    value: SplitGroupEntryDisposition;
    title: string;
    description: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
  }[] = [
    {
      value: 'keep',
      title: 'Keep the transactions',
      description: `${expenseNoun(expenseCount)} stay in your Finnri history. Only the split balances go.`,
      icon: 'history',
    },
    {
      value: 'delete',
      title: 'Delete the transactions too',
      description: `${expenseNoun(expenseCount)} are removed from Finnri as well. This cannot be undone.`,
      icon: 'delete-outline',
    },
  ];

  return (
    <AnimatedBottomSheet visible={visible} onClose={saving ? () => {} : onCancel}>
      <View
        className="rounded-t-[28px] border px-5 pt-5"
        style={{ backgroundColor: theme.card, borderColor: theme.border, paddingBottom: sheetBottom }}>
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <TText variant="sectionTitle" numberOfLines={2}>
              Delete {groupName}?
            </TText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={saving}
            onPress={onCancel}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name="close" size={20} color={theme.text} />
          </Pressable>
        </View>

        <TText className="mb-5 text-xs" style={{ color: theme.muted }}>
          The group goes, and so do the split balances it was keeping — nobody
          will owe anybody for it any more.
        </TText>

        {expenseCount > 0 ? (
          <View className="gap-2">
            {options.map((option) => {
              const selected = disposition === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: saving }}
                  disabled={saving}
                  onPress={() => {
                    haptics.select();
                    onChangeDisposition(option.value);
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border p-3"
                  style={{
                    backgroundColor: selected ? theme.secondary : 'transparent',
                    borderColor: selected ? theme.accent : theme.border,
                  }}>
                  <View
                    className="h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: selected ? theme.accent : theme.secondary }}>
                    <MaterialCommunityIcons
                      name={option.icon}
                      size={19}
                      color={selected ? theme.onAccent : theme.accent}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <TText className="text-sm" style={{ fontFamily: Fonts.title }}>
                      {option.title}
                    </TText>
                    <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
                      {option.description}
                    </TText>
                  </View>
                  {selected ? (
                    <MaterialCommunityIcons name="check" size={20} color={theme.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          // Nothing to choose between: an empty group has no transactions to
          // keep, and offering the question anyway would imply it does.
          <TText className="text-xs" style={{ color: theme.muted }}>
            There are no expenses on this group.
          </TText>
        )}

        <View className="mt-6 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={onCancel}
            className="h-13 min-h-[52px] flex-1 items-center justify-center rounded-2xl border"
            style={{ borderColor: theme.border, opacity: saving ? 0.6 : 1 }}>
            <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.text }}>
              Cancel
            </TText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              disposition === 'delete' && expenseCount > 0
                ? 'Delete the group and its transactions'
                : 'Delete the group and keep its transactions'
            }
            disabled={saving}
            onPress={onConfirm}
            className="h-13 min-h-[52px] flex-1 items-center justify-center rounded-2xl"
            // `negative` is the mood's own money-out tone, so the destructive
            // button reads as destructive in Mint and Sky rather than only in
            // Finnri's palette.
            style={{ backgroundColor: theme.negative, opacity: saving ? 0.6 : 1 }}>
            {saving ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.onAccent }}>
                Delete
              </TText>
            )}
          </Pressable>
        </View>
      </View>
    </AnimatedBottomSheet>
  );
}
