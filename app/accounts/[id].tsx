import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountDetailSkeleton } from '@/components/accounts/AccountSkeletons';
import { SetupChecklist } from '@/components/accounts/SetupChecklist';
import { TransactionItem } from '@/components/home/TransactionItem';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { SettingsRow } from '@/components/profile/SettingsRow';
import { CardLimitRing } from '@/components/accounts/CardLimitRing';
import { CreditUsageBar } from '@/components/accounts/CreditUsageBar';
import { AnnualFeeCard } from '@/components/accounts/AnnualFeeCard';
import { EMIPlanFormSheet } from '@/components/statements/EMIPlanFormSheet';
import { EMIPlansSection } from '@/components/statements/EMIPlansSection';
import { ItemizationBanner } from '@/components/statements/ItemizationBanner';
import { PaymentFormSheet } from '@/components/statements/PaymentFormSheet';
import { StatementDayDriftDialog } from '@/components/statements/StatementDayDriftDialog';
import { StatementFormSheet } from '@/components/statements/StatementFormSheet';
import { StatementSummaryCard } from '@/components/statements/StatementSummaryCard';
import { ThemedText } from '@/components/themed-text';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PressableView } from '@/components/ui/PressableView';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { StateView } from '@/components/ui/StateView';
import { ThemedDeleteDialog } from '@/components/ui/ThemedConfirmDialog';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import {
  accountTypeLabels,
  accountVisuals,
  formatAccountIdentifier,
  getAccountSetupItems,
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
import { fetchBillingStatus } from '@/lib/billing';
import { isStatementDaySuggestion } from '@/lib/statement-day-drift';
import { intakeFromRead, putStatementIntake } from '@/lib/statement-intake';
import { EMIPlan, EMIPlanPayload, createCardEMIPlan, fetchCardEMIPlans } from '@/lib/emi-plans';
import {
  CardStatement,
  CardStatementPayload,
  StatementDaySuggestion,
  StatementPaymentPayload,
  StatementRead,
  fetchStatement,
  readStatementFile,
  recordStatementPayment,
  saveCardStatement,
} from '@/lib/statements';
import { loadTransactions } from '@/lib/transactions';
import { calendarDay } from '@/lib/statement-dates';
import { formatRelativeDay } from '@/lib/datetime';
import { Transaction } from '@/types/transaction';

/**
 * The line under the account's name: what tells it apart, and when it was
 * last used (boards R5-AcctCard, R5-AcctBank).
 */
const describeLastUse = (lastActivity: string | null) => {
  if (!lastActivity) return 'no transactions yet';
  // "Today", "Yesterday" and "3 days ago" sit mid-sentence; "9 Oct" keeps its capital.
  const relative = /^(Today|Yesterday|\d+ days ago)$/.test(lastActivity);
  return `last used ${relative ? lastActivity.toLowerCase() : lastActivity}`;
};

/**
 * The bill on a card that has never had one entered (board R5-AcctCard):
 * what entering it gets you, the one orange action on the page, and — when
 * the ledger shows money owed — "Mark card paid off" under a rule.
 *
 * Says what the user gets rather than what Finnri wants: without a statement
 * the card's outstanding is only as complete as what they remembered to log,
 * and the whole point of entering the bill is that the number stops being an
 * estimate.
 */
function BillCard({
  tint,
  hue,
  onAdd,
  onMarkPaidOff,
}: {
  tint: string;
  hue: string;
  onAdd: () => void;
  onMarkPaidOff?: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.card, styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.billBody}>
        <View style={styles.billHead}>
          <View style={[styles.tile, { backgroundColor: tint }]}>
            <MaterialCommunityIcons name="file-document-outline" size={18} color={hue} />
          </View>
          <View style={styles.flexText}>
            <ThemedText style={[styles.rowTitle, styles.strong, { color: colors.text }]}>Track your bill</ThemedText>
            <ThemedText tone="muted" style={styles.body}>
              Add the total from your statement to see what is due and what you have paid.
            </ThemedText>
          </View>
        </View>
        <PrimaryButton label="Add statement" icon="plus" height={44} onPress={onAdd} style={styles.billButton} />
      </View>
      {onMarkPaidOff ? (
        <PressableView
          accessibilityRole="button"
          onPress={onMarkPaidOff}
          style={[styles.linkRow, { borderTopColor: colors.border }]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.text} />
          <ThemedText style={[styles.linkLabel, { color: colors.text }]}>Mark card paid off</ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={16} color={colors.muted} />
        </PressableView>
      ) : null}
    </View>
  );
}

