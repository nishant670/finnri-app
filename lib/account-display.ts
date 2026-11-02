import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Account, AccountType, normalizeAccountType } from '@/lib/accounts';
import { formatRelativeDay } from '@/lib/datetime';
import { formatMoney } from '@/lib/money';

export const accountTypeLabels: Record<AccountType, string> = {
  cash: 'Cash',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  bank: 'Bank account',
  wallet: 'Wallet',
  upi: 'UPI',
  other: 'Other account',
};

export const accountVisuals: Record<
  AccountType,
  {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
    bg: string;
  }
> = {
  cash: { icon: 'cash', color: '#64748B', bg: '#F1F5F9' },
  credit_card: { icon: 'credit-card-outline', color: '#A855F7', bg: '#F3E8FF' },
  debit_card: { icon: 'cash-multiple', color: '#14B8A6', bg: '#CCFBF1' },
  bank: { icon: 'bank-outline', color: '#2563EB', bg: '#DBEAFE' },
  wallet: { icon: 'wallet-outline', color: '#F97316', bg: '#FFEDD5' },
  upi: { icon: 'qrcode-scan', color: '#22C55E', bg: '#DCFCE7' },
  other: { icon: 'wallet-outline', color: '#64748B', bg: '#F1F5F9' },
};

const providerVisualIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  bank: 'bank',
  'credit-card': 'credit-card',
  wallet: 'wallet',
  'qrcode-scan': 'qrcode-scan',
  google: 'google',
  'alpha-p-circle': 'alpha-p-circle',
  amazon: 'shopping-outline',
};

/** Provider-specific local icon when the catalogue has one, with the account
 * type's established colour/background so a provider never introduces an
 * unthemed brand colour. */
export const getAccountVisual = (account: Account) => {
  const fallback = accountVisuals[normalizeAccountType(account.type)];
  const icon = providerVisualIcons[account.provider_details?.asset_key ?? ''];
  return icon ? { ...fallback, icon } : fallback;
};

export const formatAccountIdentifier = (account: Account) => {
  const lastDigits = (account.last4 || account.identifier)?.replace(/\D/g, '').slice(-4);
  if (lastDigits) return `•••• ${lastDigits}`;
  if (account.upi_handle) return account.upi_handle;
  if (account.wallet_nickname) return account.wallet_nickname;
  if (account.provider) return account.provider;
  return accountTypeLabels[normalizeAccountType(account.type)];
};

/* ------------------------------------------------------------------ *
 * Figures
 *
 * Every account used to read ₹0 with a "No balance" chip while the ledger held
 * three months of spending, and the credit card read ₹2,00,000 — its limit,
 * formatted exactly like money the user had. The backend now derives the real
 * figures (`account.summary`); these helpers decide which one an account leads
 * with, so no screen has to guess.
 *
 * The rule that must not bend: `credit_limit` is only ever a denominator.
 * ------------------------------------------------------------------ */

export type AccountHeadline = {
  label: string;
  amount: number;
  /** Shown instead of the amount when there is genuinely nothing to report. */
  placeholder?: string;
};

export const hasLedgerActivity = (account: Account) => (account.summary?.entries_total ?? 0) > 0;

export const hasOpeningBalance = (account: Account) =>
  typeof account.balance === 'number' && account.balance !== 0;

/**
 * The one money figure an account row leads with: what a card owes, or what
 * everything else has spent so far this month.
 */
export const getAccountHeadline = (account: Account): AccountHeadline => {
  const summary = account.summary;

  if (normalizeAccountType(account.type) === 'credit_card') {
    return { label: 'Outstanding', amount: summary?.outstanding ?? account.balance ?? 0 };
  }

  return {
    label: 'Spent this month',
    amount: summary?.spent_this_month ?? 0,
    placeholder: hasLedgerActivity(account) ? undefined : 'No spend yet',
  };
};

export type CreditUsage = {
  outstanding: number;
  limit: number;
  /** True percentage — can exceed 100. Clamp only the bar, never the number. */
  percent: number;
  /** "₹23,500 of ₹2,00,000 used" */
  label: string;
};

export const getCreditUsage = (account: Account): CreditUsage | null => {
  if (normalizeAccountType(account.type) !== 'credit_card') return null;
  const limit = account.credit_limit ?? 0;
  if (limit <= 0) return null;

  const outstanding = account.summary?.outstanding ?? account.balance ?? 0;
  const percent = account.summary?.credit_utilisation ?? Math.max(0, (outstanding / limit) * 100);
  return {
    outstanding,
    limit,
    percent,
    label: `${formatMoney(outstanding)} of ${formatMoney(limit)} used`,
  };
};

/**
 * The limit breakdown, when the card has one.
 *
 * The card detail screen leads with this instead of a bare outstanding figure:
 * available limit is what a card user actually opens the app to find out.
 * Rows in a list stay on `getAccountHeadline`, where there is only room for
 * one number and "what you owe" is the more useful one at a glance.
 */
export const getCardLimit = (account: Account) =>
  normalizeAccountType(account.type) === 'credit_card' ? (account.summary?.limit ?? null) : null;

/** The bill to pay, when a statement has been entered. */
export const getCurrentStatement = (account: Account) =>
  normalizeAccountType(account.type) === 'credit_card'
    ? (account.summary?.current_statement ?? null)
    : null;

/**
 * Whether a card is being tracked from its bill or only from the ledger.
 *
 * A card with no statement is reporting what Finnri happens to know, which is
 * only as complete as what the user has logged. Screens use this to say so
 * rather than presenting an estimate as a fact.
 */
