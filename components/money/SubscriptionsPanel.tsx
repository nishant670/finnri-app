import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { recurringVisuals } from '@/components/money/money-visuals';
import { PanelActionRow } from '@/components/money/PanelActionRow';
import { CardEMIRow, RecurringOverviewCard } from '@/components/money/RecurringParts';
import { RecurringCandidatesCard } from '@/components/money/RecurringCandidatesCard';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { PrimaryButton } from '@/components/ui/Button';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { LabelRow } from '@/components/ui/LabelRow';
import { ListRow } from '@/components/ui/ListRow';
import { PickerOptionList, PickerSheet } from '@/components/ui/PickerSheet';
import { SheetCloseButton } from '@/components/ui/SheetCloseButton';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { fetchAccounts, normalizeAccountType, type Account } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import {
  fetchDashboard,
  saveRecurringCandidateDecision,
  type DashboardRecurringCandidate,
} from '@/lib/insights';
import { fetchMerchantSuggestions, type MerchantSuggestion } from '@/lib/merchant-suggestions';
import { formatMoney } from '@/lib/money';
import type { MoneyPanelProps } from '@/components/money/BudgetsPanel';
import { fetchRecurring, kindOf, loanTypeOptions, recurringKindMeta, recurringKinds, type RecurringCardEMI, type RecurringFilter, type RecurringSummary } from '@/lib/recurring';
import {
  BillingInterval,
  LoanType,
  RecurringKind,
  Subscription,
  SubscriptionStatus,
  createSubscription,
  deleteSubscription,
  markSubscriptionPaid,
  syncSubscriptionReminders,
  updateSubscription,
} from '@/lib/subscriptions';

import { apiDateToLocalDate, dateToApiDate, defaultReminderDays, looksLikeCardBill, defaultSubscriptionCategory, formatDueDateLabel, intervalOptions, nextMonthISO, parseAmount, reminderLabel, sanitizeAmount, statusOptions, toApiDateOnly, toParam, todayISO, buildRecurringPayload, buildSummaryLine, countDueSoon, projectMonthlyTotal, suggestLoanFigures, validateRecurringForm } from '@/lib/subscription-form';
import { Field } from '@/components/money/subscriptions/Field';
import { Pill } from '@/components/money/subscriptions/Pill';
import { SubscriptionCard } from '@/components/money/subscriptions/SubscriptionCard';
import { SubscriptionAdvancedFields } from '@/components/money/subscriptions/SubscriptionAdvancedFields';
import { SubscriptionDatePickerModal } from '@/components/money/subscriptions/SubscriptionDatePickerModal';
import { SubscriptionInvestmentFields } from '@/components/money/subscriptions/SubscriptionInvestmentFields';
import { InvestmentTypePicker } from '@/components/money/subscriptions/InvestmentTypePicker';
import { LogCurrentPaymentCard } from '@/components/money/subscriptions/LogCurrentPaymentCard';
import { RECURRING_LABEL_WIDTH } from '@/components/money/subscriptions/FormRows';
import { MarkPaidSheet, type MarkPaidChoice } from '@/components/money/subscriptions/MarkPaidSheet';
import { usablePayment } from '@/components/money/subscriptions/PaymentAccountPicker';
import { SubscriptionLoanFields } from '@/components/money/subscriptions/SubscriptionLoanFields';
export { monthlyEquivalent, toApiDateOnly } from '@/lib/subscription-form';

/**
 * Subscriptions, as a list of what you pay for.
 *
 * The screen used to *be* the form: eleven fields across roughly two and a half
 * screens to record "Netflix, ₹199, monthly", opened automatically whenever the
 * list was empty, with a Status control offering *Cancelled* while you were
 * still creating the thing. The list — the reason to open the screen at all —
 * was below the fold.
 *
 * It opens on the list and its monthly total now. Creating is a sheet asking
 * three questions: who, how much, when next. Everything the old form asked up
 * front — category, autopay, reminder timing, cancellation reminders, notes —
 * still exists, under Advanced, with the defaults that were already right for
 * almost every subscription. Status appears only when editing, because a thing
 * being created is not cancelled.
 */
