import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { cssInterop } from 'nativewind';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountDetailSkeleton } from '@/components/accounts/AccountSkeletons';
import { CardLimitRing } from '@/components/accounts/CardLimitRing';
import { CreditUsageBar } from '@/components/accounts/CreditUsageBar';
import { EMIPlanFormSheet } from '@/components/statements/EMIPlanFormSheet';
import { EMIPlansSection } from '@/components/statements/EMIPlansSection';
import { ItemizationBanner } from '@/components/statements/ItemizationBanner';
import { PaymentFormSheet } from '@/components/statements/PaymentFormSheet';
import { StatementFormSheet } from '@/components/statements/StatementFormSheet';
import { StatementSummaryCard } from '@/components/statements/StatementSummaryCard';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { ThemedConfirmDialog, ThemedDeleteDialog } from '@/components/ui/ThemedConfirmDialog';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  accountVisuals,
  formatAccountIdentifier,
  getAccountHeadline,
  getAccountVisual,
  getCardLimit,
  getCreditDueLabel,
  getCreditReminderLabel,
  getCreditUsage,
  getCurrentStatement,
  getLastActivityLabel,
  getRunningBalance,
} from '@/lib/account-display';
import { formatMoney } from '@/lib/money';
import {
  Account,
  AccountApiError,
  deleteAccount,
  fetchAccounts,
  markCardPaidOff,
  normalizeAccountType,
  toAccountPayload,
  updateAccount,
} from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { EMIPlan, EMIPlanPayload, createCardEMIPlan, fetchCardEMIPlans } from '@/lib/emi-plans';
import {
  CardStatement,
  CardStatementPayload,
  StatementPaymentPayload,
  fetchStatement,
  recordStatementPayment,
  saveCardStatement,
} from '@/lib/statements';
import { loadTransactions } from '@/lib/transactions';
import { calendarDay } from '@/lib/statement-dates';
import { Transaction } from '@/types/transaction';

const TText = cssInterop(ThemedText, { className: 'style' });

/**
 * Back, the screen's name, and the actions menu.
 *
 * Shared with the loading frame, where `onActions` is omitted: the menu acts on
 * an account that has not arrived, and a button that does nothing is worse than
 * a gap. The gap is still 44pt wide so the title stays where it will be.
 */
function DetailHeader({
  onBack,
  onActions,
  pending = false,
}: {
  onBack: () => void;
  onActions?: () => void;
  pending?: boolean;
}) {
  const theme = useThemeTokens().colors;

  return (
    <View className="flex-row items-center justify-between px-6 pb-4 pt-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: theme.card }}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
      </Pressable>
      <TText
        className="text-sm uppercase"
        style={{ fontFamily: Fonts.title, color: theme.text, letterSpacing: 1.2 }}>
        Account Details
      </TText>
      {onActions ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account actions"
          onPress={onActions}
          className="h-11 w-11 items-center justify-center rounded-full">
          {pending ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <MaterialCommunityIcons name="dots-horizontal" size={24} color="#8EA0B8" />
          )}
        </Pressable>
      ) : (
        <View className="h-11 w-11" />
      )}
    </View>
  );
}

const formatActivityAmount = (transaction: Transaction) => {
  const isIncome = transaction.entryType === 'income' || transaction.amount >= 0;
  return `${isIncome ? '+ ' : '- '}${formatMoney(Math.abs(transaction.amount))}`;
};

type SetupItem = {
  label: string;
  complete: boolean;
};

/**
 * The prompt on a card that has never had a bill entered.
 *
 * Says what the user gets rather than what Finnri wants: without a statement
 * the card's outstanding is only as complete as what they remembered to log,
 * and the whole point of entering the bill is that the number stops being an
 * estimate.
 */