/** A section's 15/700 title, with an action on the right. */
function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.sectionHead}>
      <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
        {title}
      </ThemedText>
      {action}
    </View>
  );
}

export default function AccountDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sheetBottom = useBottomInset(28);
  const accountId = Number(id);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();

  const [account, setAccount] = useState<Account | null>(null);
  const [activity, setActivity] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActionsSheetVisible, setIsActionsSheetVisible] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [isPaidOffDialogVisible, setIsPaidOffDialogVisible] = useState(false);
  const [paidOffError, setPaidOffError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // The account list carries the bill, but not its reconciliation — that is
  // computed per statement on the detail endpoint. Fetched separately so the
  // card can say what it cannot account for.
  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [isStatementSheetVisible, setIsStatementSheetVisible] = useState(false);
  const [isPaymentSheetVisible, setIsPaymentSheetVisible] = useState(false);
  const [isSubmittingStatement, setIsSubmittingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [daySuggestion, setDaySuggestion] = useState<StatementDaySuggestion | null>(null);
  const [emiPlans, setEmiPlans] = useState<EMIPlan[]>([]);
  const [isEmiSheetVisible, setIsEmiSheetVisible] = useState(false);

  /*
   * Statement screenshots are a paid-plan read. Knowing that before the bill
   * is saved lets the sheet say so up front instead of failing afterwards.
   * Unknown (still loading, or the lookup failed) is treated as allowed: the
   * server is the real gate, and a wrong lock is worse than a late message.
   */
  const [hasPaidPlan, setHasPaidPlan] = useState<boolean | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchBillingStatus(token)
      .then((status) => {
        if (active) {
          setHasPaidPlan(
            status.subscription_status === 'active' || status.subscription_status === 'cancelled'
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

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
  const setupItems = useMemo(() => (account ? getAccountSetupItems(account) : []), [account]);
  const setupComplete = setupItems.every((item) => item.complete);
  // Delete is refused while any transaction uses the account, so the sheet
  // says so up front instead of offering it and failing.
  const entriesUsingAccount = account?.summary?.entries_total ?? 0;

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

  const handleMarkPaidOff = async (payment: StatementPaymentPayload) => {
    if (!token || !account || !canMarkPaidOff || isPending) return;
    setIsPending(true);
    setPaidOffError(null);
    try {
      await markCardPaidOff(token, account.id, payment);
      setIsPaidOffDialogVisible(false);
      await loadDetails();
    } catch (markError) {
      setPaidOffError(getFriendlyErrorMessage(markError, 'Unable to mark this card paid off.'));
    } finally {
      setIsPending(false);
    }
  };

  const openSettings = () => {
    if (!account) return;
    setIsActionsSheetVisible(true);
  };

  const handleSaveStatement = async (payload: CardStatementPayload, read?: StatementRead) => {
    if (!token || !account) return;
    setIsSubmittingStatement(true);
    setStatementError(null);
    try {
      const saved = await saveCardStatement(token, account.id, payload);
      setStatement(saved);
      setIsStatementSheetVisible(false);
      if (read) {
        // The bill had to exist first: the check compares the rows with this
        // cycle. The rows and card updates go by key, not in the URL.
        const intake = putStatementIntake(intakeFromRead(read, account));
        router.push({
          pathname: '/statements/review',
          params: { id: String(saved.id), intake },
        });
        void loadDetails();
        return;
      }
      // The bill changes the card's outstanding and available limit, both of
      // which live on the account, so the whole screen is refetched.
      await loadDetails();
      // A file read offers its card updates on the statement check instead,
      // so this only asks for a statement entered by hand.
      if (isStatementDaySuggestion(saved.statement_day_suggestion)) {
        setDaySuggestion(saved.statement_day_suggestion);
      }
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

  const openActivityItem = (transaction: Transaction) =>
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
    });

  // Back and the title are known before the account is, so they are drawn for
  // real. Only the parts that depend on which account this turns out to be are
  // placeholders — a header that shimmers is a header claiming to be loading.
  if (isLoading && !account) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.background }}
        edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title="Account" onBack={() => router.back()} />
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

  // Nothing spent reads as a quiet ₹0 (board R5-AcctBank); the line under the
  // name already says there are no transactions yet.
  const isZeroHeadline = Boolean(headline?.placeholder) || (headline?.amount ?? 0) === 0;
  const extraFigures = account.summary ? accountFigureRows(account, runningBalance) : [];
  const usedNoun = isCreditCard ? 'card' : 'account';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={accountTypeLabels[accountType]}
        onBack={() => router.back()}
        rightIcon="dots-horizontal"
        rightAccessibilityLabel="Account actions"
        onRightPress={openSettings}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {error && <ErrorBanner message={error} style={{ marginBottom: 12 }} />}

        {/* Board R5-AcctCard / R5-AcctBank: no card around the hero, the
            figure the account is opened for under its name. */}
        <View accessibilityLabel={account.name} style={styles.hero}>
          <View style={[styles.heroTile, { backgroundColor: visual.bg }]}>
            <MaterialCommunityIcons name={visual.icon} size={26} color={visual.color} />
          </View>
          <ThemedText numberOfLines={1} style={[styles.heroName, { color: theme.text }]}>
            {account.name}
          </ThemedText>
          <ThemedText tone="muted" numberOfLines={1} style={styles.body}>
            {`${formatAccountIdentifier(account)} · ${describeLastUse(lastActivity)}`}
          </ThemedText>

          {/* A card with a limit leads with what it has left to spend — the
              number people open a card screen to find. */}
          {cardLimit ? (
            <CardLimitRing limit={cardLimit} />
          ) : (
            <>
              <ThemedText
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.heroAmount, { color: isZeroHeadline ? theme.muted : theme.text }]}>
                {formatMoney(headline?.amount ?? 0)}
              </ThemedText>
              <ThemedText tone="muted" style={styles.body}>
                {headline?.label}
              </ThemedText>
            </>
          )}

          {/* The ring already carries utilisation, so the bar would be the
              same fact twice. */}
          {creditUsage && !cardLimit && (
            <View style={styles.usage}>
              <CreditUsageBar usage={creditUsage} trackColor={theme.track} />
            </View>
          )}

          {/* Superseded by the statement card once a real bill exists, which
              knows the actual due date rather than inferring it. */}
          {isCreditCard && dueLabel && !currentStatement && (
            <View style={[styles.duePill, { backgroundColor: theme.warningSurface }]}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={theme.warning} />
              <ThemedText tone="warning" style={styles.duePillLabel}>
                {dueLabel}
              </ThemedText>
            </View>
          )}
        </View>

        {!setupComplete ? (
          <SetupChecklist
            title="Finish setting up"
            items={setupItems}
            onAdd={() => handleEdit('details')}
            style={styles.setup}
          />
        ) : null}

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
                <ItemizationBanner reconciliation={statement.reconciliation} onReview={openCycleTransactions} />
              )}
              <View style={styles.statementLinks}>
                <PressableView accessibilityRole="button" onPress={openStatementHistory} style={styles.textLink} pressedStyle={styles.pressed}>
                  <ThemedText style={[styles.textLinkLabel, { color: theme.text }]}>All statements</ThemedText>
                </PressableView>
                <PressableView
                  accessibilityRole="button"
                  onPress={() => {
                    setStatementError(null);
                    setIsStatementSheetVisible(true);
                  }}
                  style={styles.textLink}
                  pressedStyle={styles.pressed}>
                  <ThemedText style={[styles.textLinkLabel, { color: theme.text }]}>Add a statement</ThemedText>
                </PressableView>
              </View>
            </>
          ) : (
            <BillCard
              tint={visual.bg}
              hue={visual.color}
              onAdd={() => {
                setStatementError(null);
                setIsStatementSheetVisible(true);
              }}
              onMarkPaidOff={
                canMarkPaidOff
                  ? () => {
                      setPaidOffError(null);
                      setIsPaidOffDialogVisible(true);
                    }
                  : undefined
              }
            />
          ))}

        {/* Without a due date there is nothing to remind about, and the
            checklist above already asks for one. */}
        {isCreditCard && reminderLabel && account.due_day ? (
          <View style={[styles.card, styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <SettingsRow
              icon={account.reminder_enabled === false ? 'bell-off-outline' : 'bell-ring-outline'}
              title="Reminder"
              subtitle={reminderLabel}
              accessibilityLabel={`${reminderLabel}. Edit reminder settings`}
              onPress={() => handleEdit('details')}
            />
          </View>
        ) : null}

        {isCreditCard && account.summary?.annual_fee && (
          <AnnualFeeCard status={account.summary.annual_fee} onEdit={() => handleEdit('details')} />
        )}

        {isCreditCard && (
          <EMIPlansSection
            plans={emiPlans}
            blockedPrincipal={cardLimit?.emi_blocked_principal ?? 0}
            onAdd={() => {
              setStatementError(null);
              setIsEmiSheetVisible(true);
            }}
            onOpenPlan={(plan) => router.push({ pathname: '/emi-plans/[id]', params: { id: String(plan.id) } })}
          />
        )}

        {account.summary && account.summary.entries_total > 0 ? (
          <>
            <SectionTitle title="This month" />
            <View style={[styles.card, styles.strip, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {[
                { label: 'Spent', value: formatMoney(account.summary.spent_this_month) },
                { label: 'Transactions', value: String(account.summary.entries_this_month) },
                { label: 'All time', value: formatMoney(account.summary.lifetime_spent) },
              ].map((figure, index) => (
                <View
                  key={figure.label}
                  style={[styles.figure, index > 0 && { borderLeftWidth: 1, borderLeftColor: theme.border }]}>
                  <ThemedText tone="muted" numberOfLines={1} style={styles.figureLabel}>
                    {figure.label}
                  </ThemedText>
                  <ThemedText numberOfLines={1} adjustsFontSizeToFit style={[styles.figureValue, { color: theme.text }]}>
                    {figure.value}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {/* The figures behind the hero, so the headline can be checked rather
            than believed — and the opening balance the user typed, labelled as
            the starting point it is. */}
        {extraFigures.length > 0 ? (
          <View
            style={[
              styles.card,
              account.summary && account.summary.entries_total > 0 ? styles.cardGap : styles.section,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            {extraFigures.map((row, index) => (
              <View
                key={row.label}
                style={[styles.figureRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <ThemedText tone="muted" style={styles.figureRowLabel}>
                  {row.label}
                </ThemedText>
                <ThemedText numberOfLines={1} style={[styles.figureRowValue, { color: theme.text }]}>
                  {row.value}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        <SectionTitle
          title="Recent activity"
          action={
            activity.length > 0 ? (
              <PressableView accessibilityRole="button" onPress={openAllTransactions} style={styles.seeAll} pressedStyle={styles.pressed}>
                <ThemedText style={[styles.textLinkLabel, { color: theme.text }]}>See all</ThemedText>
                <MaterialCommunityIcons name="chevron-right" size={16} color={theme.text} />
              </PressableView>
            ) : null
          }
        />
        {activity.length > 0 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {activity.map((transaction, index) => {
              const isIncome = transaction.entryType === 'income' || transaction.amount >= 0;
              return (
                <TransactionItem
                  key={transaction.id}
                  variant="list"
                  icon={transaction.icon as string}
                  title={transaction.name}
                  category={transaction.category}
                  amount={Math.abs(transaction.amount)}
                  date={formatRelativeDay(transaction.rawDate) ?? transaction.section ?? ''}
                  color={transaction.color}
                  bgColor={transaction.bgColor}
                  isIncome={isIncome}
                  showDivider={index < activity.length - 1}
                  onPress={() => openActivityItem(transaction)}
                />
              );
            })}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText style={[styles.rowTitle, { color: theme.text }]}>No transactions yet</ThemedText>
            <ThemedText tone="muted" style={styles.body}>
              Anything you pay from this account shows here.
            </ThemedText>
          </View>
        )}

        <Button
          variant="outline"
          label="Edit account"
          icon="pencil-outline"
          height={48}
          onPress={() => handleEdit()}
          style={styles.editButton}
        />
      </ScrollView>

      {/* Board R5-AcctActions. */}
      <AnimatedBottomSheet
        visible={isActionsSheetVisible}
        onClose={() => setIsActionsSheetVisible(false)}
        sheetStyle={[styles.sheet, { backgroundColor: theme.card, paddingBottom: sheetBottom }]}>
        <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
        <View style={styles.sheetHead}>
          <View style={styles.flexText}>
            <ThemedText numberOfLines={1} style={[styles.sheetTitle, { color: theme.text }]}>
              {account.name}
            </ThemedText>
            <ThemedText tone="muted" numberOfLines={1} style={styles.caption}>
              {formatAccountIdentifier(account)}
            </ThemedText>
          </View>
          <SheetCloseButton accessibilityLabel="Close account actions" onPress={() => setIsActionsSheetVisible(false)} />
        </View>
        {!account.is_default && (
          <SettingsRow
            icon="star-outline"
            title="Set as default"
            subtitle="Use it first when a payment matches"
            onPress={() => {
              setIsActionsSheetVisible(false);
              void handleSetDefault();
            }}
          />
        )}
        <SettingsRow
          icon="pencil-outline"
          title="Edit account"
          subtitle="Name, type, limit, due date and reminders"
          divider={!account.is_default}
          onPress={() => {
            setIsActionsSheetVisible(false);
            handleEdit();
          }}
        />
        <SettingsRow
          tone="danger"
          icon="delete-outline"
          title="Delete account"
          divider
          disabled={entriesUsingAccount > 0}
          subtitle={
            entriesUsingAccount > 0
              ? `${entriesUsingAccount} transaction${entriesUsingAccount === 1 ? ' uses' : 's use'} this ${usedNoun}. Move ${entriesUsingAccount === 1 ? 'it' : 'them'} to another account first.`
              : 'Removes it from Finnri for good'
          }
          onPress={() => {
            setIsActionsSheetVisible(false);
            setIsDeleteDialogVisible(true);
          }}
        />
      </AnimatedBottomSheet>

        <ThemedDeleteDialog
          visible={isDeleteDialogVisible}
          title={`Delete ${account.name}?`}
          message="No transactions use it. This cannot be undone."
          confirmLabel="Delete"
          loading={isPending}
          onCancel={() => setIsDeleteDialogVisible(false)}
          onConfirm={handleDelete}
        />

        {/* Not a yes/no any more: it asks, optionally, where the money came
            from, so that account's balance drops too — as a card payment,
            never as spending, since the card's spends are already logged. */}
        {canMarkPaidOff && account ? (
          <PaymentFormSheet
            variant="paid-off"
            visible={isPaidOffDialogVisible}
            remainingDue={cardLimit?.outstanding ?? 0}
            minimumDue={0}
            accounts={accounts}
            cardId={account.id}
            submitting={isPending}
            error={paidOffError}
            onClose={() => {
              if (!isPending) setIsPaidOffDialogVisible(false);
            }}
            onSubmit={(payment) => void handleMarkPaidOff(payment)}
          />
        ) : null}

        {isCreditCard && (
          <>
            <StatementFormSheet
              visible={isStatementSheetVisible}
              card={account}
              submitting={isSubmittingStatement}
              error={statementError}
              onClose={() => setIsStatementSheetVisible(false)}
              onSubmit={handleSaveStatement}
              onReadSource={(source, password) => {
                if (!token) return Promise.reject(new Error('Please sign in again.'));
                return readStatementFile(token, account.id, source, password);
              }}
              screenshotsLocked={hasPaidPlan === false}
              onSeePlans={() => {
                setIsStatementSheetVisible(false);
                router.push('/billing');
              }}
            />
            <StatementDayDriftDialog
              token={token}
              card={account}
              suggestion={daySuggestion}
              onClose={(moved) => {
                setDaySuggestion(null);
                if (moved) void loadDetails();
              }}
              onError={setError}
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
    </SafeAreaView>
  );
}

/**
 * The figures beyond the three in "This month": money in, the opening balance
 * the user typed, and the balance run forward from it.
 */
function accountFigureRows(account: Account, runningBalance: number | null) {
  const summary = account.summary;
  if (!summary) return [];
  const isCreditCard = normalizeAccountType(account.type) === 'credit_card';
  const opening = account.balance ?? 0;
  const rows: { label: string; value: string }[] = [];
  if (summary.received_this_month > 0) {
    rows.push({
      label: isCreditCard ? 'Paid off this month' : 'Money in this month',
      value: formatMoney(summary.received_this_month),
    });
  }
  if (opening !== 0) {
    rows.push({ label: isCreditCard ? 'Owed before tracking' : 'Opening balance', value: formatMoney(opening) });
  }
  if (runningBalance !== null) rows.push({ label: 'Running balance', value: formatMoney(runningBalance) });
  return rows;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginTop: 4,
  },
  heroTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    marginTop: 12,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  heroAmount: {
    marginTop: 14,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  usage: {
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  duePillLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  setup: {
    marginTop: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  section: {
    marginTop: 12,
  },
  cardGap: {
    marginTop: 8,
  },
  billBody: {
    padding: 14,
  },
  billHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  billButton: {
    marginTop: 12,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  strong: {
    fontWeight: '600',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  linkRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
    borderTopWidth: 1,
  },
  linkLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  statementLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  textLink: {
    minHeight: 40,
    justifyContent: 'center',
  },
  textLinkLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  seeAll: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionHead: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  strip: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  figure: {
    flex: 1,
    gap: 2,
    paddingHorizontal: 12,
  },
  figureLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  figureValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  figureRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
  },
  figureRowLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  figureRowValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  emptyCard: {
    padding: 16,
    gap: 2,
  },
  editButton: {
    marginTop: 24,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
