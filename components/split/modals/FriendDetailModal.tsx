import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { FriendSettlementsModal } from '@/components/split/modals/FriendSettlementsModal';
import {
  AvatarCircle,
  DetailPill,
  FloatingExpenseButton,
} from '@/components/split/primitives/SplitPrimitives';
import {
  formatBalance,
  formatBillListDate,
  formatMonthYear,
  getFirstName,
  getGroupKindConfig,
  todayApiDate,
} from '@/components/split/split-utils';
import type {
  FriendDetailSummary,
  SplitGroupSummary,
} from '@/components/split/split-types';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function FriendDetailModal({
  summary: liveSummary,
  currentUserName,
  onClose,
  onAddExpense,
  onSettleUp,
  onOpenGroup,
  onOpenOptions,
  onSettlementsChanged,
}: {
  summary: FriendDetailSummary | null;
  currentUserName: string;
  onClose: () => void;
  onAddExpense: (friendId: number) => void;
  onSettleUp: (friendId: number) => void;
  onOpenGroup: (groupId: number) => void;
  onOpenOptions: (friend: SplitFriend) => void;
  /** A settlement was confirmed or denied from the history. */
  onSettlementsChanged?: () => void;
}) {
  const theme = useThemeTokens().colors;
  const summaryRef = useRef<FriendDetailSummary | null>(liveSummary);
  if (liveSummary) summaryRef.current = liveSummary;
  const summary = summaryRef.current;
  const [isSettlementsOpen, setIsSettlementsOpen] = useState(false);
  // The history belongs to the page it was opened from; closing the page
  // closes it too, rather than leaving it open over the Splits tab.
  useEffect(() => {
    if (!liveSummary) setIsSettlementsOpen(false);
  }, [liveSummary]);
  if (!summary) return null;

  const { friend, groups, netBalance } = summary;
  const friendFirstName = getFirstName(friend.name);
  // Which group the outstanding money is in. Taken from the served balances
  // rather than from the bills' participant rows: those name their own author's
  // friend ids, so in a shared group somebody else runs this never matched and
  // the line lost the "in \"Home\"" that tells you where to go and settle it.
  //
  // Named only when it is one group. With money open in two, naming the first
  // put the whole total "in" a group that held a fraction of it.
  const unsettledGroups = groups.filter((group) =>
    (group.group.viewer_balances ?? []).some(
      (entry) => entry.friend_id === friend.id && entry.net_balance !== 0
    )
  );
  const where =
    unsettledGroups.length === 1
      ? ` in "${unsettledGroups[0].group.name}"`
      : unsettledGroups.length > 1
        ? ` across ${unsettledGroups.length} groups`
        : '';
  const balanceCopy =
    netBalance > 0
      ? `${friendFirstName} owes you ${formatBalance(netBalance)}${where}`
      : netBalance < 0
        ? `You owe ${friendFirstName} ${formatBalance(netBalance)}${where}`
        : // "Settled up" is a claim that money was owed and came back. With
          // nothing split between the two of them yet it is a congratulation
          // for something that never happened, and it hides the prompt this
          // line should be carrying.
          summary.bills.length > 0
          ? `You and ${friendFirstName} are settled up.`
          : `Nothing split with ${friendFirstName} yet.`;
  const groupedRows = groups.reduce((acc, group) => {
    const date = group.latestBill?.date ?? group.group.created_at ?? todayApiDate();
    const section = formatMonthYear(date);
    const rows = acc.get(section) ?? [];
    rows.push(group);
    acc.set(section, rows);
    return acc;
  }, new Map<string, SplitGroupSummary[]>());

  return (
    <AnimatedBottomSheet visible={Boolean(liveSummary)} onClose={onClose} sheetStyle={{ height: '94%' }}>
      <View
        className="flex-1 overflow-hidden rounded-t-[28px] border"
        style={{ backgroundColor: theme.background, borderColor: theme.border }}>
        <View className="min-h-[250px] overflow-hidden" style={{ backgroundColor: theme.accent }}>
          <View
            style={{
              position: 'absolute',
              left: -46,
              bottom: 0,
              width: 190,
              height: 118,
              backgroundColor: `${theme.accent}D9`,
              transform: [{ rotate: '28deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 128,
              top: 54,
              width: 220,
              height: 152,
              backgroundColor: `${theme.onAccent}61`,
              transform: [{ rotate: '-32deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: -34,
              bottom: 10,
              width: 260,
              height: 152,
              backgroundColor: `${theme.onAccent}6B`,
              transform: [{ rotate: '32deg' }],
            }}
          />
          <View>
            <View className="flex-row items-center justify-between px-5 pt-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close friend"
                onPress={onClose}
                className="h-12 w-12 items-center justify-center rounded-full">
                <MaterialCommunityIcons name="arrow-left" size={30} color={theme.onAccent} />
              </Pressable>
              <View className="flex-row gap-4">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Search friend activity"
                  className="h-12 w-12 items-center justify-center rounded-full">
                  <MaterialCommunityIcons name="magnify" size={28} color={theme.onAccent} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${friend.name} options`}
                  onPress={() => onOpenOptions(friend)}
                  className="h-12 w-12 items-center justify-center rounded-full">
                  <MaterialCommunityIcons name="cog-outline" size={28} color={theme.onAccent} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        <View className="-mt-16 px-8">
          <AvatarCircle label={friend.name} size={112} borderColor={theme.onAccent} />
          <TText variant="screenTitle" className="mt-4" style={{ color: theme.text }}>
            {friend.name}
          </TText>
          <TText className="mt-6 text-lg leading-7" style={{ color: theme.text }}>
            {balanceCopy}
          </TText>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 132, paddingTop: 30 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}>
            <DetailPill
              label="Settle up"
              icon="hand-coin-outline"
              onPress={() => onSettleUp(friend.id)}
            />
            <DetailPill
              label="Settlements"
              icon="history"
              onPress={() => setIsSettlementsOpen(true)}
            />
            <DetailPill label="Remind..." icon="bell-ring-outline" />
            <DetailPill label="Charts" icon="diamond-stone" />
            <DetailPill label="Convert" icon="diamond-stone" />
          </ScrollView>

          <View className="mt-8">
            {groups.length > 0 ? (
              [...groupedRows.entries()].map(([section, sectionGroups]) => (
                <View key={section} className="mb-7">
                  <TText
                    className="mb-3 text-base"
                    style={{ color: theme.mutedStrong, fontFamily: Fonts.title }}>
                    {section}
                  </TText>
                  {sectionGroups.map((group) => (
                    <FriendSharedGroupRow
                      key={group.group.id}
                      summary={group}
                      friendId={friend.id}
                      onPress={() => onOpenGroup(group.group.id)}
                    />
                  ))}
                </View>
              ))
            ) : (
              <View className="items-center px-6 py-16">
                <AvatarCircle label={friend.name} size={70} />
                <TText
                  className="mt-5 text-center text-lg"
                  style={{ color: theme.text, fontFamily: Fonts.title }}>
                  No shared groups yet
                </TText>
                <TText className="mt-2 text-center text-sm leading-5" style={{ color: theme.muted }}>
                  Add an expense with {friendFirstName} or include them in a group to see history
                  here.
                </TText>
              </View>
            )}
          </View>
        </ScrollView>

        <FloatingExpenseButton onPress={() => onAddExpense(friend.id)} />
      </View>
      {isSettlementsOpen && liveSummary ? (
        <FriendSettlementsModal
          friend={friend}
          onClose={() => setIsSettlementsOpen(false)}
          onSettleUp={() => {
            setIsSettlementsOpen(false);
            onSettleUp(friend.id);
          }}
          onChanged={onSettlementsChanged}
        />
      ) : null}
    </AnimatedBottomSheet>
  );
}

function FriendSharedGroupRow({
  summary,
  friendId,
  onPress,
}: {
  summary: SplitGroupSummary;
  friendId: number;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  const kindConfig = getGroupKindConfig(summary.kind);
  const date = formatBillListDate(
    summary.latestBill?.date ?? summary.group.created_at ?? todayApiDate()
  );
  // What is still open with this friend in this group, as the group's own
  // card shows it. Summing the bills' shares counted every expense ever split
  // and none of the settlements, so a group settled down to ₹2,014 read
  // "you lent ₹16,337". Older servers without served balances keep the sum.
  const served = summary.group.viewer_balances;
  const friendNet = served
    ? (served.find((entry) => entry.friend_id === friendId)?.net_balance ?? 0)
    : summary.bills.reduce((sum, bill) => {
        const participant = bill.participants?.find((item) => item.friend_id === friendId);
        if (!participant) return sum;
        return (
          sum +
          (participant.direction === 'friend_owes_user'
            ? participant.share_amount
            : -participant.share_amount)
        );
      }, 0);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[78px] flex-row items-center gap-4 py-2">
      <View className="w-10 items-center">
        <TText className="text-sm" style={{ color: theme.muted }}>{date.month}</TText>
        <TText className="text-xl" style={{ color: theme.muted }}>{date.day}</TText>
      </View>
      <View
        className="h-16 w-16 items-center justify-center overflow-hidden rounded-xl"
        style={{ backgroundColor: theme.accent }}>
        {summary.group.photo_url ? (
          <Image
            source={{ uri: summary.group.photo_url }}
            style={{ height: '100%', width: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <MaterialCommunityIcons name={kindConfig.icon} size={32} color={theme.onAccent} />
        )}
      </View>
      <View className="flex-1">
        <TText variant="screenTitle" style={{ color: theme.text }}>
          {summary.group.name}
        </TText>
        <TText className="mt-1 text-sm" style={{ color: theme.muted }}>Shared group</TText>
      </View>
      <View className="items-end">
        {friendNet === 0 ? (
          <TText className="text-base" style={{ color: theme.muted }}>
            {summary.bills.length > 0 ? 'settled up' : 'no expenses yet'}
          </TText>
        ) : (
          <>
            <TText
              className="text-sm"
              style={{ color: friendNet > 0 ? theme.positive : theme.negative, fontFamily: Fonts.title }}>
              {friendNet > 0 ? 'owes you' : 'you owe'}
            </TText>
            <TText
              className="mt-1 text-lg"
              style={{ color: friendNet > 0 ? theme.positive : theme.negative, fontFamily: Fonts.title }}>
              {formatBalance(friendNet)}
            </TText>
          </>
        )}
      </View>
    </Pressable>
  );
}
