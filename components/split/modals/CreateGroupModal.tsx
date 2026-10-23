import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { MemberToggleChip } from '@/components/split/primitives/SplitPrimitives';
import { groupKindOptions } from '@/components/split/split-utils';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import { PressableView } from '@/components/ui/PressableView';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
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
  onClose: () => void;
  onDone: () => void;
}) {
  const sheetBottom = useBottomInset(24);
  const theme = useThemeTokens().colors;
  // The board draws Members as a row; a sheet cannot open over this one, so
  // the row opens the friend chips in place instead.
  const [membersOpen, setMembersOpen] = useState(false);
  const selectedNames = friends
    .filter((friend) => selectedFriendIds.includes(friend.id))
    .map((friend) => friend.name);
  const membersSummary =
    friends.length === 0
      ? 'No friends yet · add friends first'
      : selectedNames.length > 0
        ? selectedNames.join(', ')
        : 'Choose from your friends';

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      backdropOpacity={0.3}
      sheetStyle={{ maxHeight: '94%' }}>
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: sheetBottom }]}>
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

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <PressableView
              accessibilityRole="button"
              accessibilityState={{ expanded: membersOpen, disabled: friends.length === 0 }}
              accessibilityLabel={`Members, ${membersSummary}`}
              disabled={friends.length === 0}
              onPress={() => setMembersOpen((open) => !open)}
              style={styles.row}
              pressedStyle={styles.pressed}>
              <ThemedText tone="muted" style={styles.rowLabel}>
                Members
              </ThemedText>
              <ThemedText
                numberOfLines={2}
                style={[styles.rowValue, { color: friends.length === 0 ? theme.muted : theme.text }]}>
                {membersSummary}
              </ThemedText>
              <MaterialCommunityIcons
                name={membersOpen ? 'chevron-up' : 'chevron-right'}
                size={20}
                color={theme.muted}
              />
            </PressableView>
            {membersOpen && friends.length > 0 ? (
              <View style={[styles.members, { borderTopColor: theme.border }]}>
                {friends.map((friend) => (
                  <MemberToggleChip
                    key={friend.id}
                    friend={friend}
                    selected={selectedFriendIds.includes(friend.id)}
                    onPress={() => onToggleFriend(friend.id)}
                  />
                ))}
              </View>
            ) : null}
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
  sheet: {
    flexShrink: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
