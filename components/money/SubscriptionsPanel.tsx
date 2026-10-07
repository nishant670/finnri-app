import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { PanelActionRow } from '@/components/money/PanelActionRow';
import {
  CardEMIRow,
  RecurringOverviewCard,
  RecurringScheduleLine,
} from '@/components/money/RecurringParts';
import { RecurringCandidatesCard } from '@/components/money/RecurringCandidatesCard';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { FormDisclosure } from '@/components/ui/FormDisclosure';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { fetchAccounts, getAccountsForPaymentMode, type Account } from '@/lib/accounts';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';
import { CATEGORIES } from '@/lib/categories';
import {
  fetchDashboard,
  saveRecurringCandidateDecision,
  type DashboardRecurringCandidate,
} from '@/lib/insights';
import { fetchMerchantSuggestions, type MerchantSuggestion } from '@/lib/merchant-suggestions';
import type { MoneyPanelProps } from '@/components/money/BudgetsPanel';
import { HapticSwitch } from '@/components/ui/HapticSwitch';
import {
  fetchRecurring,
  kindOf,
  loanTypeOptions,
  recurringKindMeta,
  recurringKinds,
  solveLoan,
  type RecurringCardEMI,
  type RecurringFilter,
  type RecurringSummary,
} from '@/lib/recurring';
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

/**
 * The four cadences a subscription actually renews on, as a segmented control.
 *
 * This used to be seven full-size cards, each with a helper line, and one of
 * them was **Market days — skips weekends and market holidays**: an SIP
 * concept borrowed from the investment side of the app that has no meaning for
 * Netflix. `business_daily` is gone from subscriptions entirely — the
 * `BillingInterval` type still carries it because existing rows and the SIP
 * path in the transaction form use it, but it can no longer be chosen here.
 */
const intervalOptions: { value: BillingInterval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];
/**
 * Daily and every-two-weeks renewals are real but rare, and putting six
 * segments in the control makes every label unreadable to serve two of them.
 * They live under More options, where choosing Daily also meets its Autopay
 * requirement in the same section.
 */
const advancedIntervalOptions: { value: BillingInterval; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'biweekly', label: 'Every 2 weeks' },
];
const statusOptions: { value: SubscriptionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];
// A subscription generates transactions, and autopay copies this straight onto
// them, so it uses the same canonical categories as everything else. The old
// subscription-only list (Productivity, Cloud, Membership, Learning) put values
// into the ledger that no other screen could render or filter.
const categoryOptions = [...CATEGORIES];
// Most subscriptions are streaming or apps; Entertainment is the likeliest pick.
const defaultSubscriptionCategory = 'Entertainment';
const reminderOptions = [0, 1, 3, 7, 14, 30];
const defaultReminderDays = 3;

const todayISO = () => dateToApiDate(new Date());
const nextMonthISO = () => {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  return dateToApiDate(next);
};
const parseAmount = (value: string) => Number(value.replace(/,/g, '').trim());
const sanitizeAmount = (value: string) => value.replace(/[^0-9.]/g, '');
const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The API sends `next_due_date` as RFC3339 (`2026-09-13T00:00:00Z`), not as the
 * bare `YYYY-MM-DD` this screen's form state uses, so every value read off a
 * subscription is normalised here before it touches state.
 *
 * Without it the anchored parse below fell through to `new Date()` and every
 * card, and the edit form, rendered *today* as the due date — and because the
 * raw timestamp also went into form state, the save validation rejected it, so
 * `Update subscription` answered "Choose a valid next due date" with the date
 * displayed directly above the message. No existing subscription could be
 * edited at all.
 */
