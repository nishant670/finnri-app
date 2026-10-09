import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { CreditUsageBar } from '@/components/accounts/CreditUsageBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccountListSkeleton } from '@/components/accounts/AccountSkeletons';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  accountVisuals,
  formatAccountIdentifier,
  getAccountVisual,
  getAccountHeadline,
  getCreditDueLabel,
  getCreditUsage,
  getLastActivityLabel,
  getRunningBalance,
  hasLedgerActivity,
  hasOpeningBalance,
} from '@/lib/account-display';
import { formatMoney } from '@/lib/money';
import { Account, type AccountType, fetchAccounts, normalizeAccountType } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';

const TView = cssInterop(ThemedView, { className: 'style' });
const TText = cssInterop(ThemedText, { className: 'style' });

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

type AccountBadge = {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  textColor: string;
  bgColor: string;
};

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
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const colorScheme = themeTokens.mode;
  const { token } = useAuthStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeFilter, setActiveFilter] = useState<AccountFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const surfaceColor = useMemo(() => theme.card, [theme.card]);
  const borderColor = useMemo(() => theme.border, [theme.border]);

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
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View className="flex-1 justify-center">
          <StateView
            icon="wifi-off"
            title="Accounts did not load"
            message={error}
            actionLabel="Try again"
            onAction={() => void loadAccounts()}
          />
        </View>
      </View>
    );
  }

  const renderAccountRow = (account: Account) => {
    const accountType = normalizeAccountType(account.type);
    const visual = getAccountVisual(account);
    const isCreditCard = accountType === 'credit_card';
    const dueLabel = isCreditCard ? getCreditDueLabel(account.due_day) : null;
    const headline = getAccountHeadline(account);
    const creditUsage = getCreditUsage(account);
    const runningBalance = getRunningBalance(account);
    const lastActivity = getLastActivityLabel(account);
    const setupBadges: AccountBadge[] = [];

    if (account.is_default) {
      setupBadges.push({
        label: 'Default',
        icon: 'star',
        textColor: colorScheme === 'light' ? '#7C3AED' : '#DDD6FE',
        bgColor: colorScheme === 'light' ? '#F3E8FF' : '#3B2A52',
      });
    }

    if (isCreditCard && !dueLabel) {
      setupBadges.push({
        label: 'Add due date',
        icon: 'calendar-alert-outline',
        textColor: '#EA580C',
        bgColor: colorScheme === 'light' ? '#FFF7ED' : '#3A2614',
      });
    } else if (dueLabel) {
      setupBadges.push({
        label: dueLabel,
        icon: 'clock-outline',
        textColor: '#64748B',
        bgColor: colorScheme === 'light' ? '#F1F5F9' : '#243142',
      });
    }

    // An account with transactions is not missing a balance — it has one the
    // ledger derived. This chip now only appears where it is actually true:
    // an account nothing has ever touched and no opening balance to start from.
    if (!isCreditCard && !hasLedgerActivity(account) && !hasOpeningBalance(account)) {
      setupBadges.push({
        label: 'Not used yet',
        icon: 'scale-balance',
        textColor: '#64748B',
        bgColor: colorScheme === 'light' ? '#F1F5F9' : '#243142',
      });
    }

    if (setupBadges.length === 0) {
      setupBadges.push({
        label: 'Ready',
        icon: 'check-circle-outline',
        textColor: '#15803D',
        bgColor: colorScheme === 'light' ? '#DCFCE7' : '#17351F',
      });
    }

    return (
      <Pressable
        key={String(account.id)}
        accessibilityRole="button"
        accessibilityLabel={`View ${account.name}`}
        onPress={() => handleEditAccount(account)}
        className="min-h-[76px] rounded-[26px] px-4 py-4"
        style={{
          backgroundColor: surfaceColor,
          shadowColor: '#000000',
          shadowOpacity: colorScheme === 'light' ? 0.06 : 0,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        }}>
        <View className="flex-row items-center">
          <View
            className="mr-4 h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: visual.bg }}>
            <MaterialCommunityIcons name={visual.icon} size={23} color={visual.color} />
          </View>

          <View className="min-w-0 flex-1 pr-3">
            <TText
              className="text-base"
              numberOfLines={1}
              style={{ fontFamily: Fonts.title, color: theme.text }}>
              {account.name}
            </TText>
            <TText
              className="mt-1 text-xs"
              numberOfLines={1}
              style={{ fontFamily: Fonts.body }}
              lightColor="rgba(26,26,26,0.52)"
              darkColor="rgba(250,250,250,0.62)">
              {formatAccountIdentifier(account)}
            </TText>
            {lastActivity && (
              <TText
                className="mt-0.5 text-xs"
                numberOfLines={1}
                style={{ fontFamily: Fonts.body, color: '#64748B' }}>
                Last activity {lastActivity}
              </TText>
            )}
            <View className="mt-2 flex-row flex-wrap gap-2">
              {setupBadges.slice(0, 2).map((badge) => (
                <View
                  key={badge.label}
                  className="flex-row items-center rounded-full px-2 py-1"
                  style={{ backgroundColor: badge.bgColor }}>
                  <MaterialCommunityIcons name={badge.icon} size={12} color={badge.textColor} />
                  <TText
                    className="ml-1 text-[10px]"
                    numberOfLines={1}
                    style={{ fontFamily: Fonts.title, color: badge.textColor }}>
                    {badge.label}
                  </TText>
                </View>
              ))}
            </View>
          </View>

          <View className="max-w-[38%] items-end">
            <TText
              className="text-[10px] uppercase"
              numberOfLines={1}
              style={{ fontFamily: Fonts.title, color: '#64748B', letterSpacing: 0.5 }}>
              {headline.label}
            </TText>
            <TText
              className="mt-1 text-base"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: Fonts.title, color: theme.text }}>
              {headline.placeholder ?? formatMoney(headline.amount)}
            </TText>
            {runningBalance !== null && (
              <TText
                className="mt-1 text-[11px]"
                numberOfLines={1}
                style={{ fontFamily: Fonts.body, color: '#64748B' }}>
                {formatMoney(runningBalance)} balance
              </TText>
            )}
          </View>
        </View>

        {creditUsage && <CreditUsageBar usage={creditUsage} trackColor={theme.secondary} />}
      </Pressable>
    );
  };

  return (
    <TView className="flex-1" style={{ backgroundColor: theme.background }}>
      <View className="flex-row items-center justify-between gap-4 px-[22px] pb-1">
        <TText
          className="min-w-0 flex-1 text-sm text-black/60 dark:text-white/60"
          style={{ fontFamily: Fonts.body }}>
          Payment sources, so every transaction knows where it came from.
        </TText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add account"
          onPress={() => handleAddAccount()}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accent }}>
          <MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 16,
          paddingBottom: 110,
          gap: 22,
        }}>
        {error && <ErrorBanner message={error} onRetry={() => void loadAccounts()} />}

        {isLoading && accounts.length === 0 ? (
          <AccountListSkeleton />
        ) : accounts.length === 0 ? (
          <View className="gap-5">
            <StateView
              icon="wallet-outline"
              title="Choose your first payment source"
              message="Start with the account or card you use most. Finnri will preselect it when a transaction matches."
              actionLabel="Set up an account"
              onAction={() => handleAddAccount()}
            />

            <View className="gap-3">
              <TText
                className="text-xs uppercase"
                style={{ fontFamily: Fonts.title, color: '#64748B', letterSpacing: 0.8 }}>
                Quick start
              </TText>
              <View className="gap-3">
                {quickAccountOptions.map((option) => {
                  const visual = accountVisuals[option.key];
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${option.label}`}
                      onPress={() => handleAddAccount(option.key)}
                      className="min-h-[74px] flex-row items-center rounded-[24px] border px-4 py-4"
                      style={{ backgroundColor: surfaceColor, borderColor }}>
                      <View
                        className="mr-4 h-11 w-11 items-center justify-center rounded-full"
                        style={{ backgroundColor: visual.bg }}>
                        <MaterialCommunityIcons name={option.icon} size={22} color={visual.color} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <TText
                          className="text-sm"
                          numberOfLines={1}
                          style={{ fontFamily: Fonts.title, color: theme.text }}>
                          {option.label}
                        </TText>
                        <TText
                          className="mt-1 text-xs"
                          numberOfLines={1}
                          style={{ fontFamily: Fonts.body, color: '#64748B' }}>
                          {option.description}
                        </TText>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={22} color="#94A3B8" />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : (
          <>
            <View className="flex-row gap-3">
              <View
                className="min-h-[96px] flex-1 rounded-[24px] border px-4 py-4"
                style={{ backgroundColor: surfaceColor, borderColor }}>
                <MaterialCommunityIcons name="trending-down" size={20} color={theme.accent} />
                <TText
                  className="mt-3 text-[11px] uppercase"
                  style={{ fontFamily: Fonts.title, color: '#64748B', letterSpacing: 0.6 }}>
                  Spent this month
                </TText>
                <TText
                  className="mt-1 text-lg"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontFamily: Fonts.title, color: theme.text }}>
                  {formatMoney(accountSummary.spentThisMonth)}
                </TText>
              </View>
              {accountSummary.creditCards > 0 && (
                <View
                  className="min-h-[96px] flex-1 rounded-[24px] border px-4 py-4"
                  style={{ backgroundColor: surfaceColor, borderColor }}>
                  <MaterialCommunityIcons
                    name="credit-card-clock-outline"
                    size={20}
                    color="#A855F7"
                  />
                  <TText
                    className="mt-3 text-[11px] uppercase"
                    style={{ fontFamily: Fonts.title, color: '#64748B', letterSpacing: 0.6 }}>
                    Card outstanding
                  </TText>
                  <TText
                    className="mt-1 text-lg"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ fontFamily: Fonts.title, color: theme.text }}>
                    {formatMoney(accountSummary.outstanding)}
                  </TText>
                  {accountSummary.creditLimit > 0 && (
                    <TText
                      className="mt-1 text-[11px]"
                      numberOfLines={1}
                      style={{ fontFamily: Fonts.body, color: '#64748B' }}>
                      of {formatMoney(accountSummary.creditLimit)} limit
                    </TText>
                  )}
                </View>
              )}
            </View>

            {accountSummary.cardsMissingDueDate > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveFilter('credit_cards')}
                className="flex-row items-center rounded-[22px] border px-4 py-3"
                style={{
                  backgroundColor: colorScheme === 'light' ? '#FFF7ED' : '#2A2118',
                  borderColor: '#FDBA74',
                }}>
                <MaterialCommunityIcons name="calendar-alert-outline" size={20} color="#F97316" />
                <TText
                  className="ml-3 flex-1 text-sm"
                  style={{
                    fontFamily: Fonts.body,
                    color: colorScheme === 'light' ? '#9A3412' : '#FDBA74',
                  }}>
                  Add due dates to {accountSummary.cardsMissingDueDate} credit card
                  {accountSummary.cardsMissingDueDate > 1 ? 's' : ''} for better reminders.
                </TText>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#F97316" />
              </Pressable>
            )}

            {showFilterChips && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 22 }}
                style={{ marginHorizontal: -22, paddingHorizontal: 22 }}>
                <FilterChip
                  label="All"
                  count={accounts.length}
                  active={activeFilter === 'all'}
                  onPress={() => setActiveFilter('all')}
                />
                {populatedGroups.map((group) => {
                  const visual = accountVisuals[group.types[0]];
                  return (
                    <FilterChip
                      key={group.key}
                      label={group.chipLabel}
                      count={group.accounts.length}
                      icon={visual.icon}
                      iconColor={visual.color}
                      active={activeFilter === group.key}
                      onPress={() =>
                        setActiveFilter(activeFilter === group.key ? 'all' : group.key)
                      }
                    />
                  );
                })}
              </ScrollView>
            )}

            {groupedAccounts.map((group) => (
              <View key={group.key} className="gap-3">
                <TText
                  className="text-xs uppercase"
                  style={{
                    fontFamily: Fonts.title,
                    color: '#64748B',
                    letterSpacing: 0.8,
                  }}>
                  {group.label}
                </TText>
                <View className="gap-3">{group.accounts.map(renderAccountRow)}</View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </TView>
  );
}

type FilterChipProps = {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
};

/**
 * One tap, no modal, and the current state is always on screen.
 *
 * This replaced a dropdown that opened a bottom sheet covering 60% of the
 * display to pick one of eight fixed options — three of which read "0" on an
 * account with four accounts, because the sheet listed every type the app
 * supports rather than the ones the user has. The sheet was taller than the
 * list it filtered, and the list beneath it was already grouped by exactly
 * these headings.
 *
 * Each chip carries its account type's own icon and colour, so a chip and the
 * rows it filters to are visibly the same thing.
 */
function FilterChip({ label, count, active, onPress, icon, iconColor }: FilterChipProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} account${count === 1 ? '' : 's'}`}
      onPress={onPress}
      className="h-11 flex-row items-center gap-2 rounded-full border px-4"
      style={{
        borderColor: active ? theme.accent : theme.border,
        backgroundColor: active ? theme.secondary : theme.card,
      }}>
      {icon && (
        <MaterialCommunityIcons name={icon} size={15} color={active ? theme.accent : iconColor} />
      )}
      <TText
        className="text-sm"
        numberOfLines={1}
        style={{ fontFamily: Fonts.title, color: active ? theme.accent : theme.text }}>
        {label}
      </TText>
      <TText
        className="text-xs"
        style={{ fontFamily: Fonts.body, color: active ? theme.accent : '#64748B' }}>
        {count}
      </TText>
    </Pressable>
  );
}
