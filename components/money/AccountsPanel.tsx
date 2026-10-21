import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PanelActionRow } from '@/components/money/PanelActionRow';
import { ThemedText } from '@/components/themed-text';
import { AccountListSkeleton } from '@/components/accounts/AccountSkeletons';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ListRow } from '@/components/ui/ListRow';
import { PressableView } from '@/components/ui/PressableView';
import { StateView } from '@/components/ui/StateView';
import { GroupHeader, SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  accountVisuals,
  formatAccountIdentifier,
  getAccountVisual,
  getAccountHeadline,
  getCreditDueLabel,
  getLastActivityLabel,
  getRunningBalance,
  hasLedgerActivity,
  hasOpeningBalance,
} from '@/lib/account-display';
import { formatMoney } from '@/lib/money';
import { Account, type AccountType, fetchAccounts, normalizeAccountType } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';

type AccountFilter = 'all' | string;

/**
 * One list of groups, used by both the section headings and the filter chips.
 *
 * These were two arrays: the sheet offered `Wallets` and `UPI` as separate
 * filters while the list only ever renders them under one "Wallets & UPI"
 * heading — so filtering by UPI left a heading naming a type it was hiding.
 * Same class of drift as the four category vocabularies in S3, one screen down.
 */
const accountGroups: { key: string; label: string; chipLabel: string; types: AccountType[] }[] = [
  { key: 'credit_cards', label: 'Credit cards', chipLabel: 'Cards', types: ['credit_card'] },
  { key: 'bank_accounts', label: 'Bank accounts', chipLabel: 'Bank', types: ['bank'] },
  { key: 'debit_cards', label: 'Debit cards', chipLabel: 'Debit', types: ['debit_card'] },
  {
    key: 'wallets_upi',
    label: 'Wallets & UPI',
    chipLabel: 'Wallets & UPI',
    types: ['wallet', 'upi'],
  },
  { key: 'cash', label: 'Cash', chipLabel: 'Cash', types: ['cash'] },
  { key: 'others', label: 'Others', chipLabel: 'Others', types: ['other'] },
];

const quickAccountOptions: {
  key: AccountType;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  {
    key: 'credit_card',
    label: 'Credit card',
    description: 'Track limits and due dates',
    icon: 'credit-card-outline',
  },
  {
    key: 'bank',
    label: 'Bank account',
    description: 'Separate salary and savings',
    icon: 'bank-outline',
  },
  {
    key: 'upi',
    label: 'UPI',
    description: 'Group daily scan payments',
    icon: 'qrcode-scan',
  },
  {
    key: 'wallet',
    label: 'Wallet',
    description: 'Keep prepaid spends clean',
    icon: 'wallet-outline',
  },
  {
    key: 'cash',
    label: 'Cash',
    description: 'Record offline spending',
    icon: 'cash',
  },
];

/**
 * The accounts list, now a segment of the Money tab rather than a tab of its
 * own.
 *
 * It held a permanent slot in the bottom bar while being the emptiest screen
 * in the app — a list of payment sources you set up once and then only revisit
 * when a card changes. It belongs beside the things that spend from it.
 */
type SuggestedAccountSetup = {
  type?: AccountType;
  name?: string;
  provider?: string;
  identifier?: string;
  color?: string;
};

