import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { roundToPaise, toAmountInputValue } from '@/lib/money';
import {
  buildEqualParticipantsForGroup,
  buildParticipantsForGroup,
  resolveParticipantsForGroup,
} from '@/lib/split-draft';
import type { SplitFriend, SplitGroup } from '@/lib/splits';
import type { EntryForm, SplitParticipantForm } from './TransactionFormModal';

export type TransactionSplitShareMode = 'amount' | 'percentage';

const percentFromShare = (shareAmount: string, totalAmount: string) => {
  const share = Number(shareAmount || 0);
  const total = roundToPaise(totalAmount);
  if (!Number.isFinite(share) || !Number.isFinite(total) || total <= 0) return '';
  return String(Math.round((share / total) * 10000) / 100);
};

export const shareFromPercent = (percent: string, totalAmount: string) => {
  const parsedPercent = Number(percent || 0);
  const total = roundToPaise(totalAmount);
  if (!Number.isFinite(parsedPercent) || !Number.isFinite(total) || total <= 0) return '';
  return toAmountInputValue((total * parsedPercent) / 100);
};

/**
 * The form with the split switched on, seeded with one half-share for the
 * first friend so there is something to edit rather than an empty list.
 *
 * Shared by the card's own switch and the sheet's "Split" chip, which turns
 * the split on in the same tap that brings the card into view — a chip that
 * revealed a card whose switch then had to be found and flipped would be two
 * taps for one intention.
 */
export const withSplitTurnedOn = (previous: EntryForm, friends: SplitFriend[]): EntryForm => ({
  ...previous,
  splitEnabled: true,
  splitParticipants:
    previous.splitParticipants.length === 0
      ? [
          {
            friendId: friends[0]?.id ?? null,
            friendName: '',
            shareAmount: previous.amount
              ? toAmountInputValue(roundToPaise(previous.amount) / 2)
              : '',
            sharePercent: '50',
            direction: 'friend_owes_user',
          },
        ]
      : previous.splitParticipants,
});

type TransactionSplitFieldsProps = {
  form: EntryForm;
  setForm: Dispatch<SetStateAction<EntryForm>>;
  friends: SplitFriend[];
  groups: SplitGroup[];
  shareMode: TransactionSplitShareMode;
  onChangeShareMode: (mode: TransactionSplitShareMode) => void;
  onApplyEqualSplit: (participants?: SplitParticipantForm[]) => void;
  onAddParticipant: () => void;
  onUpdateParticipant: (index: number, updates: Partial<SplitParticipantForm>) => void;
  onRemoveParticipant: (index: number) => void;
};

/**
 * The shared-expense portion of the general transaction composer.
 *
 * Keeping this boundary independent from the transaction sheet makes the
 * allocation UI replaceable by the canonical Splits flow without pulling the
 * AI review, subscription and account editors along with it.
 */
