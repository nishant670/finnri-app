import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import { formatMoney, roundToPaise, toAmountInputValue } from '@/lib/money';
import { withAlpha } from '@/constants/theme';
import {
  buildEqualParticipantsForGroup,
  buildParticipantsForGroup,
  resolveParticipantsForGroup,
} from '@/lib/split-draft';
import type { SplitFriend, SplitGroup } from '@/lib/splits';
import type { EntryForm, SplitParticipantForm } from './TransactionFormModal';

/**
 * How shares are entered (P8): `equal` keeps everyone on the same share and
 * needs no typing, `amount` and `percentage` take each friend's share.
 */
export type TransactionSplitShareMode = 'equal' | 'amount' | 'percentage';

/**
 * What the split adds up to (P7): the payer keeps whatever the friends' shares
 * leave, so "your share" is the remainder and only an over-assigned split has
 * anything wrong with it.
 */
export const splitSummary = (totalAmount: string, participants: SplitParticipantForm[]) => {
  const total = roundToPaise(totalAmount);
  const assigned = roundToPaise(
    participants.reduce((sum, participant) => sum + Number(participant.shareAmount || 0), 0)
  );
  const yourShare = Math.max(roundToPaise(total - assigned), 0);
  const over = Math.max(roundToPaise(assigned - total), 0);
  const ways = participants.length + (yourShare > 0 ? 1 : 0);
  return { total, assigned, yourShare, over, ways };
};

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
 * The shared-expense card under More details (boards R2-Split and
 * R2-Split-Proposals: Equally · Amount · %, your share, what is left).
 *
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
  const { colors } = useThemeTokens();
  const selectedGroup = groups.find((group) => group.id === form.splitGroupId) ?? null;
  const selectedGroupResolution = selectedGroup
    ? resolveParticipantsForGroup(selectedGroup, form.amount)
    : null;
  const rule = { borderTopWidth: 1, borderTopColor: colors.border };
  const summary = splitSummary(form.amount, form.splitParticipants);
  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.tile, { backgroundColor: colors.selectedFill }]}>
          <MaterialCommunityIcons name="account-multiple-outline" size={20} color={colors.text} />
        </View>
        <View style={styles.headerText}>
          <ThemedText style={[styles.title, { color: colors.text }]}>Split this expense</ThemedText>
          <ThemedText tone="muted" style={styles.caption}>
            Keep track of who owes you.
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Split this expense"
          accessibilityState={{ checked: form.splitEnabled }}
          onPress={() => {
            haptics.toggle(!form.splitEnabled);
            // A new split starts even (P8); the friend's half is already in.
            if (!form.splitEnabled && form.splitParticipants.length === 0) onChangeShareMode('equal');
            setForm((previous) =>
              previous.splitEnabled
                ? { ...previous, splitEnabled: false }
                : withSplitTurnedOn(previous, friends)
            );
          }}
          style={[styles.switch, { backgroundColor: form.splitEnabled ? colors.accent : colors.track }]}>
          <View
            style={[
              styles.thumb,
              { alignSelf: form.splitEnabled ? 'flex-end' : 'flex-start' },
            ]}
          />
        </Pressable>
      </View>

      {form.splitEnabled ? (
        <>
          {groups.length > 0 ? (
            <View style={[styles.section, rule]}>
              <ThemedText tone="muted" style={styles.label}>
                Group
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
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
                    <View style={[styles.warning, { backgroundColor: colors.warningSurface }]}>
                      <ThemedText tone="warning" style={styles.caption}>
                        {selectedGroupResolution.warning}
                      </ThemedText>
                    </View>
                  ) : null}
                  <TextButton
                    icon="account-group-outline"
                    label="Split equally"
                    onPress={() =>
                      onApplyEqualSplit(buildEqualParticipantsForGroup(selectedGroup, form.amount))
                    }
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {form.splitParticipants.length > 0 ? (
            <View style={[styles.controls, rule]}>
              <Segments
                active={shareMode}
                options={[
                  { key: 'equal', label: 'Equally' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'percentage', label: '%', accessibilityLabel: 'Percentage' },
                ]}
                onChange={onChangeShareMode}
                style={styles.shareMode}
              />
            </View>
          ) : null}

          {form.splitParticipants.length > 0 ? (
            <View style={styles.youRow}>
              <View style={[styles.avatar, { backgroundColor: colors.selectedFill }]}>
                <ThemedText style={[styles.youTile, { color: colors.text }]}>You</ThemedText>
              </View>
              <ThemedText style={[styles.youLabel, { color: colors.text }]}>Your share</ThemedText>
              <ThemedText testID="split-your-share" style={[styles.youAmount, { color: colors.text }]}>
                {summary.total > 0 ? formatMoney(summary.yourShare) : '—'}
              </ThemedText>
            </View>
          ) : null}

          <View style={[styles.people, form.splitParticipants.length > 0 ? rule : null]}>
            {form.splitParticipants.map((participant, index) => (
              <View key={index} style={styles.person}>
                {friends.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[styles.chipRow, styles.indent]}>
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
                            onUpdateParticipant(index, { friendId: friend.id, friendName: '' })
                          }
                        />
                      ))}
                    </View>
                  </ScrollView>
                ) : null}
                <View style={styles.personRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.track }]}>
                    <MaterialCommunityIcons name="account-outline" size={18} color={colors.muted} />
                  </View>
                  {participant.friendId === null ? (
                    <TextInput
                      accessibilityLabel="Friend name"
                      value={participant.friendName}
                      onChangeText={(text) => onUpdateParticipant(index, { friendName: text })}
                      placeholder="Friend name"
                      placeholderTextColor={colors.muted}
                      style={[inputStyle, styles.name]}
                    />
                  ) : (
                    <View style={[inputStyle, styles.name, styles.nameChosen]}>
                      <ThemedText numberOfLines={1} style={[styles.nameText, { color: colors.text }]}>
                        {friends.find((friend) => friend.id === participant.friendId)?.name ?? 'Friend'}
                      </ThemedText>
                    </View>
                  )}
                  {shareMode === 'equal' ? (
                    <ThemedText
                      accessibilityLabel="Their share"
                      style={[styles.shareText, { color: colors.text }]}>
                      {summary.total > 0
                        ? formatMoney(participant.shareAmount || 0)
                        : `${participant.sharePercent ?? ''}%`}
                    </ThemedText>
                  ) : (
                  <TextInput
                    accessibilityLabel="Their share"
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
                      onUpdateParticipant(index, { shareAmount: text, sharePercent: undefined });
                    }}
                    keyboardType="decimal-pad"
                    placeholder={shareMode === 'percentage' ? '0%' : `${CURRENCY_SYMBOL}0`}
                    placeholderTextColor={colors.muted}
                    style={[inputStyle, styles.share]}
                  />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove this friend"
                    onPress={() => onRemoveParticipant(index)}
                    style={styles.remove}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                <Segments
                  active={participant.direction}
                  options={[
                    { key: 'friend_owes_user', label: 'Owes me' },
                    { key: 'user_owes_friend', label: 'I owe' },
                  ]}
                  onChange={(direction) => onUpdateParticipant(index, { direction })}
                  style={styles.direction}
                />
              </View>
            ))}
          </View>

          <PressableView
            accessibilityRole="button"
            onPress={onAddParticipant}
            style={styles.addFriend}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="plus" size={20} color={colors.text} />
            <ThemedText style={[styles.addFriendLabel, { color: colors.text }]}>Add a friend</ThemedText>
          </PressableView>

          {form.splitParticipants.length > 0 && summary.total > 0 ? (
            <View
              testID="split-summary"
              accessibilityLiveRegion="polite"
              style={[
                styles.summary,
                rule,
                {
                  backgroundColor: withAlpha(
                    summary.over > 0 ? colors.negative : colors.positive,
                    0.08
                  ),
                },
              ]}>
              <MaterialCommunityIcons
                name={summary.over > 0 ? 'alert-circle-outline' : 'check'}
                size={18}
                color={summary.over > 0 ? colors.negative : colors.positive}
              />
              <ThemedText style={[styles.summaryText, { color: colors.text }]}>
                {summary.over > 0 ? (
                  <>
                    Shares are{' '}
                    <ThemedText style={[styles.summaryText, styles.summaryStrong]}>
                      {formatMoney(summary.over)}
                    </ThemedText>{' '}
                    more than the total
                  </>
                ) : (
                  <>
                    <ThemedText style={[styles.summaryText, styles.summaryStrong, { color: colors.text }]}>
                      {formatMoney(summary.total)}
                    </ThemedText>
                    {` split ${summary.ways} ways · nothing left to assign`}
                  </>
                )}
              </ThemedText>
            </View>
          ) : null}

          {form.splitGroupId === null ? (
            <View style={[styles.groupRow, rule]}>
              <ThemedText tone="muted" style={styles.groupLabel}>
                Group
              </ThemedText>
              <TextInput
                accessibilityLabel="New group name"
                value={form.splitGroupName}
                onChangeText={(text) => setForm((previous) => ({ ...previous, splitGroupName: text }))}
                placeholder="Optional · trip, flatmates"
                placeholderTextColor={colors.muted}
                style={[styles.groupInput, { color: colors.text }]}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function TextButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole="button"
      onPress={onPress}
      style={styles.textButton}
      pressedStyle={styles.pressed}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.text} />
      <ThemedText style={[styles.textButtonLabel, { color: colors.text }]}>{label}</ThemedText>
    </PressableView>
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
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.selectedFill : colors.card,
          borderColor: selected ? colors.selectedBorder : colors.border,
        },
      ]}
      pressedStyle={styles.pressed}>
      <ThemedText style={[styles.chipLabel, { color: colors.text, fontWeight: selected ? '700' : '500' }]}>
        {label}
      </ThemedText>
    </PressableView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  switch: {
    width: 52,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 16,
  },
  thumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  section: {
    gap: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
  },
  shareMode: {
    flex: 1,
    height: 36,
  },
  youRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 52,
  },
  youTile: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  youLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  youAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  shareText: {
    width: 84,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summary: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryStrong: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  textButton: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 8,
  },
  textButtonLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  people: {
    gap: 12,
    paddingTop: 6,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 8,
  },
  person: {
    gap: 6,
  },
  indent: {
    paddingLeft: 40,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 40,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 14,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  nameChosen: {
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  share: {
    width: 84,
    textAlign: 'right',
  },
  remove: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  direction: {
    width: 164,
    height: 32,
    marginLeft: 40,
    padding: 2,
  },
  addFriend: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  addFriendLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  groupRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  groupLabel: {
    width: 84,
    fontSize: 13,
    lineHeight: 18,
  },
  groupInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    padding: 0,
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
