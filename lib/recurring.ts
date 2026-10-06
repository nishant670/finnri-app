import type { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  fetchSubscriptions,
  type BillingInterval,
  type LoanType,
  type RecurringKind,
  type Subscription,
} from './subscriptions';
import { API_BASE_URL } from './transactions';

/**
 * Every recurring payment in one place: subscriptions, loan EMIs, investments
 * such as SIPs, and bills. They share one schedule engine on the server; this
 * module adds what the Recurring tab shows on top of it.
 */

export type RecurringFilter = 'all' | RecurringKind;

export type RecurringCardEMI = {
  plan_id: number;
  account_id: number;
  card_name: string;
  title: string;
  monthly_amount: number;
  next_due_date?: string;
  total_instalments: number;
  instalments_paid: number;
};

export type RecurringSummary = {
  /** What active recurring payments commit an average month to. */
  monthly_total: number;
  by_kind: Partial<Record<RecurringKind | 'card_emi', number>>;
  active_count: number;
  next_due?: { name: string; kind: RecurringKind | 'card_emi'; amount: number; date: string };
};

export type RecurringOverview = {
  summary: RecurringSummary;
  items: Subscription[];
  card_emis: RecurringCardEMI[];
};

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const recurringKindMeta: Record<
  RecurringKind,
  {
    label: string;
    plural: string;
    icon: IconName;
    newTitle: string;
    editTitle: string;
    nameLabel: string;
    namePlaceholder: string;
    defaultCategory: string;
    defaultTag: string;
  }
> = {
  loan: {
    label: 'Loan / EMI',
    plural: 'Loans & EMIs',
    icon: 'bank-outline',
    newTitle: 'New loan or EMI',
    editTitle: 'Edit loan',
    nameLabel: 'Loan',
    namePlaceholder: 'Car loan, Home loan, iPhone EMI',
    defaultCategory: 'Bills',
    defaultTag: 'EMI',
  },
  subscription: {
    label: 'Subscription',
    plural: 'Subscriptions',
    icon: 'calendar-sync-outline',
    newTitle: 'New subscription',
    editTitle: 'Edit subscription',
    nameLabel: 'Merchant',
    namePlaceholder: 'Netflix, Spotify, Gym',
    defaultCategory: 'Entertainment',
    defaultTag: 'Subscription',
  },
  investment: {
    label: 'Investment',
    plural: 'Investments',
    icon: 'chart-line',
    newTitle: 'New investment',
    editTitle: 'Edit investment',
    nameLabel: 'Investment',
    namePlaceholder: 'Nifty 50 index SIP, PPF, RD',
    defaultCategory: 'Other',
    defaultTag: 'Investment',
  },
  bill: {
    label: 'Bill',
    plural: 'Bills',
    icon: 'file-document-outline',
    newTitle: 'New bill',
    editTitle: 'Edit bill',
    nameLabel: 'Bill',
    namePlaceholder: 'Rent, Electricity, Insurance premium',
    defaultCategory: 'Bills',
    defaultTag: 'General',
  },
};

export const recurringKinds: RecurringKind[] = ['loan', 'subscription', 'investment', 'bill'];

export const loanTypeOptions: { value: LoanType; label: string }[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'car', label: 'Car' },
  { value: 'two_wheeler', label: 'Two-wheeler' },
  { value: 'home', label: 'Home' },
  { value: 'education', label: 'Education' },
  { value: 'gold', label: 'Gold' },
  { value: 'consumer', label: 'Consumer / gadget' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' },
];

/** An item's kind, filing what an older API sent the way the server would. */
export const kindOf = (
  item: Pick<Subscription, 'kind' | 'transaction_tag' | 'purpose_type' | 'total_instalments'>
): RecurringKind => {
  if (item.kind) return item.kind;
  if (item.transaction_tag === 'EMI' || (item.total_instalments ?? 0) > 0) return 'loan';
  if (item.transaction_tag === 'Investment' || item.purpose_type === 'investment')
    return 'investment';
  return 'subscription';
};

