import { CATEGORIES } from '@/lib/categories';
import { formatMoney } from '@/lib/money';
import { kindOf, recurringKindMeta, solveLoan, type RecurringSummary } from '@/lib/recurring';
import type {
  BillingInterval,
  LoanType,
  RecurringKind,
  Subscription,
  SubscriptionStatus,
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
export const intervalOptions: { value: BillingInterval; label: string }[] = [
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
export const advancedIntervalOptions: { value: BillingInterval; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'biweekly', label: 'Every 2 weeks' },
];

export const statusOptions: { value: SubscriptionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

// A subscription generates transactions, and autopay copies this straight onto
// them, so it uses the same canonical categories as everything else. The old
// subscription-only list (Productivity, Cloud, Membership, Learning) put values
// into the ledger that no other screen could render or filter.
export const categoryOptions = [...CATEGORIES];

// Most subscriptions are streaming or apps; Entertainment is the likeliest pick.
export const defaultSubscriptionCategory = 'Entertainment';

export const reminderOptions = [0, 1, 3, 7, 14, 30];

export const defaultReminderDays = 3;

export const todayISO = () => dateToApiDate(new Date());

export const nextMonthISO = () => {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  return dateToApiDate(next);
};

export const parseAmount = (value: string) => Number(value.replace(/,/g, '').trim());

export const sanitizeAmount = (value: string) => value.replace(/[^0-9.]/g, '');

export const toParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

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

export function apiDateToLocalDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date();
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function dateToApiDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDueDateLabel(value: string) {
  return apiDateToLocalDate(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function reminderLabel(days: number) {
  if (days === 0) return 'On due date';
  if (days === 1) return '1 day before';
  return `${days} days before`;
}

/** Legacy rows can still hold `business_daily`; only the picker dropped it. */
export function intervalLabel(value: BillingInterval) {
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

/** Subscriptions that are overdue or about to be. */
export const countDueSoon = (subscriptions: Subscription[]) =>
  subscriptions.filter((item) => item.due_state === 'due_soon' || item.due_state === 'overdue')
    .length;

/** What the active subscriptions cost per month, whatever cadence each renews on. */
export const projectMonthlyTotal = (activeSubscriptions: Subscription[]) =>
  activeSubscriptions.reduce(
    (sum, item) => sum + monthlyEquivalent(Number(item.amount || 0), item.billing_interval),
    0
  );

/**
 * The one line the screen exists to say. Both headers read it, so the total
 * is visible before the list is scrolled and without a tile row competing
 * with the subscriptions themselves for the top of the screen.
 */
export const buildSummaryLine = ({
  loading,
  overview,
  activeCount,
  projectedMonthly,
  dueCount,
}: {
  loading: boolean;
  overview: RecurringSummary | null;
  activeCount: number;
  projectedMonthly: number;
  dueCount: number;
}) => {
  if (loading) return 'Loading recurring payments…';
  const count = overview?.active_count ?? activeCount;
  if (count === 0) return 'Nothing recurring tracked yet';
  const monthly = overview?.monthly_total ?? projectedMonthly;
  const headline = `${formatMoney(monthly)}/month across ${count} recurring payment${count === 1 ? '' : 's'}`;
  return dueCount > 0 ? `${headline} · ${dueCount} due soon` : headline;
};

/**
 * Whichever of loan amount, rate, tenure and EMI the user left empty, worked
 * out from the other three. Offered, never written over what they typed.
 */
export const suggestLoanFigures = ({
  formKind,
  principal,
  ratePct,
  totalEmis,
  amount,
}: {
  formKind: RecurringKind;
  principal: string;
  ratePct: string;
  totalEmis: string;
  amount: string;
}) => {
  if (formKind !== 'loan') return {};
  const value = (raw: string) => (raw.trim() === '' ? undefined : parseAmount(raw));
  return solveLoan({
    principal: value(principal),
    annualRatePct: value(ratePct),
    months: value(totalEmis),
    emi: value(amount),
  });
};

export type RecurringFormValues = {
  name: string;
  merchant: string;
  category: string;
  amount: string;
  interval: BillingInterval;
  nextDueDate: string;
  status: SubscriptionStatus;
  reminderDays: number;
  cancelBeforeDue: boolean;
  cancelOnDate: string;
  autopay: boolean;
  paymentMode: string;
  accountID: number | null;
  notes: string;
  formKind: RecurringKind;
  startDate: string;
  totalEmis: string;
  emisPaid: string;
  loanType: LoanType | '';
  lender: string;
  principal: string;
  ratePct: string;
  processingFee: string;
  foreclosurePct: string;
  platform: string;
  stepUpPct: string;
  editing: Subscription | null;
  kindMeta: (typeof recurringKindMeta)[RecurringKind];
};

/** What {@link validateRecurringForm} found, and which folds hide the fields it names. */
export type RecurringFormValidation = {
  /** Everything wrong with the form as filled in, in the order the user meets it. */
  messages: string[];
  /** A message names a control under More options. */
  opensMoreOptions: boolean;
  /** A message names a control in the loan's own details. */
  opensKindDetails: boolean;
};

/**
 * Checks the form. A failure caused by something folded away has to open the
 * fold, or the message names a control the user cannot see — so the result
 * says which folds those are.
 */
export const validateRecurringForm = ({
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
  namePlaceholder,
}: Pick<
  RecurringFormValues,
  | 'name'
  | 'merchant'
  | 'amount'
  | 'nextDueDate'
  | 'reminderDays'
  | 'cancelBeforeDue'
  | 'cancelOnDate'
  | 'interval'
  | 'autopay'
  | 'accountID'
  | 'formKind'
  | 'totalEmis'
  | 'emisPaid'
  | 'ratePct'
> & { namePlaceholder: string }): RecurringFormValidation => {
  const amountValue = parseAmount(amount);
  // The sheet asks for a merchant, not a name — "Netflix" is both. A display
  // name is only ever entered under More options, so the merchant stands in for
  // it and the backend's required `name` is satisfied without a field.
  const resolvedName = name.trim() || merchant.trim();
  const validation: string[] = [];
  let opensMoreOptions = false;
  let opensKindDetails = false;
  if (!resolvedName) validation.push(`Add a name — like ${namePlaceholder.split(',')[0]}.`);
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
  return { messages: validation, opensMoreOptions, opensKindDetails };
};

/** The body sent to create or update a recurring payment. */
export const buildRecurringPayload = ({
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
  editing,
  kindMeta,
}: RecurringFormValues) => {
  const amountValue = parseAmount(amount);
  const resolvedName = name.trim() || merchant.trim();
  const totalEmiCount = totalEmis.trim() ? Number(totalEmis) : 0;
  const paidEmiCount = emisPaid.trim() ? Number(emisPaid) : 0;
  return {
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
};
