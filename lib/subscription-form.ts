import { CATEGORIES } from '@/lib/categories';
import { BillingInterval, SubscriptionStatus } from '@/lib/subscriptions';

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
 * Daily and biweekly renewals are real but rare, and putting six segments in
 * the control makes every label unreadable to serve two of them. They live
 * under Advanced, where choosing Daily also meets its Autopay requirement in
 * the same section.
 */
export const advancedIntervalOptions: { value: BillingInterval; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'biweekly', label: 'Biweekly' },
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
