import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppHeader } from '@/components/navigation/AppHeader';
import { GroupAvatar } from '@/components/split/GroupAvatar';
import { SplitEmptyCard, SplitListCard } from '@/components/split/primitives/SplitChrome';
import {
  formatBalance,
  getExpenseIconConfig,
  getGroupKindConfig,
  readBillForViewer,
} from '@/components/split/split-utils';
import type { GroupActionMode, SplitGroupSummary } from '@/components/split/split-types';
import { SplitFullScreenModal } from '@/components/split/primitives/SplitFullScreenModal';
import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { KeyboardAvoidingScreen } from '@/components/ui/KeyboardAvoidingScreen';
import { ListRow } from '@/components/ui/ListRow';
import { PickerOptionList, PickerSheet, type PickerOption } from '@/components/ui/PickerSheet';
import { PressableView } from '@/components/ui/PressableView';
import { GroupHeader, SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { sortSplitBills, splitBillSortLabel, type SplitBillSort } from '@/lib/split-bill-sort';
import { groupBillsByMonth } from '@/lib/split-screen-model';
import type { SplitBill, SplitFriend } from '@/lib/splits';

/** `10 Oct` from an expense's `YYYY-MM-DD`. */
const shortBillDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year || 2000, (month || 1) - 1, day || 1);
  return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })}`;
};

/** What the viewer lent or borrowed, worded; nothing for an even month. */
const netPhrase = (net: number) =>
  net > 0 ? `you lent ${formatBalance(net)}` : net < 0 ? `you borrowed ${formatBalance(Math.abs(net))}` : undefined;

/**
 * A group's own page (board R6-Group): its tile and name in the header, the
 * balance card with Settle up and Add expense, the Totals · Balances · Export
 * pills, then its expenses a card per month.
 */
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
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
  const months = groupBillsByMonth(
    filteredBills,
    (bill) => readBillForViewer(bill, friendById, currentUserName).net,
    billSort === 'date_desc' || billSort === 'date_asc'
  );
  const kind = getGroupKindConfig(summary.kind);
  const peopleLabel = `${summary.roster.length} ${summary.roster.length === 1 ? 'person' : 'people'}`;
  const net = summary.netBalance;
  const tone = net > 0 ? theme.positive : theme.negative;

  return (
    <SplitFullScreenModal onClose={onClose}>
      {(close) => (
        <>
          {/*
           * Members cannot edit a roster they do not own, but they can read
           * it, so the title (with its people count) takes them to the list
           * in settings instead.
           */}
          <AppHeader
            title={summary.group.name}
            subtitle={`${kind.label} · ${peopleLabel}`}
            onBack={close}
            leading={
              <GroupAvatar
                icon={kind.icon}
                photoUri={summary.group.photo_url || null}
                size={40}
                radius={10}
              />
            }
            onTitlePress={() =>
              canManageGroup ? onManageMembers(summary) : onOpenSettings(summary)
            }
            titleAccessibilityLabel={canManageGroup ? 'Manage group members' : 'See group members'}
            style={{ paddingHorizontal: 16, paddingVertical: 10 }}
            rightNode={
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Search group"
                  onPress={() => {
                    setGroupSearchVisible((current) => !current);
                    if (groupSearchVisible) setGroupSearchQuery('');
                  }}
                  style={styles.iconButton}>
                  <MaterialCommunityIcons
                    name={groupSearchVisible ? 'close' : 'magnify'}
                    size={24}
                    color={theme.text}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Group settings"
                  onPress={() => onOpenSettings(summary)}
                  style={styles.iconButton}>
                  <MaterialCommunityIcons name="cog-outline" size={24} color={theme.text} />
                </Pressable>
                {/* P27: Totals, Balances and Export are occasional, so they
                    live in ⋯ rather than in a strip under every balance. */}
                <Pressable
                  testID="group-more"
                  accessibilityRole="button"
                  accessibilityLabel="More group options"
                  onPress={() => setIsMoreOpen(true)}
                  style={styles.iconButton}>
                  <MaterialCommunityIcons name="dots-vertical" size={24} color={theme.text} />
                </Pressable>
              </View>
            }
          />

          <PickerSheet
            visible={isMoreOpen}
            title={summary.group.name}
            onClose={() => setIsMoreOpen(false)}>
            <PickerOptionList
              accessibilityLabel="More group options"
              options={GROUP_EXTRAS}
              selectedKey={null}
              onSelect={(key) => {
                setIsMoreOpen(false);
                onOpenAction(summary, key as GroupActionMode);
              }}
            />
          </PickerSheet>

          <KeyboardAvoidingScreen
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>
            {groupSearchVisible ? (
              <View style={[styles.search, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <MaterialCommunityIcons name="magnify" size={20} color={theme.muted} />
                <TextInput
                  value={groupSearchQuery}
                  onChangeText={setGroupSearchQuery}
                  autoFocus
                  autoCapitalize="none"
                  placeholder="Search expenses"
                  placeholderTextColor={theme.muted}
                  style={[styles.searchInput, { color: theme.text, fontFamily: Fonts.body }]}
                />
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.balance}>
                {net === 0 ? (
                  <ThemedText style={[styles.zeroTitle, { color: theme.text }]}>
                    {summary.billCount > 0 ? 'Everyone is settled up' : 'No expenses yet'}
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText tone="muted" style={styles.eyebrow}>
                      {net > 0 ? 'You’re owed' : 'You owe'}
                    </ThemedText>
                    <ThemedText style={[styles.amount, { color: tone }]}>
                      {formatBalance(Math.abs(net))}
                    </ThemedText>
                  </>
                )}
                {summary.detailLines.map((line) => (
                  <ThemedText key={line} tone="muted" style={styles.detail}>
                    {line}
                  </ThemedText>
                ))}
                <View style={styles.actions}>
                  <Button
                    variant="outline"
                    height={48}
                    icon="hand-coin-outline"
                    label="Settle up"
                    onPress={() => onOpenAction(summary, 'settle')}
                    style={styles.action}
                  />
                  {canAddExpense ? (
                    <PrimaryButton
                      height={48}
                      icon="receipt-text-plus-outline"
                      label="Add expense"
                      onPress={() => onAddExpense(summary.group.id)}
                      style={styles.action}
                    />
                  ) : null}
                </View>
              </View>
            </View>

            {/*
             * A group of one is the state every group starts in, and the only
             * way out of it used to be the settings cog — a place you go to
             * change something, not to finish making it. Both routes in belong
             * here, on the screen that is telling you nobody else is in.
             */}
            {others.length === 0 && canManageGroup ? (
              <View
                style={[
                  styles.card,
                  styles.alone,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}>
                <ThemedText style={[styles.zeroTitle, { color: theme.text }]}>
                  You&apos;re the only one here
                </ThemedText>
                <ThemedText tone="muted" style={styles.detail}>
                  Add the people you split with, or send them a link to join.
                </ThemedText>
                <View style={styles.actions}>
                  <Button
                    variant="outline"
                    height={44}
                    icon="account-plus-outline"
                    label="Add group members"
                    onPress={() => onManageMembers(summary)}
                    style={styles.action}
                  />
                  <Button
                    variant="outline"
                    height={44}
                    icon="link-variant"
                    label="Share group link"
                    onPress={() => onInviteViaLink(summary)}
                    style={styles.action}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.expensesHead}>
              <ThemedText style={[styles.expensesTitle, { color: theme.text }]}>Expenses</ThemedText>
              {/*
               * The list was date-descending with no way out of it, which
               * answers "what happened recently" and nothing else — a group
               * settling up wants the big items first, and an expense somebody
               * edited today sits wherever its own date put it. The control
               * only earns its place once there is more than one row to order.
               */}
              {summary.bills.length > 1 ? (
                <PressableView
                  accessibilityRole="button"
                  accessibilityLabel={`Sort expenses. Currently ${splitBillSortLabel(billSort)}`}
                  onPress={onOpenSort}
                  hitSlop={6}
                  style={styles.sort}
                  pressedStyle={styles.pressed}>
                  <MaterialCommunityIcons name="sort-variant" size={18} color={theme.text} />
                  <ThemedText style={[styles.sortLabel, { color: theme.text }]}>
                    {splitBillSortLabel(billSort)}
                  </ThemedText>
                </PressableView>
              ) : null}
            </View>

            {months.length > 0 ? (
              months.map((month) => (
                <View key={month.key}>
                  {month.title ? <GroupHeader label={month.title} total={netPhrase(month.net)} /> : null}
                  <SplitListCard>
                    {month.bills.map((bill, index) => (
                      <GroupExpenseRow
                        key={bill.id}
                        bill={bill}
                        currentUserName={currentUserName}
                        friendById={friendById}
                        divider={index > 0}
                        onPress={() => onOpenExpense(bill)}
                      />
                    ))}
                  </SplitListCard>
                </View>
              ))
            ) : normalizedGroupSearch ? (
              <SplitEmptyCard
                icon="magnify"
                title="No matching expenses"
                message="Try searching by title, amount, date, notes, or friend name."
              />
            ) : (
              <SplitEmptyCard
                icon="receipt-text-plus-outline"
                title="Add your first expense"
                message={`Expenses for ${summary.group.name} will appear here once you add them.`}
              />
            )}
          </KeyboardAvoidingScreen>
        </>
      )}
    </SplitFullScreenModal>
  );
}

/** What ⋯ on a group offers (P27), in the order the old strip had them. */
const GROUP_EXTRAS: PickerOption[] = [
  { key: 'totals', label: 'Totals', caption: 'What the group spent, and your share', icon: 'calculator-variant-outline' },
  { key: 'balances', label: 'Balances', caption: 'Who owes whom', icon: 'scale-balance' },
  { key: 'export', label: 'Export', caption: 'Share the expenses as a file', icon: 'export-variant' },
];

function GroupExpenseRow({
  bill,
  currentUserName,
  friendById,
  divider,
  onPress,
}: {
  bill: SplitBill;
  currentUserName: string;
  friendById: Map<number, SplitFriend>;
  divider: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens().colors;
  // Read for whoever is holding the phone. Straight off `participants` this row
  // said "You paid ₹5,880 … you lent ₹2,352" to the member who had done
  // neither: both figures belonged to the man who entered the expense.
  const { payerName, paidByYou, net } = readBillForViewer(bill, friendById, currentUserName);
  const iconConfig = getExpenseIconConfig(bill.title);

  return (
    <ListRow
      icon={iconConfig.icon}
      hue={theme.neutral}
      title={bill.title}
      meta={`${paidByYou ? 'You' : payerName} paid ${formatBalance(bill.total_amount)} · ${shortBillDate(bill.date)}`}
      amount={net !== 0 ? formatBalance(Math.abs(net)) : undefined}
      amountTone={net > 0 ? 'positive' : 'negative'}
      status={net > 0 ? 'you lent' : net < 0 ? 'you borrowed' : undefined}
      statusTone="muted"
      divider={divider}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    marginLeft: 8,
    marginRight: -8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 8,
    paddingBottom: 48,
  },
  search: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: SCREEN_GUTTER,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontSize: 15,
  },
  card: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  balance: {
    gap: 2,
    padding: 16,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  amount: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  zeroTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  detail: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  action: {
    flex: 1,
    paddingHorizontal: 8,
  },
  alone: {
    gap: 2,
    marginTop: 12,
    padding: 16,
  },
  expensesHead: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginHorizontal: SCREEN_GUTTER,
  },
  expensesTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  sort: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