export function AccountsPanel({ suggestedAccount }: { suggestedAccount?: SuggestedAccountSetup }) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const theme = useThemeTokens().colors;
  const { token } = useAuthStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeFilter, setActiveFilter] = useState<AccountFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!token) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setAccounts(await fetchAccounts(token));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load accounts.'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadAccounts();
    }, [loadAccounts])
  );

  // Every group the user actually has, with its accounts already in it. The
  // filter offers exactly these, so an option that returns nothing cannot be
  // built — the old sheet listed all eight types and showed "0" against three
  // of them on this account.
  const populatedGroups = useMemo(
    () =>
      accountGroups
        .map((group) => ({
          ...group,
          accounts: accounts.filter((account) =>
            group.types.includes(normalizeAccountType(account.type))
          ),
        }))
        .filter((group) => group.accounts.length > 0),
    [accounts]
  );

  const groupedAccounts = useMemo(
    () =>
      activeFilter === 'all'
        ? populatedGroups
        : populatedGroups.filter((group) => group.key === activeFilter),
    [populatedGroups, activeFilter]
  );

  // One group is not a choice: filtering it changes nothing, and "All" next to
  // a single chip is a control that cannot do anything.
  const showFilterChips = populatedGroups.length > 1;

  // A filter can go stale — delete the last credit card while "Cards" is
  // selected and the screen would render empty with no way back.
  useEffect(() => {
    if (activeFilter !== 'all' && !populatedGroups.some((group) => group.key === activeFilter)) {
      setActiveFilter('all');
    }
  }, [activeFilter, populatedGroups]);

  // Both tiles are figures the ledger can back. The pair they replaced —
  // "Manual balance" (a number typed once and never revisited) and
  // "Credit limit" (money the user does not have, formatted like money they
  // do) — were the summary-level version of the same lie as the rows.
  const accountSummary = useMemo(() => {
    return accounts.reduce(
      (summary, account) => {
        const accountType = normalizeAccountType(account.type);
        const spentThisMonth = account.summary?.spent_this_month ?? 0;

        if (accountType === 'credit_card') {
          return {
            ...summary,
            spentThisMonth: summary.spentThisMonth + spentThisMonth,
            creditCards: summary.creditCards + 1,
            outstanding: summary.outstanding + (account.summary?.outstanding ?? 0),
            creditLimit: summary.creditLimit + Number(account.credit_limit ?? 0),
            cardsMissingDueDate:
              !account.due_day || account.due_day < 1 || account.due_day > 31
                ? summary.cardsMissingDueDate + 1
                : summary.cardsMissingDueDate,
          };
        }

        return { ...summary, spentThisMonth: summary.spentThisMonth + spentThisMonth };
      },
      {
        spentThisMonth: 0,
        outstanding: 0,
        creditLimit: 0,
        creditCards: 0,
        cardsMissingDueDate: 0,
      }
    );
  }, [accounts]);

  const handleAddAccount = (type?: AccountType) => {
    const suggestionMatchesType = !type || !suggestedAccount?.type || suggestedAccount.type === type;
    const setup = suggestionMatchesType ? suggestedAccount : undefined;
    const selectedType = type ?? setup?.type;
    if (selectedType || setup) {
      router.push({
        pathname: '/accounts/manage',
        params: {
          ...(selectedType ? { type: selectedType } : {}),
          ...(setup?.name ? { name: setup.name } : {}),
          ...(setup?.provider ? { provider: setup.provider } : {}),
          ...(setup?.identifier ? { identifier: setup.identifier } : {}),
          ...(setup?.color ? { color: setup.color } : {}),
        },
      });
    } else {
      router.push('/accounts/manage');
    }
  };

  const handleEditAccount = (account: Account) => {
    router.push({ pathname: '/accounts/[id]', params: { id: String(account.id) } });
  };

  if (error && accounts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <StateView
          icon="wifi-off"
          title="Accounts did not load"
          message={error}
          actionLabel="Try again"
          onAction={() => void loadAccounts()}
        />
      </View>
    );
  }

  const cardStyle = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }];

  /**
   * One account as a 60dp row (board R5-Accounts): its digits or handle and
   * when it was last used under the name; on the right what it owes or spent,
   * and under that the due date — amber "Add due date" when a card has none —
   * or the running balance.
   */
  const renderAccountRow = (account: Account, index: number) => {
    const accountType = normalizeAccountType(account.type);
    const visual = getAccountVisual(account);
    const isCreditCard = accountType === 'credit_card';
    const dueLabel = isCreditCard ? getCreditDueLabel(account.due_day) : null;
    const headline = getAccountHeadline(account);
    const runningBalance = getRunningBalance(account);
    const lastActivity = getLastActivityLabel(account);
    const usedLabel = lastActivity
      ? `used ${/^(Today|Yesterday)$/.test(lastActivity) ? lastActivity.toLowerCase() : lastActivity}`
      : null;
    const meta = [formatAccountIdentifier(account), usedLabel, account.is_default ? 'Default' : null]
      .filter(Boolean)
      .join(' · ');
    const status = isCreditCard
      ? (dueLabel ?? 'Add due date')
      : runningBalance !== null
        ? `${formatMoney(runningBalance)} balance`
        : !hasLedgerActivity(account) && !hasOpeningBalance(account)
          ? 'Not used yet'
          : undefined;

    return (
      <ListRow
        key={String(account.id)}
        icon={visual.icon}
        hue={visual.color}
        title={account.name}
        meta={meta}
        amount={headline.placeholder ?? formatMoney(headline.amount)}
        amountTone={headline.placeholder ? 'muted' : 'default'}
        status={status}
        statusTone={isCreditCard && !dueLabel ? 'warning' : 'muted'}
        divider={index > 0}
        accessibilityLabel={`View ${account.name}`}
        onPress={() => handleEditAccount(account)}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <PanelActionRow
        subtitle="Payment sources, so every transaction knows where it came from."
        actionLabel="Add"
        onAction={() => handleAddAccount()}
        colors={theme}
      />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => void loadAccounts()}
            style={{ marginHorizontal: SCREEN_GUTTER, marginBottom: 10 }}
          />
        )}

        {isLoading && accounts.length === 0 ? (
          <View style={styles.gutter}>
            <AccountListSkeleton />
          </View>
        ) : accounts.length === 0 ? (
          <View>
            <StateView
              icon="wallet-outline"
              title="Choose your first payment source"
              message="Start with the account or card you use most. Finnri will preselect it when a transaction matches."
              actionLabel="Set up an account"
              onAction={() => handleAddAccount()}
            />
            <GroupHeader label="Quick start" />
            <View style={cardStyle}>
              {quickAccountOptions.map((option, index) => (
                <ListRow
                  key={option.key}
                  icon={option.icon}
                  hue={accountVisuals[option.key].color}
                  title={option.label}
                  meta={option.description}
                  chevron
                  divider={index > 0}
                  accessibilityLabel={`Add ${option.label}`}
                  onPress={() => handleAddAccount(option.key)}
                />
              ))}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.tiles}>
              <View style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText tone="muted" style={styles.tileLabel}>
                  Spent this month
                </ThemedText>
                <ThemedText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.tileValue, { color: theme.text }]}>
                  {formatMoney(accountSummary.spentThisMonth)}
                </ThemedText>
              </View>
              {accountSummary.creditCards > 0 && (
                <View style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText tone="muted" style={styles.tileLabel}>
                    Card outstanding
                  </ThemedText>
                  <ThemedText
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={[styles.tileValue, { color: theme.text }]}>
                    {formatMoney(accountSummary.outstanding)}
                  </ThemedText>
                  {accountSummary.creditLimit > 0 && (
                    <ThemedText tone="muted" numberOfLines={1} style={styles.tileCaption}>
                      of {formatMoney(accountSummary.creditLimit)} limit
                    </ThemedText>
                  )}
                </View>
              )}
            </View>

            {accountSummary.cardsMissingDueDate > 0 && (
              <PressableView
                accessibilityRole="button"
                onPress={() => setActiveFilter('credit_cards')}
                style={[
                  styles.notice,
                  { backgroundColor: theme.warningSurface, borderColor: theme.warningBorder },
                ]}
                pressedStyle={styles.pressed}>
                <MaterialCommunityIcons name="calendar-alert-outline" size={20} color={theme.warning} />
                <ThemedText style={[styles.noticeText, { color: theme.text }]}>
                  Add due dates to {accountSummary.cardsMissingDueDate} credit card
                  {accountSummary.cardsMissingDueDate > 1 ? 's' : ''} for better reminders.
                </ThemedText>
                <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text} />
              </PressableView>
            )}

            {showFilterChips && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chips}>
                <FilterChip
                  label="All"
                  count={accounts.length}
                  active={activeFilter === 'all'}
                  onPress={() => setActiveFilter('all')}
                />
                {populatedGroups.map((group) => (
                  <FilterChip
                    key={group.key}
                    label={group.chipLabel}
                    count={group.accounts.length}
                    active={activeFilter === group.key}
                    onPress={() => setActiveFilter(activeFilter === group.key ? 'all' : group.key)}
                  />
                ))}
              </ScrollView>
            )}

            {groupedAccounts.map((group) => (
              <View key={group.key}>
                <GroupHeader
                  label={`${group.label} · ${group.accounts.length}`}
                  total={
                    group.key === 'credit_cards' && accountSummary.outstanding > 0
                      ? `${formatMoney(accountSummary.outstanding)} owed`
                      : undefined
                  }
                />
                <View style={cardStyle}>{group.accounts.map(renderAccountRow)}</View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

type FilterChipProps = {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
};

/**
 * One tap, no modal, and the current state is always on screen.
 *
 * This replaced a dropdown that opened a bottom sheet covering 60% of the
 * display to pick one of eight fixed options — three of which read "0" on an
 * account with four accounts, because the sheet listed every type the app
 * supports rather than the ones the user has. The sheet was taller than the
 * list it filtered, and the list beneath it was already grouped by exactly
 * these headings. Drawn as the redesign's chip (board R5-Accounts): tinted
 * and bold when chosen, the count beside the name.
 */
function FilterChip({ label, count, active, onPress }: FilterChipProps) {
  const theme = useThemeTokens().colors;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} account${count === 1 ? '' : 's'}`}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.selectedFill : theme.card,
          borderColor: active ? theme.selectedBorder : theme.border,
        },
      ]}>
      <ThemedText
        numberOfLines={1}
        style={[styles.chipLabel, { color: theme.text, fontWeight: active ? '700' : '500' }]}>
        {`${label} ${count}`}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 10,
    paddingBottom: 40,
  },
  gutter: {
    marginHorizontal: SCREEN_GUTTER,
  },
  card: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tiles: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: SCREEN_GUTTER,
  },
  tile: {
    flex: 1,
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  tileLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  tileValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tileCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  notice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginHorizontal: SCREEN_GUTTER,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderRadius: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  chipScroll: {
    flexGrow: 0,
    marginTop: 12,
  },
  chips: {
    gap: 8,
    paddingHorizontal: SCREEN_GUTTER,
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