export function TransactionSplitFields({
  form,
  setForm,
  friends,
  groups,
  shareMode,
  onChangeShareMode,
  onApplyEqualSplit,
  onAddParticipant,
  onUpdateParticipant,
  onRemoveParticipant,
}: TransactionSplitFieldsProps) {
  const theme = useThemeTokens().colors;
  const accent = theme.accent;
  const accentSurface = theme.secondary;
  const selectedGroup = groups.find((group) => group.id === form.splitGroupId) ?? null;
  const selectedGroupResolution = selectedGroup
    ? resolveParticipantsForGroup(selectedGroup, form.amount)
    : null;

  return (
    <View className="px-5 mb-6">
      <View
        className="rounded-[24px] border p-3"
        style={{ backgroundColor: theme.card, borderColor: theme.border }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: accentSurface }}>
              <MaterialCommunityIcons name="account-multiple-outline" size={20} color={accent} />
            </View>
            <View>
              <ThemedText className="text-sm font-black" style={{ color: theme.text }}>
                Split this expense
              </ThemedText>
              <ThemedText tone="muted" className="text-xs">
                Keep track of who owes you.
              </ThemedText>
            </View>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: form.splitEnabled }}
            onPress={() =>
              setForm((previous) =>
                previous.splitEnabled
                  ? { ...previous, splitEnabled: false }
                  : withSplitTurnedOn(previous, friends)
              )
            }
            className="h-8 w-14 justify-center rounded-full px-1"
            style={{ backgroundColor: form.splitEnabled ? accent : theme.border }}>
            <View
              className="h-6 w-6 rounded-full bg-white"
              style={{ alignSelf: form.splitEnabled ? 'flex-end' : 'flex-start' }}
            />
          </Pressable>
        </View>

        {form.splitEnabled ? (
          <View className="mt-5 gap-4">
            {groups.length > 0 ? (
              <View>
                <ThemedText
                  tone="muted"
                  className="mb-2 text-[10px] font-black uppercase tracking-widest">
                  Group
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    <SplitChoiceChip
                      label="New"
                      selected={form.splitGroupId === null}
                      onPress={() => setForm((previous) => ({ ...previous, splitGroupId: null }))}
                    />
                    {groups.map((group) => (
                      <SplitChoiceChip
                        key={group.id}
                        label={group.name}
                        selected={form.splitGroupId === group.id}
                        onPress={() =>
                          setForm((previous) => {
                            const participants = buildParticipantsForGroup(group, previous.amount);
                            return {
                              ...previous,
                              splitGroupId: group.id,
                              splitGroupName: '',
                              splitParticipants:
                                participants.length > 0 ? participants : previous.splitParticipants,
                            };
                          })
                        }
                      />
                    ))}
                  </View>
                </ScrollView>
                {selectedGroup && (selectedGroup.members?.length ?? 0) > 0 ? (
                  <>
                    {selectedGroupResolution?.warning ? (
                      <View className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                        <ThemedText tone="warning" className="text-xs font-bold">
                          {selectedGroupResolution.warning}
                        </ThemedText>
                      </View>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        onApplyEqualSplit(
                          buildEqualParticipantsForGroup(selectedGroup, form.amount)
                        )
                      }
                      className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl border py-3"
                      style={{ borderColor: theme.border }}>
                      <MaterialCommunityIcons
                        name="account-group-outline"
                        size={18}
                        color={accent}
                      />
                      <ThemedText className="text-xs font-black" style={{ color: accent }}>
                        Split equally
                      </ThemedText>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {form.splitGroupId === null ? (
              <View className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                <ThemedText
                  tone="muted"
                  className="mb-2 text-[10px] font-black uppercase tracking-widest">
                  New group name
                </ThemedText>
                <TextInput
                  value={form.splitGroupName}
                  onChangeText={(text) =>
                    setForm((previous) => ({ ...previous, splitGroupName: text }))
                  }
                  placeholder="Trip, flatmates, dinner crew"
                  placeholderTextColor="#9CA3AF"
                  className="p-0 text-sm font-bold"
                  style={{ color: theme.text }}
                />
              </View>
            ) : null}

            {form.splitParticipants.length > 0 ? (
              <View className="gap-3 rounded-2xl bg-gray-50 p-3 dark:bg-gray-800/50">
                <View className="flex-row gap-2">
                  <ShareModeButton
                    label="Amount"
                    selected={shareMode === 'amount'}
                    onPress={() => onChangeShareMode('amount')}
                  />
                  <ShareModeButton
                    label="Percentage"
                    selected={shareMode === 'percentage'}
                    onPress={() => onChangeShareMode('percentage')}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onApplyEqualSplit()}
                  className="flex-row items-center justify-center gap-2 rounded-2xl border py-3"
                  style={{ borderColor: theme.border }}>
                  <MaterialCommunityIcons name="call-split" size={18} color={accent} />
                  <ThemedText className="text-xs font-black" style={{ color: accent }}>
                    Split equally
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            <View className="gap-3">
              {form.splitParticipants.map((participant, index) => (
                <View key={index} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                  <View className="flex-row items-center justify-between">
                    <ThemedText
                      tone="muted"
                      className="text-[10px] font-black uppercase tracking-widest">
                      Share {index + 1}
                    </ThemedText>
                    <Pressable onPress={() => onRemoveParticipant(index)}>
                      <MaterialCommunityIcons name="close" size={18} color={theme.text} />
                    </Pressable>
                  </View>
                  {friends.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                      <View className="flex-row gap-2">
                        <SplitChoiceChip
                          label="New friend"
                          selected={participant.friendId === null}
                          onPress={() => onUpdateParticipant(index, { friendId: null })}
                        />
                        {friends.map((friend) => (
                          <SplitChoiceChip
                            key={friend.id}
                            label={friend.name}
                            selected={participant.friendId === friend.id}
                            onPress={() =>
                              onUpdateParticipant(index, {
                                friendId: friend.id,
                                friendName: '',
                              })
                            }
                          />
                        ))}
                      </View>
                    </ScrollView>
                  ) : null}
                  {participant.friendId === null ? (
                    <TextInput
                      value={participant.friendName}
                      onChangeText={(text) => onUpdateParticipant(index, { friendName: text })}
                      placeholder="Friend name"
                      placeholderTextColor="#9CA3AF"
                      className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold dark:bg-gray-900"
                      style={{ color: theme.text }}
                    />
                  ) : null}
                  <View className="mt-3 flex-row gap-3">
                    <TextInput
                      value={
                        shareMode === 'percentage'
                          ? (participant.sharePercent ??
                            percentFromShare(participant.shareAmount, form.amount))
                          : participant.shareAmount
                      }
                      onChangeText={(text) => {
                        if (shareMode === 'percentage') {
                          onUpdateParticipant(index, {
                            sharePercent: text,
                            shareAmount: shareFromPercent(text, form.amount),
                          });
                          return;
                        }
                        onUpdateParticipant(index, {
                          shareAmount: text,
                          sharePercent: undefined,
                        });
                      }}
                      keyboardType="decimal-pad"
                      placeholder={shareMode === 'percentage' ? 'Percent' : 'Amount'}
                      placeholderTextColor="#9CA3AF"
                      className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-bold dark:bg-gray-900"
                      style={{ color: theme.text }}
                    />
                    <Pressable
                      onPress={() =>
                        onUpdateParticipant(index, {
                          direction:
                            participant.direction === 'friend_owes_user'
                              ? 'user_owes_friend'
                              : 'friend_owes_user',
                        })
                      }
                      className="justify-center rounded-2xl px-4"
                      style={{ backgroundColor: accentSurface }}>
                      <ThemedText className="text-xs font-black" style={{ color: accent }}>
                        {participant.direction === 'friend_owes_user' ? 'Owes me' : 'I owe'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={onAddParticipant}
              className="flex-row items-center justify-center gap-2 rounded-2xl border py-3"
              style={{ borderColor: theme.border }}>
              <MaterialCommunityIcons name="plus" size={18} color={accent} />
              <ThemedText className="text-sm font-black" style={{ color: accent }}>
                Add a friend
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SplitChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="rounded-full border px-3 py-2"
      style={{
        backgroundColor: selected ? theme.secondary : 'transparent',
        borderColor: selected ? theme.accent : theme.border,
      }}>
      <ThemedText
        className="text-xs font-bold"
        style={{ color: selected ? theme.accent : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ShareModeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="flex-1 rounded-2xl px-3 py-3"
      style={{
        backgroundColor: selected ? theme.secondary : 'transparent',
        borderColor: selected ? theme.accent : theme.border,
        borderWidth: 1,
      }}>
      <ThemedText
        className="text-center text-xs font-black"
        style={{ color: selected ? theme.accent : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