const perYear: Record<BillingInterval, number> = {
  daily: 365,
  business_daily: 252,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

export const monthlyEquivalentOf = (amount: number, interval: BillingInterval) =>
  Math.round(((amount * (perYear[interval] ?? 12)) / 12) * 100) / 100;

/**
 * Builds the overview from the plain subscription list, for an API that does
 * not have `/v1/recurring` yet. Card EMIs need the new endpoint, so there are
 * none here.
 */
export const overviewFromSubscriptions = (items: Subscription[]): RecurringOverview => {
  const summary: RecurringSummary = { monthly_total: 0, by_kind: {}, active_count: 0 };
  for (const item of items) {
    if (item.status !== 'active') continue;
    const kind = kindOf(item);
    const monthly = monthlyEquivalentOf(Number(item.amount || 0), item.billing_interval);
    summary.active_count += 1;
    summary.monthly_total += monthly;
    summary.by_kind[kind] = (summary.by_kind[kind] ?? 0) + monthly;
    const date = item.next_due_date?.slice(0, 10);
    if (date && (!summary.next_due || date < summary.next_due.date)) {
      summary.next_due = { name: item.name, kind, amount: Number(item.amount), date };
    }
  }
  return { summary, items, card_emis: [] };
};

export const fetchRecurring = async (token: string): Promise<RecurringOverview> => {
  const response = await fetch(`${API_BASE_URL}/v1/recurring`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    // An API without the Recurring overview: the list still works.
    return overviewFromSubscriptions(await fetchSubscriptions(token));
  }
  if (!response.ok) {
    throw new Error('Unable to load recurring payments right now.');
  }
  const overview = (await response.json()) as RecurringOverview;
  return {
    summary: overview.summary ?? { monthly_total: 0, by_kind: {}, active_count: 0 },
    items: overview.items ?? [],
    card_emis: overview.card_emis ?? [],
  };
};

/* ------------------------------------------------------------------ *
 * Loan arithmetic, for filling the form in
 * ------------------------------------------------------------------ */

export type LoanTerms = {
  principal?: number;
  annualRatePct?: number;
  months?: number;
  emi?: number;
};

const monthlyRate = (annualRatePct: number) => annualRatePct / 12 / 100;

/** The EMI on a reducing-balance loan. */
export const emiFor = (principal: number, annualRatePct: number, months: number) => {
  if (months <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return principal / months;
  const growth = (1 + r) ** months;
  return (principal * r * growth) / (growth - 1);
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Works out whichever one of principal, rate, tenure and EMI is missing from
 * the other three — what a loan letter prints is rarely all four. Returns
 * only the solved field, or nothing when exactly one is not missing or the
 * figures cannot describe a loan (an EMI that never pays it off).
 */
export const solveLoan = (terms: LoanTerms): Partial<Required<LoanTerms>> => {
  const { principal: p, annualRatePct: rate, months: n, emi } = terms;
  const known = [p, rate, n, emi].filter((value) => (value != null && value > 0) || value === 0);
  const missing = [p, rate, n, emi].filter((value) => value == null);
  if (missing.length !== 1 || known.length !== 3) return {};

  if (emi == null && p && rate != null && n) {
    return { emi: round2(emiFor(p, rate, n)) };
  }
  if (p == null && emi && rate != null && n) {
    const r = monthlyRate(rate);
    if (r === 0) return { principal: round2(emi * n) };
    const growth = (1 + r) ** n;
    return { principal: round2((emi * (growth - 1)) / (r * growth)) };
  }
  if (n == null && p && emi && rate != null) {
    const r = monthlyRate(rate);
    if (r === 0) return { months: Math.ceil(p / emi) };
    if (emi <= p * r) return {};
    return { months: Math.ceil(Math.log(emi / (emi - p * r)) / Math.log(1 + r)) };
  }
  if (rate == null && p && n && emi) {
    if (emi * n < p) return {};
    if (Math.abs(emi * n - p) < 0.5) return { annualRatePct: 0 };
    // Bisection on the annual rate: the EMI rises with the rate.
    let low = 0;
    let high = 100;
    for (let step = 0; step < 100; step += 1) {
      const mid = (low + high) / 2;
      if (emiFor(p, mid, n) > emi) high = mid;
      else low = mid;
    }
    return { annualRatePct: Math.round(((low + high) / 2) * 100) / 100 };
  }
  return {};
};