function NoStatementCard({ onAdd }: { onAdd: () => void }) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  return (
    <View
      className="mt-7 rounded-[26px] border px-5 py-5"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-start gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: themeTokens.mode === 'light' ? '#EFF6FF' : '#12233A' }}>
          <MaterialCommunityIcons name="file-document-outline" size={20} color="#3B82F6" />
        </View>
        <View className="min-w-0 flex-1">
          <TText className="text-base" style={{ fontFamily: Fonts.title, color: theme.text }}>
            Track your bill
          </TText>
          <TText className="mt-1 text-sm" style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
            Add the total from your statement and Finnri will track what&apos;s due, what
            you&apos;ve paid, and how much of your limit is free.
          </TText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        className="mt-4 h-12 flex-row items-center justify-center gap-2 rounded-full"
        style={{ backgroundColor: theme.accent }}>
        <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
        <TText className="text-sm" style={{ fontFamily: Fonts.title, color: '#FFFFFF' }}>
          Add statement
        </TText>
      </Pressable>
    </View>
  );
}

export default function AccountDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const accountId = Number(id);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const colorScheme = themeTokens.mode;
  const { token } = useAuthStore();

  const [account, setAccount] = useState<Account | null>(null);
  const [activity, setActivity] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActionsSheetVisible, setIsActionsSheetVisible] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [isPaidOffDialogVisible, setIsPaidOffDialogVisible] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // The account list carries the bill, but not its reconciliation — that is
  // computed per statement on the detail endpoint. Fetched separately so the
  // card can say what it cannot account for.
  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [isStatementSheetVisible, setIsStatementSheetVisible] = useState(false);
  const [isPaymentSheetVisible, setIsPaymentSheetVisible] = useState(false);
  const [isSubmittingStatement, setIsSubmittingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [emiPlans, setEmiPlans] = useState<EMIPlan[]>([]);
  const [isEmiSheetVisible, setIsEmiSheetVisible] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!token || !Number.isFinite(accountId) || accountId <= 0) {
      setIsLoading(false);
      setError('Account not found.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [accounts, transactions] = await Promise.all([
        fetchAccounts(token),
        loadTransactions(token, { account_id: accountId, page: 1, page_size: 5 }),
      ]);
      const matchedAccount = accounts.find((candidate) => candidate.id === accountId);
      if (!matchedAccount) {
        throw new Error('Account not found.');
      }
      setAccount(matchedAccount);
      setAccounts(accounts);
      setActivity(transactions.slice(0, 5));

      if (normalizeAccountType(matchedAccount.type) === 'credit_card') {
        // A failure here costs the EMI section, not the screen.
        try {
          setEmiPlans(await fetchCardEMIPlans(token, accountId));
        } catch {
          setEmiPlans([]);
        }
      }

      const currentStatement = getCurrentStatement(matchedAccount);
      if (currentStatement) {
        // A failure here costs the reconciliation banner, not the screen, so
        // it is swallowed rather than thrown.
        try {
          setStatement(await fetchStatement(token, currentStatement.id));
        } catch {
          setStatement(null);
        }
      } else {
        setStatement(null);
      }
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load account.'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, token]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
    }, [loadDetails])
  );

  const visual = useMemo(() => {
    return account ? getAccountVisual(account) : accountVisuals.other;
  }, [account]);

  const accountType = account ? normalizeAccountType(account.type) : 'other';
  const isCreditCard = accountType === 'credit_card';
  const dueLabel = account ? getCreditDueLabel(account.due_day) : null;
  const reminderLabel = account ? getCreditReminderLabel(account) : null;
  // The hero was labelled "Balance"/"Total Due" over a number that was neither:
  // a stale manual figure, or on a card the credit limit itself.
  const headline = account ? getAccountHeadline(account) : null;
  const creditUsage = account ? getCreditUsage(account) : null;
  const cardLimit = account ? getCardLimit(account) : null;
  const currentStatement = account ? getCurrentStatement(account) : null;
  const canMarkPaidOff = Boolean(
    isCreditCard &&
      !currentStatement &&
      cardLimit?.outstanding_source === 'ledger' &&
      cardLimit.outstanding > 0
  );
  const runningBalance = account ? getRunningBalance(account) : null;
  const lastActivity = account ? getLastActivityLabel(account) : null;
  const setupItems = useMemo<SetupItem[]>(() => {
    if (!account) return [];
    const hasProvider = Boolean(account.provider?.trim());
    const hasIdentifier = Boolean(
      account.last4?.trim() ||
        account.upi_handle?.trim() ||
        account.wallet_nickname?.trim() ||
        account.identifier?.trim()
    );
    const hasBalance = typeof account.balance === 'number' && account.balance !== 0;
    const hasCreditLimit = Boolean(account.credit_limit && account.credit_limit > 0);
    const hasDueDay = Boolean(account.due_day && account.due_day >= 1 && account.due_day <= 31);

    if (isCreditCard) {
      return [
        { label: 'Card issuer added', complete: hasProvider },
        { label: 'Last 4 digits added', complete: hasIdentifier },
        { label: 'Credit limit added', complete: hasCreditLimit },
        { label: 'Due date added', complete: hasDueDay },
      ];
    }

    if (accountType === 'cash') {
      return [{ label: 'Opening cash balance added', complete: hasBalance }];
    }

    // "Manual balance" described a number that sat there; "opening balance" is
    // what it actually is now that the ledger runs a balance forward from it.

    const providerLabel =
      accountType === 'upi'
        ? 'UPI app added'
        : accountType === 'wallet'
          ? 'Wallet added'
          : 'Provider added';
    const identifierLabel =
      accountType === 'upi'
        ? 'UPI handle or nickname added'
        : accountType === 'wallet'
          ? 'Wallet nickname added'
          : 'Last 4 digits added';

    return [
      { label: providerLabel, complete: hasProvider },
      { label: identifierLabel, complete: hasIdentifier },
      { label: 'Opening balance added', complete: hasBalance },
    ];
  }, [account, accountType, isCreditCard]);
  const incompleteSetupItems = setupItems.filter((item) => !item.complete);
  const setupComplete = incompleteSetupItems.length === 0;

  const handleEdit = (focus?: 'details') => {
    if (!account) return;
    router.push({
      pathname: '/accounts/manage',
      params: { id: String(account.id), ...(focus ? { focus } : {}) },
    });
  };

  const handleSetDefault = async () => {
    if (!token || !account || account.is_default) return;
    setIsPending(true);
    setError(null);
    try {
      await updateAccount(token, account.id, toAccountPayload({ ...account, is_default: true }));
      await loadDetails();
    } catch (updateError) {
      setError(getFriendlyErrorMessage(updateError, 'Unable to update account.'));
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = () => {
    if (!token || !account) return;
    setIsPending(true);
    setError(null);
    void deleteAccount(token, account.id)
      .then(() => {
        setIsDeleteDialogVisible(false);
        router.back();
      })
      .catch((deleteError: unknown) => {
        if (deleteError instanceof AccountApiError && deleteError.code === 'account_in_use') {
          setError('Move or delete linked transactions before deleting this account.');
          return;
        }
        setError(getFriendlyErrorMessage(deleteError, 'Unable to delete account.'));
      })
      .finally(() => setIsPending(false));
  };

  const handleMarkPaidOff = async () => {
    if (!token || !account || !canMarkPaidOff || isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await markCardPaidOff(token, account.id);
      setIsPaidOffDialogVisible(false);
      await loadDetails();
    } catch (paidOffError) {
      setIsPaidOffDialogVisible(false);
      setError(getFriendlyErrorMessage(paidOffError, 'Unable to mark this card paid off.'));
    } finally {
      setIsPending(false);
    }
  };

  const openSettings = () => {
    if (!account) return;
    setIsActionsSheetVisible(true);
  };

  const handleSaveStatement = async (payload: CardStatementPayload) => {
    if (!token || !account) return;
    setIsSubmittingStatement(true);
    setStatementError(null);
    try {
      const saved = await saveCardStatement(token, account.id, payload);
      setStatement(saved);
      setIsStatementSheetVisible(false);
      // The bill changes the card's outstanding and available limit, both of
      // which live on the account, so the whole screen is refetched.
      await loadDetails();
    } catch (saveError) {
      setStatementError(getFriendlyErrorMessage(saveError, 'Unable to save this statement.'));
    } finally {
      setIsSubmittingStatement(false);
    }
  };

  const handleRecordPayment = async (payload: StatementPaymentPayload) => {
    if (!token || !statement) return;
    setIsSubmittingStatement(true);
    setStatementError(null);
    try {
      const updated = await recordStatementPayment(token, statement.id, payload);
      setStatement(updated);
      setIsPaymentSheetVisible(false);
      await loadDetails();
    } catch (paymentError) {
      setStatementError(getFriendlyErrorMessage(paymentError, 'Unable to record this payment.'));
    } finally {
      setIsSubmittingStatement(false);
    }
  };

  const openCycleTransactions = () => {
    if (!account) return;
    router.push({
      pathname: '/transactions',
      params: {
        accountId: String(account.id),
        // Through `calendarDay`: the filter takes YYYY-MM-DD and nothing else, so
        // a boundary that arrived as a timestamp opened this screen onto
        // "Transactions did not load" instead of the cycle it was meant to show.
        ...(statement
          ? {
              start_date: calendarDay(statement.cycle_start),
              end_date: calendarDay(statement.cycle_end),
            }
          : {}),
      },
    });
  };

  const handleCreateEMIPlan = async (payload: EMIPlanPayload) => {
    if (!token || !account) return;
    setIsSubmittingStatement(true);
    setStatementError(null);
    try {
      await createCardEMIPlan(token, account.id, payload);
      setIsEmiSheetVisible(false);
      // A new plan blocks limit immediately, so the card's headline changes.
      await loadDetails();
    } catch (createError) {
      setStatementError(getFriendlyErrorMessage(createError, 'Unable to create this EMI plan.'));
    } finally {
      setIsSubmittingStatement(false);
    }
  };

  const openStatementHistory = () => {
    if (!account) return;
    router.push({ pathname: '/statements', params: { accountId: String(account.id) } });
  };

  const openAllTransactions = () => {
    if (!account) return;
    router.push({ pathname: '/transactions', params: { accountId: String(account.id) } });
  };

  const renderActivityItem = (transaction: Transaction) => {
    const isIncome = transaction.entryType === 'income' || transaction.amount >= 0;

    return (
      <Pressable
        key={transaction.id}
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: '/entry/[id]',
            params: {
              id: transaction.id,
              name: transaction.name,
              category: transaction.category,
              amount: String(Math.abs(transaction.amount)),
              entryType: transaction.entryType ?? 'expense',
              section: transaction.section,
              mode: transaction.mode ?? '',
              notes: transaction.notes ?? '',
              merchant: transaction.merchant ?? '',
              dateLabel: transaction.dateLabel ?? '',
              rawDate: transaction.rawDate ?? '',
              tag: transaction.tag ?? '',
            },
          })
        }
        className="min-h-[88px] flex-row items-center rounded-[24px] px-4 py-4"
        style={{
          backgroundColor: theme.card,
          shadowColor: '#000000',
          shadowOpacity: colorScheme === 'light' ? 0.04 : 0,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 1,
        }}>
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: transaction.bgColor ?? '#F1F5F9' }}>
          <MaterialCommunityIcons
            name={transaction.icon}
            size={22}
            color={transaction.color ?? '#64748B'}
          />
        </View>
        <View className="min-w-0 flex-1 pr-3">
          <TText
            className="text-base"
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, color: theme.text }}>
            {transaction.name}
          </TText>
          <TText
            className="mt-1 text-xs"
            numberOfLines={1}
            style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
            {transaction.category} • {transaction.section}
          </TText>
        </View>
        <TText
          className="text-sm"
          numberOfLines={1}
          style={{
            fontFamily: Fonts.title,
            color: isIncome ? '#16A34A' : theme.text,
          }}>
          {formatActivityAmount(transaction)}
        </TText>
      </Pressable>
    );
  };

  // Back and the title are known before the account is, so they are drawn for
  // real. Only the parts that depend on which account this turns out to be are
  // placeholders — a header that shimmers is a header claiming to be loading.
  if (isLoading && !account) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={['top', 'left', 'right']}>
        <DetailHeader onBack={() => router.back()} />
        <AccountDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (error && !account) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View className="flex-1 justify-center">
          <StateView
            icon="wifi-off"
            title="Account did not load"
            message={error}
            actionLabel="Try again"
            onAction={() => void loadDetails()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!account) return null;

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']}>
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <DetailHeader onBack={() => router.back()} onActions={openSettings} pending={isPending} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 30, paddingBottom: 110 }}>
          {error && <ErrorBanner message={error} style={{ marginBottom: 16 }} />}

          {/* Standard card surface. The one-off lavender was the only place in
              the app using that colour, and it made a screen full of derived
              figures look like a promotional panel. */}
          <View
            className="items-center rounded-[34px] border px-5 py-9"
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor: '#000000',
              shadowOpacity: colorScheme === 'light' ? 0.06 : 0,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 16 },
            }}>
            <View
              className="h-[68px] w-[68px] items-center justify-center rounded-full"
              style={{ backgroundColor: visual.bg }}>
              <MaterialCommunityIcons name={visual.icon} size={30} color={visual.color} />
            </View>

            <TText
              className="mt-5 text-2xl"
              numberOfLines={1}
              style={{ fontFamily: Fonts.title, color: theme.text }}>
              {account.name}
            </TText>
            <TText
              className="mt-2 text-sm"
              numberOfLines={1}
              style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
              {formatAccountIdentifier(account)}
            </TText>

            {/* A card leads with what it has left to spend — the number people
                open a card screen to find. Everything else keeps the
                spent-this-month headline it already had. */}
            {cardLimit ? (
              <CardLimitRing limit={cardLimit} />
            ) : (
              <>
                <TText
                  className="mt-6 text-xs uppercase"
                  style={{ fontFamily: Fonts.title, color: '#8EA0B8', letterSpacing: 1.4 }}>
                  {headline?.label}
                </TText>
                <TText
                  className="mt-2 text-[38px]"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontFamily: Fonts.title, color: theme.text }}>
                  {headline?.placeholder ?? formatMoney(headline?.amount ?? 0)}
                </TText>
              </>
            )}

            <TText
              className="mt-2 text-xs"
              numberOfLines={1}
              style={{ fontFamily: Fonts.body, color: '#8EA0B8' }}>
              {lastActivity ? `Last activity ${lastActivity}` : 'No transactions yet'}
            </TText>

            {/* The ring already carries utilisation, so the bar would be the
                same fact twice. Non-card accounts never had one. */}
            {creditUsage && !cardLimit && (
              <View className="w-full px-2">
                <CreditUsageBar usage={creditUsage} trackColor={theme.secondary} />
              </View>
            )}

            {/* Superseded by the statement card once a real bill exists, which
                knows the actual due date rather than inferring it from the
                card's due day. */}
            {isCreditCard && dueLabel && !currentStatement && (
              <View className="mt-6 flex-row items-center gap-2 rounded-full border border-red-200 bg-red-50 px-5 py-3">
                <MaterialCommunityIcons name="clock-outline" size={16} color="#F43F5E" />
                <TText className="text-sm" style={{ fontFamily: Fonts.title, color: '#F43F5E' }}>
                  {dueLabel}
                </TText>
              </View>
            )}
          </View>

          {isCreditCard &&
            (currentStatement ? (
              <>
                <StatementSummaryCard
                  statement={currentStatement}
                  onRecordPayment={() => {
                    setStatementError(null);
                    setIsPaymentSheetVisible(true);
                  }}
                  onPress={() =>
                    router.push({
                      pathname: '/statements/[id]',
                      params: { id: String(currentStatement.id) },
                    })
                  }
                />
                {statement?.reconciliation && (
                  <ItemizationBanner
                    reconciliation={statement.reconciliation}
                    onReview={openCycleTransactions}
                  />
                )}
                <View className="mt-3 flex-row items-center justify-between">
                  <Pressable accessibilityRole="button" onPress={openStatementHistory}>
                    <TText
                      className="text-sm"
                      style={{ fontFamily: Fonts.title, color: theme.accent }}>
                      All statements
                    </TText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setStatementError(null);
                      setIsStatementSheetVisible(true);
                    }}>
                    <TText
                      className="text-sm"
                      style={{ fontFamily: Fonts.title, color: theme.accent }}>
                      Add a statement
                    </TText>
                  </Pressable>
                </View>
              </>
            ) : (
              <NoStatementCard
                onAdd={() => {
                  setStatementError(null);
                  setIsStatementSheetVisible(true);
                }}
              />
            ))}

          {isCreditCard && reminderLabel && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${reminderLabel}. Edit reminder settings`}
              onPress={() => handleEdit('details')}
              className="mt-3 flex-row items-center rounded-[22px] border px-4 py-4"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}>
              <MaterialCommunityIcons
                name={account.reminder_enabled === false ? 'bell-off-outline' : 'bell-ring-outline'}
                size={22}
                color={theme.accent}
              />
              <View className="ml-3 flex-1">
                <TText
                  className="text-xs uppercase"
                  style={{ fontFamily: Fonts.title, color: '#8EA0B8' }}>
                  Reminder
                </TText>
                <TText
                  className="mt-1 text-sm"
                  style={{ fontFamily: Fonts.title, color: theme.text }}>
                  {reminderLabel}
                </TText>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color="#8EA0B8" />
            </Pressable>
          )}

          {canMarkPaidOff && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsPaidOffDialogVisible(true)}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-full border py-3"
              style={{ backgroundColor: theme.card, borderColor: theme.border }}>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color={theme.accent} />
              <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.accent }}>
                Mark card paid off
              </TText>
            </Pressable>
          )}

          {isCreditCard && (
            <EMIPlansSection
              plans={emiPlans}
              blockedPrincipal={cardLimit?.emi_blocked_principal ?? 0}
              onAdd={() => {
                setStatementError(null);
                setIsEmiSheetVisible(true);
              }}
              onOpenPlan={(plan) =>
                router.push({ pathname: '/emi-plans/[id]', params: { id: String(plan.id) } })
              }
            />
          )}

          {account.summary && <AccountFigures account={account} runningBalance={runningBalance} />}

          <View className="mt-7 flex-row gap-3">
            <DetailActionButton
              icon="pencil-outline"
              label="Edit"
              active
              onPress={() => handleEdit()}
              textColor="#FFFFFF"
              backgroundColor={theme.accent}
            />
            <DetailActionButton
              icon="delete-outline"
              label="Delete"
              onPress={() => setIsDeleteDialogVisible(true)}
              textColor="#EF4444"
              backgroundColor={theme.card}
              borderColor="#FCA5A5"
            />
          </View>

          <View
            className="mt-7 rounded-[26px] border px-5 py-5"
            style={{ backgroundColor: theme.card, borderColor: theme.border }}>
            <View className="flex-row items-start justify-between gap-4">
              <View className="min-w-0 flex-1">
                <TText className="text-base" style={{ fontFamily: Fonts.title, color: theme.text }}>
                  {setupComplete ? 'Setup complete' : 'Complete setup'}
                </TText>
                <TText
                  className="mt-1 text-sm"
                  style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                  {setupComplete
                    ? 'This account has the key details Finnri needs for cleaner tracking.'
                    : `${incompleteSetupItems.length} detail${incompleteSetupItems.length > 1 ? 's' : ''} missing for better tracking.`}
                </TText>
              </View>
              {!setupComplete && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleEdit('details')}
                  className="rounded-full px-4 py-2"
                  style={{ backgroundColor: theme.accent }}>
                  <TText className="text-xs" style={{ fontFamily: Fonts.title, color: '#FFFFFF' }}>
                    Update
                  </TText>
                </Pressable>
              )}
            </View>

            <View className="mt-4 gap-3">
              {setupItems.map((item) => (
                <View key={item.label} className="flex-row items-center gap-3">
                  <View
                    className="h-7 w-7 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: item.complete
                        ? colorScheme === 'light'
                          ? '#DCFCE7'
                          : '#17351F'
                        : colorScheme === 'light'
                          ? '#F1F5F9'
                          : '#243142',
                    }}>
                    <MaterialCommunityIcons
                      name={item.complete ? 'check' : 'minus'}
                      size={16}
                      color={item.complete ? '#15803D' : '#64748B'}
                    />
                  </View>
                  <TText
                    className="flex-1 text-sm"
                    style={{
                      fontFamily: Fonts.body,
                      color: item.complete ? theme.text : '#64748B',
                    }}>
                    {item.label}
                  </TText>
                </View>
              ))}
            </View>
          </View>

          <View className="mt-9 flex-row items-center justify-between">
            <TText className="text-xl" style={{ fontFamily: Fonts.title, color: theme.text }}>
              Recent Activity
            </TText>
            <Pressable accessibilityRole="button" onPress={openAllTransactions}>
              <TText className="text-sm" style={{ fontFamily: Fonts.title, color: theme.accent }}>
                See All
              </TText>
            </Pressable>
          </View>

          <View className="mt-5 gap-3">
            {activity.length > 0 ? (
              activity.map(renderActivityItem)
            ) : (
              <View className="rounded-[24px] bg-white px-5 py-8 dark:bg-neutral-900">
                <StateView
                  icon="receipt-text-plus-outline"
                  title="No recent activity"
                  message="Transactions linked to this account will show here."
                  compact
                />
              </View>
            )}
          </View>
        </ScrollView>

        <AnimatedBottomSheet
          visible={isActionsSheetVisible}
          onClose={() => setIsActionsSheetVisible(false)}
          sheetStyle={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingHorizontal: 22,
            paddingTop: 18,
            paddingBottom: 34,
          }}>
          <View className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="min-w-0 flex-1 pr-3">
                <TText className="text-lg" style={{ fontFamily: Fonts.title, color: theme.text }}>
                  {account.name}
                </TText>
                <TText
                  className="mt-1 text-xs"
                  style={{ fontFamily: Fonts.body, color: '#7C8EA8' }}>
                  Account actions
                </TText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close account actions"
                onPress={() => setIsActionsSheetVisible(false)}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.secondary }}>
                <MaterialCommunityIcons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            <View className="gap-2">
              {!account.is_default && (
                <AccountActionRow
                  icon="star-outline"
                  label="Set as default"
                  description="Use this account first for matching transactions."
                  color={theme.accent}
                  backgroundColor={theme.secondary}
                  textColor={theme.text}
                  mutedColor="#7C8EA8"
                  onPress={() => {
                    setIsActionsSheetVisible(false);
                    void handleSetDefault();
                  }}
                />
              )}
              <AccountActionRow
                icon="pencil-outline"
                label="Edit account"
                description="Update type, name, balance, or reminders."
                color={theme.accent}
                backgroundColor={theme.secondary}
                textColor={theme.text}
                mutedColor="#7C8EA8"
                onPress={() => {
                  setIsActionsSheetVisible(false);
                  handleEdit();
                }}
              />
              <AccountActionRow
                icon="delete-outline"
                label="Delete account"
                description="Allowed only when no transactions use this account."
                color="#EF4444"
                backgroundColor={colorScheme === 'light' ? '#FEF2F2' : '#3A2020'}
                textColor={theme.text}
                mutedColor="#7C8EA8"
                onPress={() => {
                  setIsActionsSheetVisible(false);
                  setIsDeleteDialogVisible(true);
                }}
              />
            </View>
          </View>
        </AnimatedBottomSheet>

        <ThemedDeleteDialog
          visible={isDeleteDialogVisible}
          title={`Delete ${account.name}?`}
          message="This is allowed only when no transactions use this account."
          confirmLabel="Delete"
          loading={isPending}
          onCancel={() => setIsDeleteDialogVisible(false)}
          onConfirm={handleDelete}
        />

        <ThemedConfirmDialog
          visible={isPaidOffDialogVisible}
          title="Mark this card paid off?"
          message="Use this only after the full card balance has been paid. Finnri will reset its transaction-based estimate to zero and count new card spends from here."
          iconName="check-circle-outline"
          confirmLabel="Mark paid off"
          cancelLabel="Cancel"
          loading={isPending}
          onCancel={() => {
            if (!isPending) setIsPaidOffDialogVisible(false);
          }}
          onConfirm={() => void handleMarkPaidOff()}
        />

        {isCreditCard && (
          <>
            <StatementFormSheet
              visible={isStatementSheetVisible}
              card={account}
              submitting={isSubmittingStatement}
              error={statementError}
              onClose={() => setIsStatementSheetVisible(false)}
              onSubmit={handleSaveStatement}
            />
            <EMIPlanFormSheet
              visible={isEmiSheetVisible}
              cardName={account.name}
              submitting={isSubmittingStatement}
              error={statementError}
              onClose={() => setIsEmiSheetVisible(false)}
              onSubmit={handleCreateEMIPlan}
            />
            <PaymentFormSheet
              visible={isPaymentSheetVisible}
              remainingDue={currentStatement?.remaining_due ?? 0}
              minimumDue={currentStatement?.minimum_due ?? 0}
              accounts={accounts}
              cardId={account.id}
              submitting={isSubmittingStatement}
              error={statementError}
              onClose={() => setIsPaymentSheetVisible(false)}
              onSubmit={handleRecordPayment}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * The figures behind the hero, so the headline can be checked rather than
 * believed — and so the opening balance the user typed is still visible, now
 * labelled as the starting point it actually is.
 */
function AccountFigures({
  account,
  runningBalance,
}: {
  account: Account;
  runningBalance: number | null;
}) {
  const theme = useThemeTokens().colors;
  const summary = account.summary;
  if (!summary) return null;

  const isCreditCard = normalizeAccountType(account.type) === 'credit_card';
  const opening = account.balance ?? 0;

  const rows: { label: string; value: string; muted?: boolean }[] = [
    {
      label: 'Spent this month',
      value: formatMoney(summary.spent_this_month),
    },
  ];

  if (summary.received_this_month > 0) {
    rows.push({
      label: isCreditCard ? 'Paid off this month' : 'Money in this month',
      value: formatMoney(summary.received_this_month),
    });
  }

  rows.push({
    label: 'Transactions this month',
    value: String(summary.entries_this_month),
    muted: true,
  });

  if (opening !== 0) {
    rows.push({
      label: isCreditCard ? 'Owed before tracking' : 'Opening balance',
      value: formatMoney(opening),
      muted: true,
    });
  }

  if (runningBalance !== null) {
    rows.push({ label: 'Running balance', value: formatMoney(runningBalance) });
  }

  rows.push({
    label: 'Spent all time',
    value: formatMoney(summary.lifetime_spent),
    muted: true,
  });

  return (
    <View
      className="mt-7 rounded-[26px] border px-5 py-5"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      {rows.map((row, index) => (
        <View
          key={row.label}
          className="flex-row items-center justify-between gap-4"
          style={{ marginTop: index === 0 ? 0 : 12 }}>
          <TText
            className="min-w-0 flex-1 text-sm"
            style={{ fontFamily: Fonts.body, color: row.muted ? '#7C8EA8' : theme.text }}>
            {row.label}
          </TText>
          <TText
            className="text-sm"
            numberOfLines={1}
            style={{ fontFamily: Fonts.title, color: row.muted ? '#7C8EA8' : theme.text }}>
            {row.value}
          </TText>
        </View>
      ))}
    </View>
  );
}

type AccountActionRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  description: string;
  color: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  onPress: () => void;
};

function AccountActionRow({
  icon,
  label,
  description,
  color,
  backgroundColor,
  textColor,
  mutedColor,
  onPress,
}: AccountActionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[72px] flex-row items-center rounded-[22px] px-4 py-4"
      style={{ backgroundColor }}>
      <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-white/80">
        <MaterialCommunityIcons name={icon} size={21} color={color} />
      </View>
      <View className="min-w-0 flex-1">
        <TText className="text-sm" style={{ fontFamily: Fonts.title, color: textColor }}>
          {label}
        </TText>
        <TText className="mt-1 text-xs" style={{ fontFamily: Fonts.body, color: mutedColor }}>
          {description}
        </TText>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={mutedColor} />
    </Pressable>
  );
}

type DetailActionButtonProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  textColor: string;
  backgroundColor: string;
  borderColor?: string;
  active?: boolean;
};

function DetailActionButton({
  icon,
  label,
  onPress,
  textColor,
  backgroundColor,
  borderColor,
  active = false,
}: DetailActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-[80px] flex-1 items-center justify-center rounded-[22px] border"
      style={{
        backgroundColor,
        borderColor: borderColor ?? backgroundColor,
        shadowColor: '#000000',
        shadowOpacity: active ? 0.18 : 0,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: active ? 3 : 0,
      }}>
      <MaterialCommunityIcons name={icon} size={24} color={textColor} />
      <TText
        className="mt-2 text-sm"
        numberOfLines={1}
        style={{ fontFamily: Fonts.title, color: textColor }}>
        {label}
      </TText>
    </Pressable>
  );
}
