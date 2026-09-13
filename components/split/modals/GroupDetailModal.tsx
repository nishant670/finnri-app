import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { DetailPill, FloatingExpenseButton } from '@/components/split/primitives/SplitPrimitives';
import {
  formatBalance,
  formatBillListDate,
  getExpenseIconConfig,
  readBillForViewer,
} from '@/components/split/split-utils';
import type { GroupActionMode, SplitGroupSummary } from '@/components/split/split-types';
import { SplitFullScreenModal } from '@/components/split/primitives/SplitFullScreenModal';
import { ThemedText } from '@/components/themed-text';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { sortSplitBills, splitBillSortLabel, type SplitBillSort } from '@/lib/split-bill-sort';
import type { SplitBill, SplitFriend } from '@/lib/splits';

const TText = cssInterop(ThemedText, { className: 'style' });

export function GroupDetailModal({
  summary,
  friendById,
  currentUserName,
  onClose,
  onAddExpense,
  onManageMembers,
  onInviteViaLink,
  onOpenExpense,
  onOpenAction,
  onOpenSettings,
  billSort,
  onOpenSort,
}: {
  summary: SplitGroupSummary | null;
  friendById: Map<number, SplitFriend>;
  currentUserName: string;
  /**
   * Owned by the screen above rather than here. The preference is app-wide, and
   * the sheet that changes it has to be a sibling of this modal rather than a
   * child — see SplitScreen, where every other sheet these screens open is
   * mounted for the same reason.
   */
  billSort: SplitBillSort;
  onOpenSort: () => void;
  onClose: () => void;
  onAddExpense: (groupId: number) => void;
  onManageMembers: (summary: SplitGroupSummary) => void;
  onInviteViaLink: (summary: SplitGroupSummary) => void;
  onOpenExpense: (bill: SplitBill) => void;
  onOpenAction: (summary: SplitGroupSummary, mode: GroupActionMode) => void;
  onOpenSettings: (summary: SplitGroupSummary) => void;
}) {
  const theme = useThemeTokens().colors;
  const [groupSearchVisible, setGroupSearchVisible] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const bills = summary?.bills;
  const sortedBills = useMemo(() => sortSplitBills(bills ?? [], billSort), [bills, billSort]);

  if (!summary) return null;

  // The roster, not `memberIds`: those are the owner's own friend rows, so on
  // anybody else's phone they resolved to nothing and the group announced
  // itself as having one person in it — the reader.
  const others = summary.roster.filter((person) => !person.isViewer);
  const canManageGroup = summary.group.viewer_can_manage === true;
  const canAddExpense = summary.group.viewer_can_add_expense !== false;
  const normalizedGroupSearch = groupSearchQuery.trim().toLowerCase();
  const filteredBills = normalizedGroupSearch
    ? sortedBills.filter((bill) => {
        const participantNames = readBillForViewer(bill, friendById, currentUserName)
          .people.map((person) => person.name)
          .join(' ');
        return [
          bill.title,
          bill.notes ?? '',
          bill.date,
          String(bill.total_amount),
          participantNames,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedGroupSearch);
      })
    : sortedBills;
  const overallCopy =
    summary.netBalance === 0
      ? summary.billCount > 0
        ? 'Everyone is settled up'
        : 'No expenses yet'
      : summary.netBalance > 0
        ? `You are owed ${formatBalance(summary.netBalance)} overall`
        : `You owe ${formatBalance(Math.abs(summary.netBalance))} overall`;

  return (
    <SplitFullScreenModal onClose={onClose}>
      {(close) => (
        <>
          <AppHeader
            title={summary.group.name}
            subtitle={overallCopy}
            onBack={close}
            rightNode={
              <View className="ml-4 flex-row gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Search group"
                  onPress={() => {
                    setGroupSearchVisible((current) => !current);
                    if (groupSearchVisible) setGroupSearchQuery('');
                  }}
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.card }}>
                  <MaterialCommunityIcons
                    name={groupSearchVisible ? 'close' : 'magnify'}
                    size={22}
                    color={theme.accent}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Group settings"
                  onPress={() => onOpenSettings(summary)}
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.card }}>
                  <MaterialCommunityIcons name="cog-outline" size={22} color={theme.accent} />
                </Pressable>
              </View>
            }
          />
          <View className="min-h-[150px] overflow-hidden" style={{ backgroundColor: theme.accent }}>
            <View
              style={{
                position: 'absolute',
                top: -34,
                left: 82,
                width: 260,
                height: 170,
                backgroundColor: `${theme.onAccent}14`,
                transform: [{ rotate: '28deg' }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                right: -78,
                bottom: -4,
                width: 360,
                height: 172,
                backgroundColor: `${theme.onAccent}17`,
                transform: [{ rotate: '-18deg' }],
              }}
            />
            <View className="px-6 pb-8 pt-8">
              <View className="flex-row gap-3">
                {/*
                 * Dates are a trip's shape, not every group's: a home or couple
                 * group runs indefinitely, so offering to bound it with a start
                 * and end date is an invitation to describe it wrongly.
                 */}
                {summary.kind === 'trip' ? (
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-12 flex-row items-center rounded-full border px-4"
                    style={{
                      borderColor: `${theme.onAccent}99`,
                      backgroundColor: `${theme.shadow}14`,
                    }}>
                    <MaterialCommunityIcons
                      name="calendar-blank-outline"
                      size={19}
                      color={theme.onAccent}
                    />
                    <TText variant="button" className="ml-3" style={{ color: theme.onAccent }}>
                      Add trip dates
                    </TText>
                  </Pressable>
                ) : null}
                {/*
                  * Members cannot edit a roster they do not own, but they can
                  * read it — and this pill was simply inert for them, on a
                  * screen that had nowhere else to say who was in the group.
                  * It now takes them to the list in settings instead.
                  */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={canManageGroup ? 'Manage group members' : 'See group members'}
                  onPress={() =>
                    canManageGroup ? onManageMembers(summary) : onOpenSettings(summary)
                  }
                  className="min-h-12 flex-row items-center rounded-full px-4"
                  style={{ backgroundColor: `${theme.shadow}B8` }}>
                  <MaterialCommunityIcons
                    name="account-group-outline"
                    size={19}
                    color={theme.onAccent}
                  />
                  <TText variant="button" className="ml-3" style={{ color: theme.onAccent }}>
                    {summary.roster.length} people
                  </TText>
                </Pressable>
              </View>
            </View>
          </View>

          <KeyboardAvoidingScreen
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 132 }}>
            {groupSearchVisible ? (
              <View
                className="mb-5 min-h-13 flex-row items-center rounded-full border px-4"
                style={{ borderColor: theme.border, backgroundColor: theme.card }}>
                <MaterialCommunityIcons name="magnify" size={22} color={theme.neutral} />
                <TextInput
                  value={groupSearchQuery}
                  onChangeText={setGroupSearchQuery}
                  autoFocus
                  autoCapitalize="none"
                  placeholder="Search expenses"
                  placeholderTextColor={theme.muted}
                  style={{
                    flex: 1,
                    marginLeft: 10,
                    minHeight: 48,
                    color: theme.text,
                    fontFamily: Fonts.body,
                    fontSize: 16,
                  }}
                />
              </View>
            ) : null}

            <View>
              <TText variant="sectionTitle" style={{ color: theme.text }}>
                {overallCopy}
              </TText>
              {summary.detailLines.length > 0 ? (
                <View className="mt-3 border-l-4 py-1 pl-5" style={{ borderColor: theme.border }}>
                  {summary.detailLines.map((line) => (
                    <TText
                      key={line}
                      className="py-1 text-lg leading-7"
                      style={{ color: theme.neutral }}>
                      {line}
                    </TText>
                  ))}
                </View>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-6"
              contentContainerStyle={{ gap: 12 }}>
              <DetailPill
                label="Settle up"
                icon="hand-coin-outline"
                onPress={() => onOpenAction(summary, 'settle')}
              />
              <DetailPill
                label="Totals"
                icon="calculator-variant-outline"
                onPress={() => onOpenAction(summary, 'totals')}
              />
              <DetailPill
                label="Balances"
                icon="scale-balance"
                onPress={() => onOpenAction(summary, 'balances')}
              />
              <DetailPill
                label="Export"
                icon="export-variant"
                onPress={() => onOpenAction(summary, 'export')}
              />
            </ScrollView>

            {/*
             * A group of one is the state every group starts in, and the only
             * way out of it used to be the settings cog — a place you go to
             * change something, not to finish making it. Both routes in belong
             * here, on the screen that is telling you nobody else is in.
             */}
            {others.length === 0 && canManageGroup ? (
              <View
                className="mt-6 rounded-3xl border p-5"
                style={{ backgroundColor: theme.card, borderColor: theme.border }}>
                <TText
                  className="text-center text-lg"
                  style={{ color: theme.text, fontFamily: Fonts.title }}>
                  You&apos;re the only one here
                </TText>
                <TText
                  className="mt-2 text-center text-base leading-6"
                  style={{ color: theme.muted }}>
                  Add the people you split with, or send them a link to join.
                </TText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onManageMembers(summary)}
                  className="mt-5 min-h-14 flex-row items-center justify-center gap-3 rounded-full"
                  style={{ backgroundColor: theme.accent }}>
                  <MaterialCommunityIcons
                    name="account-plus-outline"
                    size={22}
                    color={theme.onAccent}
                  />
                  <TText variant="button" style={{ color: theme.onAccent }}>
                    Add group members
                  </TText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onInviteViaLink(summary)}
                  className="mt-3 min-h-14 flex-row items-center justify-center gap-3 rounded-full border"
                  style={{ borderColor: theme.border }}>
                  <MaterialCommunityIcons name="link-variant" size={22} color={theme.accent} />
                  <TText variant="button" style={{ color: theme.accent }}>
                    Share group link
                  </TText>
                </Pressable>
              </View>
            ) : null}

            <View className="mt-6">
              {/*
               * The list was date-descending with no way out of it, which
               * answers "what happened recently" and nothing else — a group
               * settling up wants the big items first, and an expense somebody
               * edited today sits wherever its own date put it. The control
               * only earns its place once there is more than one row to order.
               */}
              {summary.bills.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sort expenses. Currently ${splitBillSortLabel(billSort)}`}
                  onPress={onOpenSort}
                  className="mb-4 min-h-11 flex-row items-center justify-end gap-2 self-end rounded-full border px-4"
                  style={{ borderColor: theme.border, backgroundColor: theme.card }}>
                  <MaterialCommunityIcons name="sort-variant" size={18} color={theme.accent} />
                  <TText className="text-sm" style={{ color: theme.accent, fontFamily: Fonts.title }}>
                    {splitBillSortLabel(billSort)}
                  </TText>
                </Pressable>
              ) : null}
              {filteredBills.length > 0 ? (
                filteredBills.map((bill) => (
                  <GroupExpenseRow
                    key={bill.id}
                    bill={bill}
                    currentUserName={currentUserName}
                    friendById={friendById}
                    onPress={() => onOpenExpense(bill)}
                  />
                ))
              ) : normalizedGroupSearch ? (
                <View className="items-center px-6 py-20">
                  <MaterialCommunityIcons name="magnify" size={34} color={theme.neutral} />
                  <TText
                    className="mt-4 text-center text-lg"
                    style={{ color: theme.text, fontFamily: Fonts.title }}>
                    No matching expenses
                  </TText>
                  <TText
                    className="mt-2 text-center text-sm leading-5"
                    style={{ color: theme.muted }}>
                    Try searching by title, amount, date, notes, or friend name.
                  </TText>
                </View>
              ) : (
                <View className="items-center px-6 py-24">
                  <View
                    className="h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: theme.secondary }}>
                    <MaterialCommunityIcons
                      name="receipt-text-plus-outline"
                      size={30}
                      color={theme.accent}
                    />
                  </View>
                  <TText
                    className="mt-5 text-center text-lg"
                    style={{ color: theme.text, fontFamily: Fonts.title }}>
                    Add your first expense
                  </TText>
                  <TText
                    className="mt-2 text-center text-sm leading-5"
                    style={{ color: theme.muted }}>
                    Expenses for {summary.group.name} will appear here once you add them.
                  </TText>
                </View>
              )}
            </View>
          </KeyboardAvoidingScreen>

          {canAddExpense ? (
            <FloatingExpenseButton onPress={() => onAddExpense(summary.group.id)} />
          ) : null}
        </>
      )}
    </SplitFullScreenModal>
  );
}

function GroupExpenseRow({
  bill,
  currentUserName,
  friendById,
  onPress,
}: {
  bill: SplitBill;
  currentUserName: string;
  friendById: Map<number, SplitFriend>;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  const date = formatBillListDate(bill.date);
  // Read for whoever is holding the phone. Straight off `participants` this row
  // said "You paid ₹5,880 … you lent ₹2,352" to the member who had done
  // neither: both figures belonged to the man who entered the expense.
  const { payerName, paidByYou, net } = readBillForViewer(bill, friendById, currentUserName);
  const iconConfig = getExpenseIconConfig(bill.title);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[88px] flex-row items-start gap-4 py-3">
      <View className="w-9 items-center pt-1">
        <TText className="text-base" style={{ color: theme.muted }}>
          {date.month}
        </TText>
        <TText variant="cardTitle" style={{ color: theme.muted }}>
          {date.day}
        </TText>
      </View>
      <View
        className="h-16 w-16 items-center justify-center rounded"
        style={{ backgroundColor: theme.secondary }}>
        <MaterialCommunityIcons name={iconConfig.icon} size={34} color={theme.text} />
      </View>
      <View className="flex-1 pt-1">
        <TText variant="cardTitle" style={{ color: theme.text }}>
          {bill.title}
        </TText>
        <TText className="mt-1 text-base" style={{ color: theme.muted }}>
          {paidByYou ? 'You' : payerName} paid {formatBalance(bill.total_amount)}
        </TText>
      </View>
      {net !== 0 ? (
        <View className="items-end pt-1">
          <TText
            className="text-xs"
            style={{ color: net > 0 ? theme.positive : theme.negative, fontFamily: Fonts.title }}>
            {net > 0 ? 'you lent' : 'you borrowed'}
          </TText>
          <TText
            className="mt-1 text-base"
            style={{ color: net > 0 ? theme.positive : theme.negative, fontFamily: Fonts.title }}>
            {formatBalance(net)}
          </TText>
        </View>
      ) : null}
    </Pressable>
  );
}
