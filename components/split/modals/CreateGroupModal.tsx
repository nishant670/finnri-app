import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { MemberToggleChip } from '@/components/split/primitives/SplitPrimitives';
import { groupKindOptions } from '@/components/split/split-utils';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { PressableView } from '@/components/ui/PressableView';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';
import type { GroupKind } from '@/lib/split-preferences';
import type { SplitFriend } from '@/lib/splits';

/**
 * Create or edit a group (board R6-CreateGroup): photo and name, the kind
 * chips, members from existing friends, the balance alert, and one button.
 */
export function CreateGroupModal({
  visible,
  saving,
  title,
  doneLabel,
  groupName,
  groupKind,
  photoUri,
  photoBusy,
  onPickPhoto,
  onRemovePhoto,
  balanceAlertEnabled,
  balanceAlertAmount,
  friends,
  selectedFriendIds,
  onChangeName,
  onChangeKind,
  onToggleBalanceAlert,
  onChangeBalanceAlertAmount,
  onToggleFriend,
  newMemberNames,
  onAddNewMember,
  onRemoveNewMember,
  onClose,
  onDone,
}: {
  visible: boolean;
  saving: boolean;
  title: string;
  doneLabel: string;
  groupName: string;
  groupKind: GroupKind;
  /**
   * The photo as the composer has it: a local file the user just picked, a
   * hosted URL on an existing group, `''` once removed, or `null` for a group
   * that has never had one.
   */
  photoUri: string | null;
  photoBusy: boolean;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  balanceAlertEnabled: boolean;
  balanceAlertAmount: string;
  friends: SplitFriend[];
  selectedFriendIds: number[];
  onChangeName: (value: string) => void;
  onChangeKind: (kind: GroupKind) => void;
  onToggleBalanceAlert: () => void;
  onChangeBalanceAlertAmount: (value: string) => void;
  onToggleFriend: (friendId: number) => void;
  /** Names typed in that are not friends yet; saved as friends with the group. */
  newMemberNames: string[];
  onAddNewMember: (name: string) => void;
  onRemoveNewMember: (name: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const theme = useThemeTokens().colors;
  const [memberQuery, setMemberQuery] = useState('');
  const selectedFriends = friends.filter((friend) => selectedFriendIds.includes(friend.id));
  const query = memberQuery.trim().toLowerCase();
  // Friends not in yet: the ones matching what is typed, or a few to start.
  const suggestions = friends
    .filter((friend) => !selectedFriendIds.includes(friend.id))
    .filter((friend) => !query || friend.name.toLowerCase().includes(query))
    .slice(0, 6);

  const addMember = () => {
    const name = memberQuery.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const existing = friends.find((friend) => friend.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedFriendIds.includes(existing.id)) onToggleFriend(existing.id);
    } else if (!newMemberNames.some((candidate) => candidate.toLowerCase() === name.toLowerCase())) {
      haptics.select();
      onAddNewMember(name);
    }
    setMemberQuery('');
  };

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      backdropOpacity={0.3}
      sheetStyle={{ maxHeight: '94%' }}>
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
        <View style={styles.header}>
          <ThemedText accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {title}
          </ThemedText>
          <SheetCloseButton accessibilityLabel="Close group composer" onPress={onClose} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={styles.body}>
          <View style={styles.nameRow}>
            {/* The control was drawn from the first version of this sheet and
                wired to nothing, so the one affordance that looks like it takes
                a photo did not. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={photoUri ? 'Change group photo' : 'Choose group photo'}
              accessibilityHint={photoUri ? 'Opens the picker to replace this photo' : undefined}
              disabled={photoBusy}
              onPress={onPickPhoto}
              style={[
                styles.photo,
                {
                  backgroundColor: theme.card,
                  borderColor: photoUri ? theme.borderStrong : theme.border,
                  borderStyle: photoUri ? 'solid' : 'dashed',
                  opacity: photoBusy ? 0.6 : 1,
                },
              ]}>
              {photoBusy ? (
                <ActivityIndicator color={theme.muted} />
              ) : photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ height: '100%', width: '100%' }}
                  contentFit="cover"
                  transition={0}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <MaterialCommunityIcons name="camera-outline" size={24} color={theme.text} />
              )}
            </Pressable>
            <TextInput
              accessibilityLabel="Group name"
              value={groupName}
              onChangeText={onChangeName}
              autoFocus
              placeholder="Group name"
              placeholderTextColor={theme.muted}
              style={[
                styles.nameInput,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  color: theme.text,
                  fontFamily: Fonts.body,
                },
              ]}
            />
          </View>
          {photoUri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove group photo"
              onPress={onRemovePhoto}
              hitSlop={8}
              style={styles.removePhoto}>
              <ThemedText style={[styles.link, { color: theme.text }]}>Remove photo</ThemedText>
            </Pressable>
          ) : null}

          <View style={styles.kinds}>
            {groupKindOptions.map((option) => {
              const selected = groupKind === option.kind;
              return (
                <PressableView
                  key={option.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptics.select();
                    onChangeKind(option.kind);
                  }}
                  style={[
                    styles.kind,
                    {
                      backgroundColor: selected ? theme.selectedFill : theme.card,
                      borderColor: selected ? theme.selectedBorder : theme.border,
                    },
                  ]}
                  pressedStyle={styles.pressed}>
                  <MaterialCommunityIcons name={option.icon} size={18} color={theme.text} />
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.kindLabel,
                      { color: theme.text, fontWeight: selected ? '700' : '500' },
                    ]}>
                    {option.label}
                  </ThemedText>
                </PressableView>
              );
            })}
          </View>

          {/* Members by name (P28, board R6-CreateGroup-Proposals): pick a
              friend, or type a new name and Add — it becomes a friend too. */}
          <View
            testID="group-members"
            style={[styles.card, styles.membersCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText tone="muted" style={styles.membersLabel}>
              Members
            </ThemedText>
            <View style={styles.memberChips}>
              <View style={[styles.youChip, { backgroundColor: theme.track }]}>
                <ThemedText style={[styles.youLabel, { color: theme.text }]}>You</ThemedText>
              </View>
              {selectedFriends.map((friend) => (
                <MemberToggleChip
                  key={friend.id}
                  friend={friend}
                  selected
                  onPress={() => onToggleFriend(friend.id)}
                />
              ))}
              {newMemberNames.map((name) => (
                <Pressable
                  key={`new-${name}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${name}`}
                  onPress={() => onRemoveNewMember(name)}
                  style={[
                    styles.newChip,
                    { backgroundColor: theme.selectedFill, borderColor: theme.selectedBorder },
                  ]}>
                  <ThemedText style={[styles.newChipLabel, { color: theme.text }]}>{name}</ThemedText>
                  <MaterialCommunityIcons name="close" size={14} color={theme.text} />
                </Pressable>
              ))}
            </View>
            <View style={styles.addRow}>
              <TextInput
                accessibilityLabel="Member name or phone"
                value={memberQuery}
                onChangeText={setMemberQuery}
                onSubmitEditing={addMember}
                returnKeyType="done"
                placeholder="Name or phone"
                placeholderTextColor={theme.muted}
                style={[
                  styles.addInput,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.card, fontFamily: Fonts.body },
                ]}
              />
              <Button
                testID="group-member-add"
                label="Add"
                icon="plus"
                variant="outline"
                height={44}
                disabled={!memberQuery.trim()}
                onPress={addMember}
              />
            </View>
            {suggestions.length > 0 ? (
              <View style={styles.memberChips}>
                {suggestions.map((friend) => (
                  <MemberToggleChip
                    key={friend.id}
                    friend={friend}
                    selected={false}
                    onPress={() => {
                      onToggleFriend(friend.id);
                      setMemberQuery('');
                    }}
                  />
                ))}
              </View>
            ) : null}
            <ThemedText tone="muted" style={styles.membersHint}>
              New names are saved as friends too.
            </ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.alertRow}>
              <View style={styles.alertText}>
                <View style={styles.alertTitleRow}>
                  <ThemedText style={[styles.alertTitle, { color: theme.text }]}>
                    Balance alert
                  </ThemedText>
                  <View style={[styles.tag, { backgroundColor: theme.track }]}>
                    <ThemedText style={[styles.tagLabel, { color: theme.text }]}>Finnri plan</ThemedText>
                  </View>
                </View>
                <ThemedText tone="muted" style={styles.caption}>
                  Mark this group when someone reaches a balance limit.
                </ThemedText>
              </View>
              <HapticSwitch
                accessibilityLabel="Balance alert"
                value={balanceAlertEnabled}
                onValueChange={onToggleBalanceAlert}
              />
            </View>
            {balanceAlertEnabled ? (
              <View style={[styles.row, styles.amountRow, { borderTopColor: theme.border }]}>
                <ThemedText tone="muted" style={styles.rowLabel}>
                  Alert at
                </ThemedText>
                <ThemedText style={[styles.rupee, { color: theme.text }]}>{CURRENCY_SYMBOL}</ThemedText>
                <TextInput
                  accessibilityLabel="Balance amount"
                  value={balanceAlertAmount}
                  onChangeText={onChangeBalanceAlertAmount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.muted}
                  style={[styles.amountInput, { color: theme.text, fontFamily: Fonts.title }]}
                />
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton label={doneLabel} loading={saving} onPress={onDone} />
        </View>
      </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  membersCard: {
    gap: 10,
    padding: 14,
  },
  membersLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  youChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  youLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  newChip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  newChipLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
  },
  membersHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  sheet: {
    flexShrink: 1,
    overflow: 'hidden',
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
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  body: {
    gap: 12,
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photo: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 12,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 16,
  },
  removePhoto: {
    alignSelf: 'flex-start',
    marginTop: -4,
  },
  link: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  kinds: {
    flexDirection: 'row',
    gap: 6,
  },
  kind: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 20,
  },
  kindLabel: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rowLabel: {
    width: 92,
    fontSize: 14,
    lineHeight: 20,
  },
  rowValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  members: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  alertText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  amountRow: {
    borderTopWidth: 1,
  },
  rupee: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