export const isCardTrackedFromStatement = (account: Account) =>
  getCardLimit(account)?.outstanding_source === 'statement';

/**
 * Opening balance plus everything logged since. Only exists when the user
 * actually entered an opening balance — otherwise this would be net flow
 * wearing a balance's clothes.
 */
export const getRunningBalance = (account: Account): number | null =>
  typeof account.summary?.running_balance === 'number' ? account.summary.running_balance : null;

/** "Last activity Yesterday", or null for an account nothing has touched. */
export const getLastActivityLabel = (account: Account): string | null =>
  formatRelativeDay(account.summary?.last_activity_date);

export const getCreditDueLabel = (dueDay?: number) => {
  if (!dueDay || dueDay < 1 || dueDay > 31) return null;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
  if (dueDate < startOfToday) dueDate.setMonth(dueDate.getMonth() + 1);

  const diffDays = Math.ceil((dueDate.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due on ${dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
};

/** The next user-visible state of a card's configurable due reminder. */
export const getCreditReminderLabel = (account: Account) => {
  if (account.reminder_enabled === false) return 'Reminders off';
  if (!account.due_day || account.due_day < 1 || account.due_day > 31) {
    return 'Add a due date to schedule reminders';
  }

  const leadDays = Math.min(30, Math.max(0, account.reminder_days_before ?? 3));
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const statementDue = account.summary?.current_statement?.due_date;
  let dueDate = statementDue ? new Date(`${statementDue}T00:00:00`) : new Date(NaN);
  if (Number.isNaN(dueDate.getTime()) || account.summary?.current_statement?.status === 'paid') {
    dueDate = new Date(today.getFullYear(), today.getMonth(), account.due_day);
    if (dueDate < startOfToday) dueDate.setMonth(dueDate.getMonth() + 1);
  }

  const reminderDate = new Date(dueDate);
  reminderDate.setDate(reminderDate.getDate() - leadDays);
  const daysUntil = Math.ceil((reminderDate.getTime() - startOfToday.getTime()) / 86400000);
  if (daysUntil === 0) return 'Reminder today';
  if (daysUntil === 1) return 'Reminder tomorrow';
  if (daysUntil > 1) {
    return `Reminder ${reminderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  }
  return dueDate >= startOfToday
    ? 'Reminder active for this bill'
    : 'Reminder active · bill overdue';
};

/* ------------------------------------------------------------------ *
 * Setup
 *
 * The details that make an account easy to tell apart and to track, as one
 * list both the account page and the "account added" screen draw (boards
 * R5-AcctCard, R5-AcctBank, R5-AcctAdded). A done item says what was entered;
 * a missing one says what adding it gets you.
 * ------------------------------------------------------------------ */

export type AccountSetupKey = 'provider' | 'identifier' | 'limit' | 'due' | 'balance';

export type AccountSetupItem = {
  key: AccountSetupKey;
  label: string;
  complete: boolean;
  /** The value when done; what it is for when missing. */
  detail: string;
};

const ordinal = (day: number) => {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`;
};

export const getAccountSetupItems = (account: Account): AccountSetupItem[] => {
  const accountType = normalizeAccountType(account.type);
  const provider = account.provider?.trim() ?? '';
  const lastDigits = account.last4?.trim();
  const identifier =
    (lastDigits ? `•••• ${lastDigits}` : '') ||
    account.upi_handle?.trim() ||
    account.wallet_nickname?.trim() ||
    account.identifier?.trim() ||
    '';
  const hasBalance = typeof account.balance === 'number' && account.balance !== 0;
  const balanceItem = (label: string): AccountSetupItem => ({
    key: 'balance',
    label,
    complete: hasBalance,
    detail: hasBalance ? formatMoney(account.balance ?? 0) : 'Start a running balance for this account',
  });

  if (accountType === 'credit_card') {
    const limit = account.credit_limit ?? 0;
    const dueDay = account.due_day ?? 0;
    const hasDueDay = dueDay >= 1 && dueDay <= 31;
    return [
      {
        key: 'provider',
        label: 'Card issuer',
        complete: Boolean(provider),
        detail: provider || 'The bank behind the card',
      },
      {
        key: 'identifier',
        label: 'Last 4 digits',
        complete: Boolean(identifier),
        detail: identifier || 'Tell it apart from your other cards',
      },
      {
        key: 'limit',
        label: 'Credit limit',
        complete: limit > 0,
        detail: limit > 0 ? formatMoney(limit) : 'See how much of your limit is free',
      },
      {
        key: 'due',
        label: 'Due date',
        complete: hasDueDay,
        detail: hasDueDay ? `The ${ordinal(dueDay)} of each month` : 'Get a reminder before each bill',
      },
    ];
  }

  if (accountType === 'cash') return [balanceItem('Opening cash balance')];

  const providerLabel =
    accountType === 'upi' ? 'UPI app' : accountType === 'wallet' ? 'Wallet' : accountType === 'other' ? 'Provider' : 'Bank';
  const identifierLabel =
    accountType === 'upi'
      ? 'UPI handle or nickname'
      : accountType === 'wallet'
        ? 'Wallet nickname'
        : 'Last 4 digits';

  return [
    {
      key: 'provider',
      label: providerLabel,
      complete: Boolean(provider),
      detail: provider || (accountType === 'upi' ? 'GPay, PhonePe, Paytm' : 'Where the money is held'),
    },
    {
      key: 'identifier',
      label: identifierLabel,
      complete: Boolean(identifier),
      detail: identifier || 'Tell it apart from your other accounts',
    },
    balanceItem('Opening balance'),
  ];
};