export function toApiDateOnly(value?: string | null) {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

function apiDateToLocalDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date();
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function dateToApiDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDueDateLabel(value: string) {
  return apiDateToLocalDate(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function reminderLabel(days: number) {
  if (days === 0) return 'On due date';
  if (days === 1) return '1 day before';
  return `${days} days before`;
}

/** Legacy rows can still hold `business_daily`; only the picker dropped it. */
function intervalLabel(value: BillingInterval) {
  if (value === 'business_daily') return 'Market days';
  const known = [...intervalOptions, ...advancedIntervalOptions].find(
    (option) => option.value === value
  );
  return known?.label ?? value;
}

/** What a subscription costs per month, whatever cadence it renews on. */
export function monthlyEquivalent(amount: number, interval: BillingInterval) {
  switch (interval) {
    case 'daily':
    case 'business_daily':
      return amount * 30;
    case 'weekly':
      return amount * 4;
    case 'biweekly':
      return amount * 2;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

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
  const params = useLocalSearchParams();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { token } = useAuthStore();
  const dialog = useAppDialog();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const muted = `${colors.text}99`;

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

  const dueCount = useMemo(
    () =>
      subscriptions.filter((item) => item.due_state === 'due_soon' || item.due_state === 'overdue')
        .length,
    [subscriptions]
  );
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((item) => item.status === 'active'),
    [subscriptions]
  );
  const projectedMonthly = useMemo(
    () =>
      activeSubscriptions.reduce(
        (sum, item) => sum + monthlyEquivalent(Number(item.amount || 0), item.billing_interval),
        0
      ),
    [activeSubscriptions]
  );
  /**
   * The one line the screen exists to say. Both headers read it, so the total
   * is visible before the list is scrolled and without a tile row competing
   * with the subscriptions themselves for the top of the screen.
   */
  const summaryLine = useMemo(() => {
    if (loading) return 'Loading recurring payments…';
    const count = overview?.active_count ?? activeSubscriptions.length;
    if (count === 0) return 'Nothing recurring tracked yet';
    const monthly = overview?.monthly_total ?? projectedMonthly;
    const headline = `${formatMoney(monthly)}/month across ${count} recurring payment${count === 1 ? '' : 's'}`;
    return dueCount > 0 ? `${headline} · ${dueCount} due soon` : headline;
  }, [activeSubscriptions.length, dueCount, loading, overview, projectedMonthly]);
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
  const loanSuggestion = useMemo(() => {
    if (formKind !== 'loan') return {};
    const value = (raw: string) => (raw.trim() === '' ? undefined : parseAmount(raw));
    return solveLoan({
      principal: value(principal),
      annualRatePct: value(ratePct),
      months: value(totalEmis),
      emi: value(amount),
    });
  }, [amount, formKind, principal, ratePct, totalEmis]);
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
    setShowForm(true);
  };

  const openCreateForm = () => {
    resetForm();
    // A filtered list is a statement of intent: "+" on Loans adds a loan.
    const kind = filter === 'all' ? 'subscription' : filter;
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
    const amountValue = parseAmount(amount);
    // The sheet asks for a merchant, not a name — "Netflix" is both. A display
    // name is only ever entered under Advanced, so the merchant stands in for
    // it and the backend's required `name` is satisfied without a field.
    const resolvedName = name.trim() || merchant.trim();
    const validation: string[] = [];
    // A failure caused by something folded away has to open the fold, or the
    // message names a control the user cannot see.
    let opensMoreOptions = false;
    let opensKindDetails = false;
    if (!resolvedName) validation.push(`Add a name — like ${kindMeta.namePlaceholder.split(',')[0]}.`);
    if (!Number.isFinite(amountValue) || amountValue <= 0)
      validation.push('Enter an amount above zero.');
    if (!nextDueDate.match(/^\d{4}-\d{2}-\d{2}$/)) validation.push('Pick the next payment date.');
    if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 30) {
      validation.push('Reminders can be 0 to 30 days before.');
      opensMoreOptions = true;
    }
    if (cancelBeforeDue && !cancelOnDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      validation.push('Pick when to remind you to cancel.');
      opensMoreOptions = true;
    }
    if ((interval === 'daily' || interval === 'business_daily') && !autopay) {
      validation.push('Daily payments need Autopay turned on.');
      opensMoreOptions = true;
    }
    if (autopay && !accountID) {
      validation.push('Choose the account Autopay should use.');
      opensMoreOptions = true;
    }
    const totalEmiCount = totalEmis.trim() ? Number(totalEmis) : 0;
    const paidEmiCount = emisPaid.trim() ? Number(emisPaid) : 0;
    if (formKind === 'loan') {
      const loanErrorsBefore = validation.length;
      if (!Number.isInteger(totalEmiCount) || totalEmiCount < 0 || totalEmiCount > 600)
        validation.push('Total EMIs should be a whole number up to 600.');
      if (!Number.isInteger(paidEmiCount) || paidEmiCount < 0)
        validation.push('EMIs paid should be a whole number.');
      if (totalEmiCount > 0 && paidEmiCount > totalEmiCount)
        validation.push("EMIs paid can't be more than the total.");
      if (ratePct.trim() && !(Number(ratePct) >= 0 && Number(ratePct) <= 60))
        validation.push('Enter an interest rate between 0 and 60%.');
      opensKindDetails = validation.length > loanErrorsBefore;
    }
    if (validation.length > 0) {
      haptics.rejected();
      setError(validation.join('\n'));
      if (opensMoreOptions) setShowAdvanced(true);
      if (opensKindDetails) setShowKindDetails(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: resolvedName,
        merchant: merchant.trim(),
        category: category.trim(),
        amount: amountValue,
        billing_interval: interval,
        next_due_date: nextDueDate,
        status: editing ? status : 'active',
        reminder_days: reminderDays,
        cancel_before_due: cancelBeforeDue,
        cancel_on_date: cancelBeforeDue ? cancelOnDate : '',
        autopay,
        payment_mode: paymentMode,
        transaction_tag:
          editing && kindOf(editing) === formKind ? editing.transaction_tag : kindMeta.defaultTag,
        purpose_type:
          formKind === 'investment' ? 'investment' : (editing?.purpose_type ?? 'normal_spend'),
        account_id: accountID,
        notes: notes.trim(),
        kind: formKind,
        start_date: formKind === 'loan' || formKind === 'investment' ? startDate : '',
        ...(formKind === 'loan'
          ? {
              total_instalments: totalEmiCount,
              instalments_paid: paidEmiCount,
              loan_type: loanType,
              lender: lender.trim(),
              principal: principal.trim() ? parseAmount(principal) : 0,
              annual_rate_pct: ratePct.trim() ? Number(ratePct) : 0,
              processing_fee: processingFee.trim() ? parseAmount(processingFee) : 0,
              foreclosure_charge_pct: foreclosurePct.trim() ? Number(foreclosurePct) : 0,
            }
          : {}),
        ...(formKind === 'investment'
          ? { platform: platform.trim(), step_up_pct: stepUpPct.trim() ? Number(stepUpPct) : 0 }
          : {}),
      };
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

  const markPaid = async (subscription: Subscription) => {
    if (!token) return;
    try {
      await markSubscriptionPaid(token, subscription.id, todayISO());
      await load();
    } catch (paidError) {
      setListError(getFriendlyErrorMessage(paidError, 'Unable to mark this subscription paid.'));
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
    category || 'Uncategorized',
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

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      {embedded ? (
        <PanelActionRow
          subtitle={summaryLine}
          actionLabel={loading ? undefined : 'New'}
          actionIcon="plus"
          onAction={openCreateForm}
          colors={colors}
        />
      ) : (
        <AppHeader
          title="Recurring"
          subtitle={summaryLine}
          onBack={() => router.back()}
          rightIcon={loading ? undefined : 'plus'}
          onRightPress={openCreateForm}
        />
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: embedded ? 120 : 32,
          gap: 16,
        }}>
        {visibleCandidates.length > 0 && (
          <RecurringCandidatesCard
            candidates={visibleCandidates}
            onTracked={(createdCount) => {
              if (createdCount > 0) void load();
              void loadCandidates();
            }}
            onDismissed={() => setCandidatesHidden(true)}
          />
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
          <SkeletonFrame label="Loading subscriptions" testID="subscriptions-skeleton">
            <SkeletonCards count={3} lines={2} radius={28} />
          </SkeletonFrame>
        ) : visibleItems.length > 0 || visibleCardEMIs.length > 0 ? (
          <View className="gap-3">
            {visibleCardEMIs.map((emi) => (
              <CardEMIRow
                key={`card-emi-${emi.plan_id}`}
                emi={emi}
                onPress={() =>
                  router.push({ pathname: '/emi-plans/[id]', params: { id: String(emi.plan_id) } })
                }
              />
            ))}
            {visibleItems.map((subscription) => (
              <SubscriptionCard
                key={subscription.id}
                subscription={subscription}
                colors={colors}
                muted={muted}
                onPress={() => editSubscription(subscription)}
                onMarkPaid={() => void markPaid(subscription)}
                onCancelNow={() => void cancelNow(subscription)}
                onDelete={() => void confirmDelete(subscription)}
              />
            ))}
          </View>
        ) : !listError ? (
          <StateView
            icon="calendar-sync-outline"
            title={
              filter === 'all'
                ? 'Track your first recurring payment'
                : `No ${recurringKindMeta[filter].plural.toLowerCase()} yet`
            }
            message="Loans and EMIs, subscriptions, SIPs and bills — add anything that leaves your account on a schedule. It shows in Upcoming before it is due."
            actionLabel={
              filter === 'all'
                ? 'Add recurring payment'
                : `Add ${recurringKindMeta[filter].label.toLowerCase()}`
            }
            onAction={openCreateForm}
            compact
          />
        ) : null}
      </ScrollView>

      <AnimatedBottomSheet
        visible={showForm}
        onClose={closeForm}
        avoidKeyboard
        sheetStyle={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          maxHeight: '92%',
        }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
          <View className="mb-5 flex-row items-center justify-between gap-3">
            <ThemedText className="text-lg font-black" style={{ fontFamily: Fonts.title }}>
              {formTitle}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={closeForm}
              hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={muted} />
            </Pressable>
          </View>

          <View testID="recurring-kind-picker" className="mb-4 flex-row flex-wrap gap-2">
            {recurringKinds.map((kind) => (
              <Pill
                key={kind}
                label={recurringKindMeta[kind].label}
                selected={formKind === kind}
                onPress={() => chooseFormKind(kind)}
                colors={colors}
              />
            ))}
          </View>

          <Field
            label={kindMeta.nameLabel}
            value={merchant}
            onChangeText={setMerchant}
            colors={colors}
            placeholder={kindMeta.namePlaceholder}
            autoFocus={!editing}
          />
          {merchantSuggestions.length > 0 && (
            <View className="mb-3 flex-row flex-wrap gap-2">
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

          <Field
            label={
              formKind === 'loan'
                ? 'EMI amount'
                : formKind === 'investment'
                  ? 'Instalment amount'
                  : 'Amount'
            }
            value={amount}
            onChangeText={(value) => setAmount(sanitizeAmount(value))}
            keyboardType="decimal-pad"
            colors={colors}
            placeholder={
              formKind === 'loan' ? '9,965' : formKind === 'investment' ? '5,000' : '199'
            }
          />

          <Pressable
            accessibilityRole="button"
            onPress={openDueDatePicker}
            className="mb-4 flex-row items-center justify-between rounded-2xl border p-4"
            style={{ backgroundColor: colors.background, borderColor: colors.border }}>
            <View className="flex-row items-center gap-3">
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: colors.secondary }}>
                <MaterialCommunityIcons
                  name="calendar-check-outline"
                  size={22}
                  color={colors.accent}
                />
              </View>
              <View>
                <ThemedText className="text-[11px] font-black uppercase" style={{ color: muted }}>
                  {formKind === 'loan'
                    ? 'Next EMI on'
                    : formKind === 'subscription'
                      ? 'Renews on'
                      : 'Next payment on'}
                </ThemedText>
                <ThemedText className="mt-1 text-sm font-black" style={{ color: colors.text }}>
                  {formatDueDateLabel(nextDueDate)}
                </ThemedText>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={22} color={muted} />
          </Pressable>

          <SegmentedControl
            label="Repeats"
            values={intervalOptions}
            active={interval}
            onSelect={setInterval}
            colors={colors}
          />

          {/* The loan's or investment's own details. None of them is needed
              to schedule the payment — the amount and the date do that — so
              they fold, and the fold reads back whatever is filled in. A loan
              used to open with all fourteen inputs on screen. */}
          {formKind === 'loan' ? (
            <View className="mb-3">
              <FormDisclosure
                testID="recurring-loan-details"
                label="Loan details"
                icon="bank-outline"
                summary={kindDetailsSummary}
                expanded={showKindDetails}
                onToggle={() => setShowKindDetails((open) => !open)}>
                <View testID="recurring-loan-fields">
                  <ThemedText
                    className="mb-2 text-[11px] font-black uppercase"
                    style={{ color: muted }}>
                    Loan type
                  </ThemedText>
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {loanTypeOptions.map((option) => (
                      <Pill
                        key={option.value}
                        label={option.label}
                        selected={loanType === option.value}
                        onPress={() => setLoanType(loanType === option.value ? '' : option.value)}
                        colors={colors}
                      />
                    ))}
                  </View>
                  <Field
                    label="Lender"
                    value={lender}
                    onChangeText={setLender}
                    colors={colors}
                    placeholder="HDFC Bank, Bajaj Finance"
                  />
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Field
                        label="Loan amount"
                        value={principal}
                        onChangeText={(value) => setPrincipal(sanitizeAmount(value))}
                        keyboardType="decimal-pad"
                        colors={colors}
                        placeholder="3,00,000"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Interest % a year"
                        value={ratePct}
                        onChangeText={(value) => setRatePct(sanitizeAmount(value))}
                        keyboardType="decimal-pad"
                        colors={colors}
                        placeholder="10.5"
                      />
                    </View>
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Field
                        label="Total EMIs"
                        value={totalEmis}
                        onChangeText={(value) => setTotalEmis(value.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        colors={colors}
                        placeholder="36"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="EMIs already paid"
                        value={emisPaid}
                        onChangeText={(value) => setEmisPaid(value.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        colors={colors}
                        placeholder="0"
                      />
                    </View>
                  </View>
                  {Object.keys(loanSuggestion).length > 0 ? (
                    <Pressable
                      testID="recurring-loan-suggestion"
                      accessibilityRole="button"
                      onPress={() => {
                        haptics.select();
                        if (loanSuggestion.emi != null)
                          setAmount(String(Math.round(loanSuggestion.emi)));
                        if (loanSuggestion.principal != null)
                          setPrincipal(String(Math.round(loanSuggestion.principal)));
                        if (loanSuggestion.months != null) setTotalEmis(String(loanSuggestion.months));
                        if (loanSuggestion.annualRatePct != null)
                          setRatePct(String(loanSuggestion.annualRatePct));
                      }}
                      className="mb-3 flex-row items-center gap-2 rounded-2xl px-3 py-2.5"
                      style={{ backgroundColor: colors.secondary }}>
                      <MaterialCommunityIcons
                        name="calculator-variant-outline"
                        size={18}
                        color={colors.accent}
                      />
                      <ThemedText className="flex-1 text-xs font-bold" style={{ color: colors.text }}>
                        {loanSuggestion.emi != null
                          ? `EMI works out to ${formatMoney(loanSuggestion.emi)}. Use it`
                          : loanSuggestion.months != null
                            ? `That is ${loanSuggestion.months} EMIs. Use it`
                            : loanSuggestion.principal != null
                              ? `Loan amount works out to ${formatMoney(loanSuggestion.principal)}. Use it`
                              : `Interest works out to ${loanSuggestion.annualRatePct}% a year. Use it`}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                  <DateRow
                    label="First EMI on"
                    value={startDate}
                    onPress={openStartDatePicker}
                    colors={colors}
                    muted={muted}
                  />
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Field
                        label="Processing fee"
                        value={processingFee}
                        onChangeText={(value) => setProcessingFee(sanitizeAmount(value))}
                        keyboardType="decimal-pad"
                        colors={colors}
                        placeholder="0"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Foreclosure charge %"
                        value={foreclosurePct}
                        onChangeText={(value) => setForeclosurePct(sanitizeAmount(value))}
                        keyboardType="decimal-pad"
                        colors={colors}
                        placeholder="4"
                      />
                    </View>
                  </View>
                </View>
              </FormDisclosure>
            </View>
          ) : null}

          {formKind === 'investment' ? (
            <View className="mb-3">
              <FormDisclosure
                testID="recurring-investment-details"
                label="Investment details"
                icon="chart-line"
                summary={kindDetailsSummary}
                expanded={showKindDetails}
                onToggle={() => setShowKindDetails((open) => !open)}>
                <View testID="recurring-investment-fields">
                  <Field
                    label="Fund or platform"
                    value={platform}
                    onChangeText={setPlatform}
                    colors={colors}
                    placeholder="Zerodha Coin, Groww, Post office"
                  />
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <DateRow
                        label="Started on"
                        value={startDate}
                        onPress={openStartDatePicker}
                        colors={colors}
                        muted={muted}
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Yearly step-up %"
                        value={stepUpPct}
                        onChangeText={(value) => setStepUpPct(sanitizeAmount(value))}
                        keyboardType="decimal-pad"
                        colors={colors}
                        placeholder="10"
                      />
                    </View>
                  </View>
                </View>
              </FormDisclosure>
            </View>
          ) : null}

          <View className="mb-4">
            <FormDisclosure
              testID="recurring-more-options"
              label="More options"
              summary={moreOptionsSummary}
              expanded={showAdvanced}
              onToggle={() => setShowAdvanced((current) => !current)}>
                <View>
                  {editing && (
                    <SegmentedControl
                      label="Status"
                      values={statusOptions}
                      active={status}
                      onSelect={setStatus}
                      colors={colors}
                    />
                  )}

                  <Field
                    label="Display name"
                    value={name}
                    onChangeText={setName}
                    colors={colors}
                    placeholder={merchant.trim() || 'Same as merchant'}
                  />

                  <ChipPicker
                    label="Category"
                    options={categoryOptions}
                    active={category}
                    onSelect={setCategory}
                    colors={colors}
                  />

                  <View className="mb-4">
                    <ThemedText
                      className="mb-2 text-[11px] font-black uppercase"
                      style={{ color: muted }}>
                      Other intervals
                    </ThemedText>
                    <View className="flex-row flex-wrap gap-2">
                      {advancedIntervalOptions.map((option) => (
                        <Pill
                          key={option.value}
                          label={option.label}
                          selected={interval === option.value}
                          onPress={() => {
                            setInterval(option.value);
                            if (option.value === 'daily') {
                              setAutopay(true);
                              setReminderDays(0);
                            }
                          }}
                          colors={colors}
                        />
                      ))}
                    </View>
                  </View>

                  {interval !== 'daily' && interval !== 'business_daily' ? (
                    <View className="mb-4">
                      <ThemedText
                        className="mb-2 text-[11px] font-black uppercase"
                        style={{ color: muted }}>
                        Reminder
                      </ThemedText>
                      <View className="flex-row flex-wrap gap-2">
                        {reminderOptions.map((days) => (
                          <Pill
                            key={days}
                            label={reminderLabel(days)}
                            selected={reminderDays === days}
                            onPress={() => setReminderDays(days)}
                            colors={colors}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View
                      className="mb-4 rounded-2xl p-3"
                      style={{ backgroundColor: colors.secondary }}>
                      <ThemedText className="text-xs font-bold" style={{ color: colors.accent }}>
                        Daily transactions are added automatically. No daily reminder is sent.
                      </ThemedText>
                    </View>
                  )}

                  <View
                    className="mb-4 rounded-2xl border p-4"
                    style={{ borderColor: colors.border, backgroundColor: colors.background }}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <ThemedText className="text-sm font-black">Autopay</ThemedText>
                        <ThemedText className="mt-1 text-xs" style={{ color: muted }}>
                          Finnri adds each payment for you, then asks you to confirm it.
                        </ThemedText>
                      </View>
                      <HapticSwitch
                        value={autopay}
                        onValueChange={setAutopay}
                        trackColor={{ false: '#E0E0E0', true: colors.accent }}
                        thumbColor="white"
                      />
                    </View>
                    {autopay && (
                      <>
                        <View className="mt-4 flex-row flex-wrap gap-2">
                          {['Bank Account', 'UPI', 'Credit Card'].map((mode) => (
                            <Pill
                              key={mode}
                              label={mode}
                              selected={paymentMode === mode}
                              onPress={() => {
                                setPaymentMode(mode);
                                setAccountID(null);
                              }}
                              colors={colors}
                            />
                          ))}
                        </View>
                        <View className="mt-3 flex-row flex-wrap gap-2">
                          {getAccountsForPaymentMode(accounts, paymentMode).map((account) => (
                            <Pill
                              key={account.id}
                              label={account.name}
                              selected={accountID === account.id}
                              onPress={() => setAccountID(account.id)}
                              colors={colors}
                            />
                          ))}
                        </View>
                        <Pressable
                          className="mt-3 flex-row items-center gap-2"
                          onPress={() => router.push('/accounts/manage')}>
                          <MaterialCommunityIcons
                            name="plus-circle-outline"
                            size={18}
                            color={colors.accent}
                          />
                          <ThemedText className="text-xs font-black" style={{ color: colors.accent }}>
                            Add a payment account
                          </ThemedText>
                        </Pressable>
                      </>
                    )}
                  </View>

                  <View
                    className="mb-4 rounded-2xl border p-4"
                    style={{ borderColor: colors.border, backgroundColor: colors.background }}>
                    <View className="flex-row items-center justify-between gap-4">
                      <View className="flex-1">
                        <ThemedText className="text-sm font-black" style={{ fontFamily: Fonts.title }}>
                          Remind me to cancel
                        </ThemedText>
                        <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
                          For a trial or a plan you mean to stop. You’ll get a nudge before it renews.
                        </ThemedText>
                      </View>
                      <HapticSwitch
                        value={cancelBeforeDue}
                        onValueChange={(enabled) => {
                          setCancelBeforeDue(enabled);
                          if (enabled && reminderDays === 0) setReminderDays(1);
                        }}
                        trackColor={{ false: '#E0E0E0', true: colors.accent }}
                        thumbColor="white"
                      />
                    </View>
                  </View>

                  {cancelBeforeDue && (
                    <Pressable
                      onPress={openCancellationDatePicker}
                      className="mb-4 flex-row items-center justify-between rounded-2xl border p-4"
                      style={{ borderColor: colors.border, backgroundColor: colors.background }}>
                      <View>
                        <ThemedText
                          className="text-[11px] font-black uppercase"
                          style={{ color: muted }}>
                          Cancellation reminder date
                        </ThemedText>
                        <ThemedText className="mt-1 text-sm font-black">
                          {cancelOnDate || 'Choose date'}
                        </ThemedText>
                      </View>
                      <MaterialCommunityIcons
                        name="calendar-month-outline"
                        size={22}
                        color={colors.accent}
                      />
                    </Pressable>
                  )}

                  <Field
                    label="Notes"
                    value={notes}
                    onChangeText={setNotes}
                    colors={colors}
                    placeholder="Plan tier, cancellation link, family plan details"
                  />
                </View>
            </FormDisclosure>
          </View>

          {error && (
            <View className="mb-3 rounded-2xl px-3 py-2" style={{ backgroundColor: '#FFEBEE' }}>
              <ThemedText className="text-xs font-bold" style={{ color: '#D32F2F' }}>
                {error}
              </ThemedText>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={saveSubscription}
            disabled={saving}
            className="h-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}>
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <ThemedText className="text-sm font-black" style={{ color: 'white' }}>
                {/* The kind's key is its plain noun. Lower-casing the label
                    printed "Add loan / emi". */}
                {editing ? 'Save changes' : `Add ${formKind}`}
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </AnimatedBottomSheet>

      <Modal
        transparent
        animationType="slide"
        visible={isDatePickerVisible}
        onRequestClose={() => setIsDatePickerVisible(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-[28px] p-5" style={{ backgroundColor: colors.card }}>
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable onPress={() => setIsDatePickerVisible(false)}>
                <ThemedText className="text-sm font-black" style={{ color: muted }}>
                  Cancel
                </ThemedText>
              </Pressable>
              <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
                {datePickerTarget === 'cancel'
                  ? 'Cancellation reminder'
                  : datePickerTarget === 'start'
                    ? 'Started on'
                    : 'Next payment on'}
              </ThemedText>
              <Pressable
                onPress={() => {
                  if (datePickerTarget === 'cancel') setCancelOnDate(dateToApiDate(pendingDate));
                  else if (datePickerTarget === 'start') setStartDate(dateToApiDate(pendingDate));
                  else setNextDueDate(dateToApiDate(pendingDate));
                  setIsDatePickerVisible(false);
                }}>
                <ThemedText className="text-sm font-black" style={{ color: colors.accent }}>
                  Done
                </ThemedText>
              </Pressable>
            </View>
            <DateTimePicker
              value={pendingDate}
              mode="date"
              display="spinner"
              // A loan or SIP started in the past; only upcoming dates are bounded.
              minimumDate={datePickerTarget === 'start' ? undefined : new Date()}
              onValueChange={(_, selectedDate) => {
                if (selectedDate) setPendingDate(selectedDate);
              }}
              onDismiss={() => setIsDatePickerVisible(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DateRow({
  label,
  value,
  onPress,
  colors,
  muted,
}: {
  label: string;
  value: string;
  onPress: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mb-3 rounded-2xl border px-4 py-3"
      style={{ backgroundColor: colors.background, borderColor: colors.border }}>
      <ThemedText className="text-[11px] font-black uppercase" style={{ color: muted }}>
        {label}
      </ThemedText>
      <ThemedText
        className="mt-1 text-sm font-black"
        style={{ color: value ? colors.text : muted }}>
        {value ? formatDueDateLabel(value) : 'Pick a date'}
      </ThemedText>
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  autoFocus?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  colors,
  placeholder,
  keyboardType = 'default',
  autoFocus = false,
}: FieldProps) {
  return (
    <View className="mb-3">
      <ThemedText
        className="mb-1 text-[11px] font-black uppercase"
        style={{ color: `${colors.text}99` }}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={`${colors.text}66`}
        autoFocus={autoFocus}
        className="h-12 rounded-2xl border px-4 text-sm"
        style={{
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.background,
        }}
      />
    </View>
  );
}

type ChipPickerProps = {
  label: string;
  options: string[];
  active: string;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

function ChipPicker({ label, options, active, onSelect, colors }: ChipPickerProps) {
  return (
    <View className="mb-4">
      <ThemedText
        className="mb-2 text-[11px] font-black uppercase"
        style={{ color: `${colors.text}99` }}>
        {label}
      </ThemedText>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pill
            key={option}
            label={option}
            selected={active === option}
            onPress={() => onSelect(option)}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

function Pill({ label, selected, onPress, colors }: PillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="min-h-11 justify-center rounded-full border px-3 py-2"
      style={{
        backgroundColor: selected ? colors.secondary : colors.background,
        borderColor: selected ? colors.accent : colors.border,
      }}>
      <ThemedText
        className="text-[11px] font-black"
        style={{ color: selected ? colors.accent : `${colors.text}99` }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type SegmentedControlProps<T extends string> = {
  label: string;
  values: { value: T; label: string }[];
  active: T;
  onSelect: (value: T) => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

function SegmentedControl<T extends string>({
  label,
  values,
  active,
  onSelect,
  colors,
}: SegmentedControlProps<T>) {
  return (
    <View className="mb-3">
      <ThemedText
        className="mb-1 text-[11px] font-black uppercase"
        style={{ color: `${colors.text}99` }}>
        {label}
      </ThemedText>
      <View className="flex-row rounded-2xl p-1" style={{ backgroundColor: colors.background }}>
        {values.map((option) => {
          const selected = option.value === active;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.select();
                onSelect(option.value);
              }}
              className="min-h-11 flex-1 items-center justify-center rounded-xl py-2"
              style={{ backgroundColor: selected ? colors.secondary : 'transparent' }}>
              <ThemedText
                className="text-[11px] font-black uppercase"
                style={{ color: selected ? colors.accent : `${colors.text}99` }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type SubscriptionCardProps = {
  subscription: Subscription;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
  onPress: () => void;
  onMarkPaid: () => void;
  onCancelNow: () => void;
  onDelete: () => void;
};

function SubscriptionCard({
  subscription,
  colors,
  muted,
  onPress,
  onMarkPaid,
  onCancelNow,
  onDelete,
}: SubscriptionCardProps) {
  const urgent = subscription.due_state === 'overdue' || subscription.due_state === 'due_soon';
  const totalInstalments = subscription.total_instalments ?? 0;
  const instalmentsPaid = subscription.instalments_paid ?? 0;
  const loanFinished = totalInstalments > 0 && instalmentsPaid >= totalInstalments;
  const stateLabel = loanFinished ? 'completed' : subscription.due_state.replace('_', ' ');
  const instalmentLine =
    totalInstalments > 0
      ? loanFinished
        ? `All ${totalInstalments} payments done`
        : `${instalmentsPaid} of ${totalInstalments} paid · ${totalInstalments - instalmentsPaid} left`
      : null;
  const isActive = subscription.status === 'active';
  const kind = kindOf(subscription);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${subscription.name}`}
      onPress={onPress}
      className="rounded-[28px] border p-4"
      style={{
        backgroundColor: colors.card,
        borderColor: urgent ? '#F9A825' : colors.border,
      }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
            {subscription.name}
          </ThemedText>
          <ThemedText className="mt-1 text-xs" style={{ color: muted }}>
            {recurringKindMeta[kind].label} ·{' '}
            {kind === 'loan' && subscription.lender
              ? subscription.lender
              : kind === 'investment' && subscription.platform
                ? subscription.platform
                : subscription.category || 'Uncategorized'}{' '}
            · {intervalLabel(subscription.billing_interval)}
          </ThemedText>
        </View>
        <ThemedText className="text-base font-black" style={{ color: colors.accent }}>
          {formatMoney(subscription.amount)}
        </ThemedText>
      </View>
      <View className="mt-4 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <ThemedText
            className="text-xs font-bold capitalize"
            style={{ color: urgent ? '#F57F17' : muted }}>
            {stateLabel}
          </ThemedText>
          {instalmentLine ? (
            <ThemedText className="mt-1 text-[11px] font-bold" style={{ color: colors.text }}>
              {instalmentLine}
            </ThemedText>
          ) : null}
          <RecurringScheduleLine item={subscription} kind={kind} />
          {loanFinished ? null : (
            <ThemedText className="mt-1 text-[11px]" style={{ color: muted }}>
              Due {formatDueDateLabel(subscription.next_due_date)} ·{' '}
              {reminderLabel(subscription.reminder_days)}
            </ThemedText>
          )}
          {subscription.cancel_before_due && (
            <View
              className="mt-2 self-start rounded-full px-2 py-1"
              style={{ backgroundColor: '#FFF3E0' }}>
              <ThemedText className="text-[10px] font-black uppercase" style={{ color: '#EF6C00' }}>
                Cancel reminder
              </ThemedText>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-4">
          {isActive && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${subscription.name} paid`}
              onPress={onMarkPaid}
              hitSlop={12}>
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.accent} />
            </Pressable>
          )}
          {isActive && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cancel ${subscription.name}`}
              onPress={onCancelNow}
              hitSlop={12}>
              <MaterialCommunityIcons name="calendar-remove-outline" size={21} color="#EF6C00" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${subscription.name}`}
            onPress={onDelete}
            hitSlop={12}>
            <MaterialCommunityIcons name="trash-can-outline" size={21} color="#D32F2F" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