export function SubscriptionsPanel({ embedded = false }: MoneyPanelProps) {
  const router = useRouter();
  const sheetBottom = useBottomInset(24);
  const params = useLocalSearchParams();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { token } = useAuthStore();
  const dialog = useAppDialog();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const muted = `${colors.text}99`;
  const [isIntervalPickerVisible, setIsIntervalPickerVisible] = useState(false);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cardEMIs, setCardEMIs] = useState<RecurringCardEMI[]>([]);
  const [overview, setOverview] = useState<RecurringSummary | null>(null);
  const [filter, setFilter] = useState<RecurringFilter>('all');
  const [formKind, setFormKind] = useState<RecurringKind>('subscription');
  // Loan details. All optional — the EMI and its date are what schedule it.
  const [loanType, setLoanType] = useState<LoanType | ''>('');
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [totalEmis, setTotalEmis] = useState('');
  const [emisPaid, setEmisPaid] = useState('');
  const [processingFee, setProcessingFee] = useState('');
  const [foreclosurePct, setForeclosurePct] = useState('');
  // Shared by loans (first EMI) and investments (first instalment).
  const [startDate, setStartDate] = useState('');
  const [platform, setPlatform] = useState('');
  const [stepUpPct, setStepUpPct] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [candidates, setCandidates] = useState<DashboardRecurringCandidate[]>([]);
  const [candidatesHidden, setCandidatesHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** The loan's or investment's own details — all optional, so folded. */
  const [showKindDetails, setShowKindDetails] = useState(false);
  const [name, setName] = useState('');
  const [merchant, setMerchant] = useState('');
  const [merchantSuggestions, setMerchantSuggestions] = useState<MerchantSuggestion[]>([]);
  const [category, setCategory] = useState<string>(defaultSubscriptionCategory);
  const [amount, setAmount] = useState('');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [nextDueDate, setNextDueDate] = useState(nextMonthISO());
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [reminderDays, setReminderDays] = useState(defaultReminderDays);
  const [cancelBeforeDue, setCancelBeforeDue] = useState(false);
  const [cancelOnDate, setCancelOnDate] = useState('');
  const [autopay, setAutopay] = useState(false);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [accountID, setAccountID] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  /** Create only: write the payment already made as a transaction too. */
  const [logPayment, setLogPayment] = useState(false);
  /** Bumped each time the sheet opens, so pickers holding state start fresh. */
  const [formSession, setFormSession] = useState(0);
  /** The item "Mark paid" was tapped on; kept after closing for the exit slide. */
  const [payingFor, setPayingFor] = useState<Subscription | null>(null);
  const [isMarkPaidVisible, setIsMarkPaidVisible] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState(apiDateToLocalDate(nextDueDate));
  const [datePickerTarget, setDatePickerTarget] = useState<'due' | 'cancel' | 'start'>('due');
  const source = toParam(params.source);
  const prefillName = toParam(params.name);
  const prefillMerchant = toParam(params.merchant);
  const prefillCategory = toParam(params.category);
  const prefillAmount = toParam(params.amount);
  const prefillInterval = toParam(params.interval);
  const prefillNextDueDate = toParam(params.nextDueDate);
  const prefillNotes = toParam(params.notes);
  const candidateKey = toParam(params.candidateKey);

  const dueCount = useMemo(() => countDueSoon(subscriptions), [subscriptions]);
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((item) => item.status === 'active'),
    [subscriptions]
  );
  const projectedMonthly = useMemo(
    () => projectMonthlyTotal(activeSubscriptions),
    [activeSubscriptions]
  );
  /**
   * The one line the screen exists to say. Both headers read it, so the total
   * is visible before the list is scrolled and without a tile row competing
   * with the subscriptions themselves for the top of the screen.
   */
  const summaryLine = useMemo(
    () =>
      buildSummaryLine({
        loading,
        overview,
        activeCount: activeSubscriptions.length,
        projectedMonthly,
        dueCount,
      }),
    [activeSubscriptions.length, dueCount, loading, overview, projectedMonthly]
  );
  const visibleItems = useMemo(
    () =>
      filter === 'all' ? subscriptions : subscriptions.filter((item) => kindOf(item) === filter),
    [filter, subscriptions]
  );
  const visibleCardEMIs = filter === 'all' || filter === 'loan' ? cardEMIs : [];
  const kindMeta = recurringKindMeta[formKind];
  /**
   * Whichever of loan amount, rate, tenure and EMI the user left empty, worked
   * out from the other three. Offered, never written over what they typed.
   */
  const loanSuggestion = useMemo(
    () => suggestLoanFigures({ formKind, principal, ratePct, totalEmis, amount }),
    [amount, formKind, principal, ratePct, totalEmis]
  );
  const formTitle = editing ? kindMeta.editTitle : kindMeta.newTitle;
  const visibleCandidates = candidatesHidden ? [] : candidates;

  useEffect(() => {
    if (source !== 'recurring_review' || editing) return;
    const amountValue = sanitizeAmount(prefillAmount ?? '');
    setName(prefillName?.trim() || prefillMerchant?.trim() || 'Recurring payment');
    setMerchant(prefillMerchant?.trim() ?? '');
    setCategory(prefillCategory?.trim() || 'Bills');
    if (amountValue) setAmount(amountValue);
    if (prefillInterval === 'weekly' || prefillInterval === 'monthly') setInterval(prefillInterval);
    if (prefillNextDueDate?.match(/^\d{4}-\d{2}-\d{2}$/)) setNextDueDate(prefillNextDueDate);
    setStatus('active');
    setReminderDays(prefillInterval === 'weekly' ? 1 : defaultReminderDays);
    setAutopay(false);
    setNotes(prefillNotes ?? '');
    setShowForm(true);
    setError(null);
  }, [
    editing,
    prefillAmount,
    prefillCategory,
    prefillInterval,
    prefillMerchant,
    prefillName,
    prefillNextDueDate,
    prefillNotes,
    source,
  ]);

  const resetForm = () => {
    setEditing(null);
    setName('');
    setMerchant('');
    setCategory(defaultSubscriptionCategory);
    setAmount('');
    setInterval('monthly');
    setNextDueDate(nextMonthISO());
    setStatus('active');
    setReminderDays(defaultReminderDays);
    setCancelBeforeDue(false);
    setCancelOnDate('');
    setAutopay(false);
    setPaymentMode('Cash');
    setAccountID(null);
    setNotes('');
    setLogPayment(false);
    setShowAdvanced(false);
    setShowKindDetails(false);
    setError(null);
    setFormKind('subscription');
    setLoanType('');
    setLender('');
    setPrincipal('');
    setRatePct('');
    setTotalEmis('');
    setEmisPaid('');
    setProcessingFee('');
    setForeclosurePct('');
    setStartDate('');
    setPlatform('');
    setStepUpPct('');
  };

  const load = useCallback(async () => {
    if (!token) {
      setSubscriptions([]);
      setCandidates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setListError(null);
    try {
      await syncSubscriptionReminders(token);
      const [recurring, accountItems] = await Promise.all([
        fetchRecurring(token),
        fetchAccounts(token),
      ]);
      setSubscriptions(recurring.items);
      setCardEMIs(recurring.card_emis);
      setOverview(recurring.summary);
      setAccounts(accountItems);
    } catch (loadError) {
      setListError(
        getFriendlyErrorMessage(loadError, 'Unable to load recurring payments right now.')
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  /**
   * Detection is a separate load on purpose. It is the slower of the two and
   * the list must not wait on it, and a dashboard that fails should cost the
   * suggestion card, not the subscriptions the user came to see.
   */
  const loadCandidates = useCallback(async () => {
    if (!token) {
      setCandidates([]);
      return;
    }
    try {
      const dashboard = await fetchDashboard(token);
      setCandidates(dashboard.recurring_candidates ?? []);
    } catch {
      setCandidates([]);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCandidates();
    }, [load, loadCandidates])
  );

  // Suggestions follow what has been typed so far, and seed the sheet with the
  // most-used merchants before a single character is entered.
  useEffect(() => {
    if (!showForm || !token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchMerchantSuggestions(token, merchant).then((suggestions) => {
        if (!cancelled) setMerchantSuggestions(suggestions);
      });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [merchant, showForm, token]);

  const editSubscription = (subscription: Subscription) => {
    setEditing(subscription);
    setName(subscription.name);
    setMerchant(subscription.merchant ?? '');
    setCategory(subscription.category ?? '');
    setAmount(String(subscription.amount));
    setInterval(subscription.billing_interval);
    setNextDueDate(toApiDateOnly(subscription.next_due_date));
    setStatus(subscription.status);
    setReminderDays(subscription.reminder_days);
    setCancelBeforeDue(!!subscription.cancel_before_due);
    setCancelOnDate(toApiDateOnly(subscription.cancel_on_date));
    setAutopay(subscription.autopay);
    setPaymentMode(subscription.payment_mode || 'Cash');
    setAccountID(subscription.account_id ?? null);
    setNotes(subscription.notes ?? '');
    const numberText = (value?: number | string | null) =>
      value != null && Number(value) > 0 ? String(Number(value)) : '';
    setFormKind(kindOf(subscription));
    setLoanType(subscription.loan_type ?? '');
    setLender(subscription.lender ?? '');
    setPrincipal(numberText(subscription.principal));
    setRatePct(numberText(subscription.annual_rate_pct));
    setTotalEmis(numberText(subscription.total_instalments));
    setEmisPaid(numberText(subscription.instalments_paid));
    setProcessingFee(numberText(subscription.processing_fee));
    setForeclosurePct(numberText(subscription.foreclosure_charge_pct));
    setStartDate(toApiDateOnly(subscription.start_date));
    setPlatform(subscription.platform ?? '');
    setStepUpPct(numberText(subscription.step_up_pct));
    setShowAdvanced(false);
    setShowKindDetails(false);
    setError(null);
    setFormSession((session) => session + 1);
    setShowForm(true);
  };

  const openCreateForm = (startKind?: RecurringKind) => {
    resetForm();
    setFormSession((session) => session + 1);
    // A filtered list is a statement of intent: "+" on Loans adds a loan.
    const kind = startKind ?? (filter === 'all' ? 'subscription' : filter);
    setFormKind(kind);
    setCategory(recurringKindMeta[kind].defaultCategory);
    setShowForm(true);
  };

  const chooseFormKind = (kind: RecurringKind) => {
    haptics.select();
    setFormKind(kind);
    // Follow the kind's usual category unless the user already picked one.
    if (category === recurringKindMeta[formKind].defaultCategory) {
      setCategory(recurringKindMeta[kind].defaultCategory);
    }
  };

  /** A mode and account to start on, for whatever now needs one. */
  const ensurePaymentAccount = () => {
    const next = usablePayment(accounts, paymentMode, accountID);
    setPaymentMode(next.paymentMode);
    setAccountID(next.accountID);
  };

  const chooseInterval = (next: BillingInterval) => {
    setInterval(next);
    if (next === 'daily') {
      // A daily payment exists only through Autopay, which adds each one;
      // there is no reminder to send for it.
      setAutopay(true);
      setReminderDays(0);
      ensurePaymentAccount();
    }
  };

  const toggleLogPayment = (checked: boolean) => {
    haptics.select();
    setLogPayment(checked);
    if (checked && !autopay) ensurePaymentAccount();
  };

  const openStartDatePicker = () => {
    const currentDate = apiDateToLocalDate(startDate || todayISO());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        onValueChange: (_event, selectedDate) =>
          selectedDate && setStartDate(dateToApiDate(selectedDate)),
        onDismiss: () => undefined,
      });
      return;
    }
    setDatePickerTarget('start');
    setPendingDate(currentDate);
    setIsDatePickerVisible(true);
  };

  const openDueDatePicker = () => {
    const currentDate = apiDateToLocalDate(nextDueDate);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        minimumDate: new Date(),
        onValueChange: (_event, selectedDate) => {
          if (selectedDate) {
            setNextDueDate(dateToApiDate(selectedDate));
          }
        },
        onDismiss: () => undefined,
      });
      return;
    }
    setDatePickerTarget('due');
    setPendingDate(currentDate);
    setIsDatePickerVisible(true);
  };

  const openCancellationDatePicker = () => {
    const currentDate = apiDateToLocalDate(cancelOnDate || todayISO());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        minimumDate: new Date(),
        onValueChange: (_event, selectedDate) =>
          selectedDate && setCancelOnDate(dateToApiDate(selectedDate)),
        onDismiss: () => undefined,
      });
      return;
    }
    setDatePickerTarget('cancel');
    setPendingDate(currentDate);
    setIsDatePickerVisible(true);
  };

  const saveSubscription = async () => {
    if (!token || saving) return;
    const { messages, opensMoreOptions, opensKindDetails } = validateRecurringForm({
      name,
      merchant,
      amount,
      nextDueDate,
      reminderDays,
      cancelBeforeDue,
      cancelOnDate,
      interval,
      autopay,
      accountID,
      formKind,
      totalEmis,
      emisPaid,
      ratePct,
      namePlaceholder: kindMeta.namePlaceholder,
    });
    if (messages.length > 0) {
      haptics.rejected();
      setError(messages.join('\n'));
      if (opensMoreOptions) setShowAdvanced(true);
      if (opensKindDetails) setShowKindDetails(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = buildRecurringPayload({
        name,
        merchant,
        category,
        amount,
        interval,
        nextDueDate,
        status,
        reminderDays,
        cancelBeforeDue,
        cancelOnDate,
        autopay,
        paymentMode,
        accountID,
        notes,
        formKind,
        startDate,
        totalEmis,
        emisPaid,
        loanType,
        lender,
        principal,
        ratePct,
        processingFee,
        foreclosurePct,
        platform,
        stepUpPct,
        logPayment,
        editing,
        kindMeta,
      });
      if (editing) {
        await updateSubscription(token, editing.id, payload);
      } else {
        await createSubscription(token, payload);
        if (source === 'recurring_review' && candidateKey) {
          await saveRecurringCandidateDecision(token, {
            candidate_key: candidateKey,
            merchant: merchant.trim(),
            category: category.trim(),
            decision: 'tracked',
          });
        }
      }
      haptics.saved();
      resetForm();
      setShowForm(false);
      await load();
      await loadCandidates();
    } catch (saveError) {
      haptics.rejected();
      setError(
        getFriendlyErrorMessage(
          saveError,
          `Couldn't save this ${formKind}. Check your connection and try again.`
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const openMarkPaid = (subscription: Subscription) => {
    setPayingFor(subscription);
    setMarkPaidError(null);
    setIsMarkPaidVisible(true);
  };

  const markPaid = async (choice: MarkPaidChoice) => {
    if (!token || !payingFor || markingPaid) return;
    setMarkingPaid(true);
    setMarkPaidError(null);
    try {
      await markSubscriptionPaid(token, payingFor.id, todayISO(), choice);
      haptics.saved();
      setIsMarkPaidVisible(false);
      await load();
    } catch (paidError) {
      haptics.rejected();
      setMarkPaidError(getFriendlyErrorMessage(paidError, 'Unable to mark this paid.'));
    } finally {
      setMarkingPaid(false);
    }
  };

  const cancelNow = async (subscription: Subscription) => {
    if (!token) return;
    try {
      await updateSubscription(token, subscription.id, {
        name: subscription.name,
        merchant: subscription.merchant,
        category: subscription.category,
        amount: Number(subscription.amount),
        billing_interval: subscription.billing_interval,
        next_due_date: subscription.next_due_date,
        status: 'cancelled',
        reminder_days: subscription.reminder_days,
        cancel_before_due: false,
        notes: subscription.notes,
        account_id: subscription.account_id ?? null,
      });
      if (editing?.id === subscription.id) resetForm();
      await load();
    } catch (cancelError) {
      setListError(getFriendlyErrorMessage(cancelError, 'Unable to cancel this subscription.'));
    }
  };

  const confirmDelete = async (subscription: Subscription) => {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete subscription?',
      message: `${subscription.name} reminders will stop after deletion.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteSubscription(token, subscription.id);
      if (editing?.id === subscription.id) resetForm();
      await load();
    } catch (deleteError) {
      setListError(getFriendlyErrorMessage(deleteError, 'Unable to delete this subscription.'));
    }
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  const selectMerchant = (suggestion: MerchantSuggestion) => {
    haptics.select();
    setMerchant(suggestion.merchant);
    if (suggestion.category) setCategory(suggestion.category);
  };

  const loanTypeLabel = loanTypeOptions.find((option) => option.value === loanType)?.label;
  /** What the kind's own fold holds, read back so it can stay closed. */
  const kindDetailsSummary =
    formKind === 'loan'
      ? [
          loanTypeLabel ? `${loanTypeLabel} loan` : '',
          lender.trim(),
          principal.trim() ? formatMoney(parseAmount(principal)) : '',
          ratePct.trim() ? `${ratePct}% a year` : '',
          totalEmis.trim() ? `${emisPaid.trim() || '0'} of ${totalEmis} EMIs paid` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Optional — loan amount, interest and EMIs left'
      : [
          platform.trim(),
          startDate ? `Since ${formatDueDateLabel(startDate)}` : '',
          stepUpPct.trim() ? `${stepUpPct}% yearly step-up` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Optional — fund, start date and yearly step-up';
  const autopayAccountName = accounts.find((account) => account.id === accountID)?.name;
  const moreOptionsSummary = [
    editing && status !== 'active'
      ? statusOptions.find((option) => option.value === status)?.label
      : '',
    // Investments are not filed under a spending category; see the fold.
    formKind === 'investment' ? '' : category || 'Uncategorized',
    interval === 'daily' || interval === 'business_daily'
      ? 'Added automatically'
      : reminderDays === 0
        ? 'Reminder on the due date'
        : `Reminder ${reminderLabel(reminderDays)}`,
    autopay ? `Autopay${autopayAccountName ? ` from ${autopayAccountName}` : ''}` : 'Autopay off',
    cancelBeforeDue ? 'Cancel reminder on' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const isEmptyAll =
    !loading && !listError && filter === 'all' && visibleItems.length === 0 && visibleCardEMIs.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {embedded ? (
        <PanelActionRow
          subtitle={summaryLine}
          actionLabel={loading || isEmptyAll ? undefined : 'Add'}
          actionIcon="plus"
          onAction={() => openCreateForm()}
          colors={colors}
        />
      ) : (
        <AppHeader
          title="Recurring"
          subtitle={summaryLine}
          onBack={() => router.back()}
          rightIcon={loading ? undefined : 'plus'}
          onRightPress={() => openCreateForm()}
        />
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: embedded ? 40 : 32 }]}>
        {visibleCandidates.length > 0 && (
          <View style={styles.gutter}>
            <RecurringCandidatesCard
              candidates={visibleCandidates}
              onTracked={(createdCount) => {
                if (createdCount > 0) void load();
                void loadCandidates();
              }}
              onDismissed={() => setCandidatesHidden(true)}
            />
          </View>
        )}

        {!loading && overview && overview.active_count > 0 ? (
          <RecurringOverviewCard summary={overview} filter={filter} onFilter={setFilter} />
        ) : null}

        {listError && (
          <StateView
            icon="wifi-off"
            title="Recurring payments did not load"
            message={listError}
            actionLabel="Try again"
            onAction={load}
            compact
          />
        )}

        {loading ? (
          <View style={styles.gutter}>
            <SkeletonFrame label="Loading subscriptions" testID="subscriptions-skeleton">
              <SkeletonCards count={3} lines={2} radius={16} />
            </SkeletonFrame>
          </View>
        ) : visibleItems.length > 0 || visibleCardEMIs.length > 0 ? (
          <View style={cardStyle}>
            {visibleCardEMIs.map((emi, index) => (
              <CardEMIRow
                key={`card-emi-${emi.plan_id}`}
                emi={emi}
                divider={index > 0}
                onPress={() =>
                  router.push({ pathname: '/emi-plans/[id]', params: { id: String(emi.plan_id) } })
                }
              />
            ))}
            {visibleItems.map((subscription, index) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                colors={colors}
                divider={visibleCardEMIs.length + index > 0}
                onPress={() => editSubscription(subscription)}
                onMarkPaid={() => openMarkPaid(subscription)}
                onCancelNow={() => void cancelNow(subscription)}
                onDelete={() => void confirmDelete(subscription)}
              />
            ))}
          </View>
        ) : isEmptyAll ? (
          // Board R5-Recurring: one card that says what belongs here, with a
          // way in for each kind.
          <View style={cardStyle}>
            <View style={styles.emptyHead}>
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                Track your first recurring payment
              </ThemedText>
              <ThemedText tone="muted" style={styles.body}>
                Anything that leaves your account on a schedule. It shows in Upcoming before it is
                due.
              </ThemedText>
            </View>
            {recurringKinds.map((kind) => (
              <ListRow
                key={kind}
                testID={`recurring-start-${kind}`}
                icon={recurringVisuals[kind].icon}
                hue={recurringVisuals[kind].hue}
                title={kind === 'loan' ? 'Loan or EMI' : recurringKindMeta[kind].label}
                meta={recurringKindMeta[kind].namePlaceholder}
                chevron
                divider
                onPress={() => openCreateForm(kind)}
              />
            ))}
          </View>
        ) : !listError ? (
          <StateView
            icon="calendar-sync-outline"
            title={`No ${recurringKindMeta[filter as RecurringKind].plural.toLowerCase()} yet`}
            message="Loans and EMIs, subscriptions, SIPs and bills — add anything that leaves your account on a schedule. It shows in Upcoming before it is due."
            actionLabel={`Add ${recurringKindMeta[filter as RecurringKind].label.toLowerCase()}`}
            onAction={() => openCreateForm()}
            compact
          />
        ) : null}
      </ScrollView>

      {/* Board R5-NewLoan: one sheet for all four kinds. */}
      <AnimatedBottomSheet
        visible={showForm}
        onClose={closeForm}
        avoidKeyboard
        sheetStyle={{
          backgroundColor: colors.background,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          maxHeight: '92%',
        }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.sheet, { paddingBottom: sheetBottom }]}>
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <View style={styles.sheetHeader}>
            <ThemedText style={[styles.sheetTitle, { color: colors.text }]}>{formTitle}</ThemedText>
            <SheetCloseButton onPress={closeForm} />
          </View>

          {/* One line, as on the board; it scrolls on a phone too narrow for all four. */}
          <ScrollView
            testID="recurring-kind-picker"
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.kindsScroll}
            contentContainerStyle={styles.kindsRow}>
            {recurringKinds.map((kind) => (
              <Pill
                key={kind}
                label={recurringKindMeta[kind].label}
                selected={formKind === kind}
                onPress={() => chooseFormKind(kind)}
                colors={colors}
              />
            ))}
          </ScrollView>

          {formKind === 'investment' ? (
            <InvestmentTypePicker
              key={formSession}
              value={merchant}
              onChange={setMerchant}
              style={styles.block}
            />
          ) : (
            <Field
              label={kindMeta.nameLabel}
              value={merchant}
              onChangeText={setMerchant}
              colors={colors}
              placeholder={kindMeta.namePlaceholder}
              autoFocus={!editing}
            />
          )}
          {formKind !== 'investment' && looksLikeCardBill(`${merchant} ${name}`) ? (
            <CardBillNote
              cards={accounts.filter((account) => normalizeAccountType(account.type) === 'credit_card')}
              colors={colors}
              onOpen={(cardId) => {
                closeForm();
                if (cardId != null) {
                  router.push({ pathname: '/accounts/[id]', params: { id: String(cardId) } });
                } else {
                  router.push('/accounts/manage');
                }
              }}
            />
          ) : null}
          {/* Past merchants — Swiggy, Netflix — are no help naming an SIP. */}
          {formKind !== 'investment' && merchantSuggestions.length > 0 && (
            <View style={styles.kinds}>
              {merchantSuggestions.slice(0, 6).map((suggestion) => (
                <Pill
                  key={suggestion.merchant}
                  label={suggestion.merchant}
                  selected={merchant.trim().toLowerCase() === suggestion.merchant.toLowerCase()}
                  onPress={() => selectMerchant(suggestion)}
                  colors={colors}
                />
              ))}
            </View>
          )}

          <View style={[styles.amountRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText tone="muted" style={styles.amountLabel}>
              {formKind === 'loan' ? 'EMI amount' : formKind === 'investment' ? 'Instalment' : 'Amount'}
            </ThemedText>
            <ThemedText style={[styles.rupee, { color: colors.text }]}>{CURRENCY_SYMBOL}</ThemedText>
            <TextInput
              accessibilityLabel={
                formKind === 'loan'
                  ? 'EMI amount'
                  : formKind === 'investment'
                    ? 'Instalment amount'
                    : 'Amount'
              }
              value={amount}
              onChangeText={(value) => setAmount(sanitizeAmount(value))}
              keyboardType="decimal-pad"
              placeholder={formKind === 'loan' ? '9,965' : formKind === 'investment' ? '5,000' : '199'}
              placeholderTextColor={colors.muted}
              style={[styles.amountInput, { color: colors.text }]}
            />
          </View>

          <View style={[styles.rows, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LabelRow
              label={
                formKind === 'loan' ? 'Next EMI' : formKind === 'subscription' ? 'Renews on' : 'Next payment'
              }
              value={formatDueDateLabel(nextDueDate)}
              icon="calendar-blank-outline"
              iconColor={colors.text}
              labelWidth={RECURRING_LABEL_WIDTH}
              onPress={openDueDatePicker}
            />
            <LabelRow
              testID="recurring-interval"
              label="Repeats"
              value={intervalOptions.find((option) => option.value === interval)?.label ?? interval}
              divider
              labelWidth={RECURRING_LABEL_WIDTH}
              onPress={() => setIsIntervalPickerVisible(true)}
            />
          </View>

          {!editing ? (
            <LogCurrentPaymentCard
              checked={logPayment}
              onToggle={toggleLogPayment}
              amount={amount}
              interval={interval}
              nextDueDate={nextDueDate}
              autopay={autopay}
              accounts={accounts}
              accountID={accountID}
              paymentMode={paymentMode}
              onPaymentChange={(next) => {
                setPaymentMode(next.paymentMode);
                setAccountID(next.accountID);
              }}
              onAddAccount={() => router.push('/accounts/manage')}
              style={styles.block}
            />
          ) : null}

          {/* The loan's or investment's own details. None of them is needed
              to schedule the payment — the amount and the date do that — so
              they fold, and the fold reads back whatever is filled in. A loan
              used to open with all fourteen inputs on screen. */}
          {formKind === 'loan' ? (
            <View style={styles.fold}>
              <FormDisclosure
                testID="recurring-loan-details"
                label="Loan details"
                summary={kindDetailsSummary}
                expanded={showKindDetails}
                onToggle={() => setShowKindDetails((open) => !open)}>
                <SubscriptionLoanFields
                  amount={amount}
                  emisPaid={emisPaid}
                  foreclosurePct={foreclosurePct}
                  lender={lender}
                  loanSuggestion={loanSuggestion}
                  loanType={loanType}
                  name={name}
                  openStartDatePicker={openStartDatePicker}
                  principal={principal}
                  processingFee={processingFee}
                  ratePct={ratePct}
                  setAmount={setAmount}
                  setEmisPaid={setEmisPaid}
                  setForeclosurePct={setForeclosurePct}
                  setLender={setLender}
                  setLoanType={setLoanType}
                  setPrincipal={setPrincipal}
                  setProcessingFee={setProcessingFee}
                  setRatePct={setRatePct}
                  setTotalEmis={setTotalEmis}
                  startDate={startDate}
                  totalEmis={totalEmis}
                />
              </FormDisclosure>
            </View>
          ) : null}

          {formKind === 'investment' ? (
            <View style={styles.fold}>
              <FormDisclosure
                testID="recurring-investment-details"
                label="Investment details"
                summary={kindDetailsSummary}
                expanded={showKindDetails}
                onToggle={() => setShowKindDetails((open) => !open)}>
                <SubscriptionInvestmentFields
                  openStartDatePicker={openStartDatePicker}
                  platform={platform}
                  setPlatform={setPlatform}
                  setStepUpPct={setStepUpPct}
                  startDate={startDate}
                  stepUpPct={stepUpPct}
                />
              </FormDisclosure>
            </View>
          ) : null}

          <View style={styles.fold}>
            <FormDisclosure
              testID="recurring-more-options"
              label="More options"
              summary={moreOptionsSummary}
              expanded={showAdvanced}
              onToggle={() => setShowAdvanced((current) => !current)}>
              <SubscriptionAdvancedFields
                accountID={accountID}
                accounts={accounts}
                autopay={autopay}
                cancelBeforeDue={cancelBeforeDue}
                cancelOnDate={cancelOnDate}
                category={category}
                formKind={formKind}
                interval={interval}
                isEditing={Boolean(editing)}
                merchant={merchant}
                name={name}
                notes={notes}
                onAddAccount={() => router.push('/accounts/manage')}
                openCancellationDatePicker={openCancellationDatePicker}
                paymentMode={paymentMode}
                reminderDays={reminderDays}
                setAccountID={setAccountID}
                setAutopay={setAutopay}
                setCancelBeforeDue={setCancelBeforeDue}
                setCategory={setCategory}
                setName={setName}
                setNotes={setNotes}
                setPaymentMode={setPaymentMode}
                setReminderDays={setReminderDays}
                setStatus={setStatus}
                status={status}
              />
            </FormDisclosure>
          </View>

          {error && (
            <ThemedText tone="negative" style={[styles.caption, styles.error]}>
              {error}
            </ThemedText>
          )}

          {/* The kind's key is its plain noun. Lower-casing the label
              printed "Add loan / emi". */}
          <PrimaryButton
            label={editing ? 'Save changes' : `Add ${formKind}`}
            loading={saving}
            onPress={saveSubscription}
            style={styles.save}
          />
        </ScrollView>
      </AnimatedBottomSheet>

      <PickerSheet
        visible={isIntervalPickerVisible}
        title="Repeats"
        onClose={() => setIsIntervalPickerVisible(false)}>
        <PickerOptionList
          accessibilityLabel="Repeats"
          options={intervalOptions.map((option) => ({ key: option.value, label: option.label }))}
          selectedKey={interval}
          onSelect={(key) => {
            haptics.select();
            chooseInterval(key as BillingInterval);
            setIsIntervalPickerVisible(false);
          }}
        />
      </PickerSheet>

      <MarkPaidSheet
        key={payingFor?.id ?? 'none'}
        visible={isMarkPaidVisible}
        subscription={payingFor}
        accounts={accounts}
        submitting={markingPaid}
        error={markPaidError}
        onClose={() => setIsMarkPaidVisible(false)}
        onConfirm={(choice) => void markPaid(choice)}
        onAddAccount={() => {
          setIsMarkPaidVisible(false);
          router.push('/accounts/manage');
        }}
      />

      <SubscriptionDatePickerModal
        visible={isDatePickerVisible}
        target={datePickerTarget}
        pendingDate={pendingDate}
        onChangePendingDate={setPendingDate}
        onClose={() => setIsDatePickerVisible(false)}
        onDone={() => {
          if (datePickerTarget === 'cancel') setCancelOnDate(dateToApiDate(pendingDate));
          else if (datePickerTarget === 'start') setStartDate(dateToApiDate(pendingDate));
          else setNextDueDate(dateToApiDate(pendingDate));
          setIsDatePickerVisible(false);
        }}
        colors={colors}
        muted={muted}
      />
    </View>
  );
}

/**
 * Said when a new item is named like a credit card bill. It does not block:
 * the name might mean something else. It points to where the bill belongs.
 */
function CardBillNote({
  cards,
  colors,
  onOpen,
}: {
  cards: Account[];
  colors: ReturnType<typeof useThemeTokens>['colors'];
  onOpen: (cardId: number | null) => void;
}) {
  const only = cards.length === 1 ? cards[0] : null;
  return (
    <View
      testID="recurring-card-bill-note"
      style={[styles.note, { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder }]}>
      <ThemedText style={[styles.body, { color: colors.text }]}>
        Credit card bills belong on the card’s own page. Your card spends are already logged one
        by one, so a bill here would count them twice.
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(only?.id ?? null)}
        style={styles.noteLink}
        hitSlop={8}>
        <ThemedText style={[styles.noteLinkLabel, { color: colors.text }]}>
          {only ? `Open ${only.name}` : 'Go to your accounts'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingTop: 14,
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
  emptyHead: {
    gap: 4,
    padding: 14,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  sheet: {
    paddingHorizontal: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 8,
  },
  sheetHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 4,
    marginRight: -8,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  kinds: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  kindsScroll: {
    marginTop: 4,
    marginBottom: 12,
    marginHorizontal: -16,
    flexGrow: 0,
  },
  kindsRow: {
    gap: 6,
    paddingHorizontal: 16,
  },
  amountRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  amountLabel: {
    width: RECURRING_LABEL_WIDTH,
    fontSize: 13,
    lineHeight: 18,
  },
  rupee: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rows: {
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fold: {
    marginBottom: 10,
  },
  block: {
    marginBottom: 12,
  },
  error: {
    marginTop: 4,
  },
  save: {
    marginTop: 12,
  },
  note: {
    gap: 6,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  noteLink: {
    alignSelf: 'flex-start',
  },
  noteLinkLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
