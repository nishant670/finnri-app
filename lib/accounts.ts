import { API_BASE_URL } from './transactions';
import { ApiFieldErrors, readApiError } from './api-error';
import { getClientTimeZone } from './datetime';

/**
 * What an account can prove from its transactions, derived by the backend (see
 * `internal/http/account_summary.go`). Nothing in here is user-entered.
 *
 * Absent on the create/update responses, which return the bare account; the
 * screens re-fetch the list to get figures.
 */
export type AccountSummary = {
  /** Month-to-date: the 1st through today, same window as the dashboard. */
  spent_this_month: number;
  received_this_month: number;
  entries_this_month: number;
  lifetime_spent: number;
  lifetime_received: number;
  entries_total: number;
  /** YYYY-MM-DD of the most recent entry; absent when never used. */
  last_activity_date?: string;
  /** Credit cards only — what is owed. Never `credit_limit`. */
  outstanding?: number;
  /** Credit cards with a limit only. Percent; can exceed 100. */
  credit_utilisation?: number;
  /** Non-card accounts with an opening balance only. */
  running_balance?: number;
  /** Credit cards only. The limit breakdown a card screen leads with. */
  limit?: CardLimitSummary;
  /** Credit cards with at least one priced statement. The bill to pay. */
  current_statement?: CurrentStatementSummary;
  /** Cards with an annual fee and a fee month: this card year's waiver progress. */
  annual_fee?: AnnualFeeStatus;
};

/**
 * Where a card's annual fee stands. The card year is the twelve months before
 * the 1st of the fee month; `spent` is net card spend in it, Finnri's guide to
 * the bank's own waiver count.
 */
export type AnnualFeeStatus = {
  fee: number;
  fee_month: string;
  renewal_date: string;
  card_year_start: string;
  spent: number;
  waiver_spend?: number;
  remaining_to_waive?: number;
  waived?: boolean;
};

/**
 * How much of a card is spoken for.
 *
 *     available_limit = credit_limit - outstanding - emi_blocked_principal
 *
 * `outstanding_source` says which side of the card the figure came from.
 * `statement` means the bank told us and the number is exact; `ledger` means
 * the card has no bill yet and this is what Finnri's own transactions imply.
 * Worth surfacing — a card reading from the ledger is under-counting whatever
 * the user has not logged.
 */
export type CardLimitSummary = {
  outstanding: number;
  outstanding_source: 'statement' | 'ledger';
  /** Principal on EMI plans not yet billed to a statement. */
  emi_blocked_principal: number;
  credit_limit: number;
  /** Absent when the user has not entered a limit. Negative when over it. */
  available_limit?: number;
  /** Percent of the limit committed. Can exceed 100. */
  utilisation_pct?: number;
};

/** The bill, as the accounts list needs it. */
export type CurrentStatementSummary = {
  id: number;
  statement_date: string;
  due_date: string;
  total_due: number;
  minimum_due: number;
  paid_amount: number;
  remaining_due: number;
  status: 'draft' | 'unpaid' | 'partial' | 'paid';
  is_overdue: boolean;
  /** Negative once the due date has passed. */
  days_to_due: number;
};

export type Account = {
  id: number;
  type: AccountType;
  name: string;
  color: string;
  provider?: string;
  identifier?: string;
  provider_id?: string;
  provider_details?: AccountProvider;
  last4?: string;
  upi_handle?: string;
  wallet_nickname?: string;
  account_nickname?: string;
  credit_limit?: number;
  due_day?: number;
  /** Day of month a card bills on. 0 until the first statement infers it. */
  statement_day?: number;
  /** Lead time on the "bill due soon" reminder. */
  reminder_days_before?: number;
  reminder_enabled?: boolean;
  card_ledger_reset_at?: string;
  /**
   * Only changes how the due-date reminder is worded. A payment is never
   * recorded without the user confirming it.
   */
  autopay_enabled?: boolean;
  /**
   * Opening balance — what the account held (or, on a card, owed) before the
   * first logged transaction. Read `summary` for anything current.
   */
  balance?: number;
  fee_month?: string;
  /** Yearly membership fee before GST; 0 when unknown. */
  annual_fee?: number;
  /** Yearly spend that waives the annual fee; 0 when unknown. */
  fee_waiver_spend?: number;
  is_default?: boolean;
  auto_created?: boolean;
  summary?: AccountSummary;
  created_at?: string;
  updated_at?: string;
};

export type AccountPayload = {
  type: AccountType;
  name: string;
  color: string;
  provider?: string;
  identifier?: string;
  provider_id?: string;
  last4?: string;
  upi_handle?: string;
  wallet_nickname?: string;
  account_nickname?: string;
  credit_limit?: number;
  due_day?: number;
  statement_day?: number;
  reminder_days_before?: number;
  reminder_enabled?: boolean;
  autopay_enabled?: boolean;
  fee_month?: string;
  annual_fee?: number;
  fee_waiver_spend?: number;
  balance?: number;
  is_default?: boolean;
  /** Set only by the one-tap capture shortcut; cleared by the first user edit. */
  auto_created?: boolean;
};

export type AccountType =
  'cash' | 'upi' | 'bank' | 'credit_card' | 'debit_card' | 'wallet' | 'other';

export type AccountProvider = {
  id: string;
  display_name: string;
  type_support: AccountType[];
  asset_key: string;
  aliases?: string[];
};

export type AccountSuggestion = Pick<
  AccountPayload,
  'type' | 'name' | 'color' | 'provider' | 'identifier'
> & { reason: string };

const paymentModeAccountDefaults: Record<
  string,
  Pick<AccountPayload, 'type' | 'name' | 'color'>
> = {
  Cash: { type: 'cash', name: 'Cash Account', color: '#2ECC71' },
  UPI: { type: 'upi', name: 'UPI Account', color: '#00D2B4' },
  'Credit Card': { type: 'credit_card', name: 'Credit Card Account', color: '#8257E5' },
  // Every mode in PAYMENT_MODES needs an entry. `Bank Account` was the one gap,
  // and it is the mode salary lands on — so one-tap account creation failed on
  // exactly the transaction most likely to need it. `accountsCoverEveryPaymentMode`
  // in `__tests__/account-suggestions.test.ts` now fails if a mode is added
  // here without a default.
  'Bank Account': { type: 'bank', name: 'Bank Account', color: '#42A5F5' },
  Wallets: { type: 'wallet', name: 'Wallet Account', color: '#FF9F43' },
};

export const normalizeAccountType = (type?: string | null): AccountType => {
  const normalized = type?.trim().toLowerCase();
  if (normalized === 'credit') return 'credit_card';
  if (normalized === 'debit') return 'debit_card';
  if (normalized === 'wallets') return 'wallet';
  if (
    normalized === 'cash' ||
    normalized === 'upi' ||
    normalized === 'bank' ||
    normalized === 'credit_card' ||
    normalized === 'debit_card' ||
    normalized === 'wallet'
  ) {
    return normalized;
  }
  return 'other';
};

export const getAccountTypeForPaymentMode = (mode?: string | null) => {
  if (!mode) return null;
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'cash') return 'cash';
  if (normalized === 'upi') return 'upi';
  if (normalized === 'credit card') return 'credit_card';
  if (normalized === 'bank account' || normalized === 'bank') return 'bank';
  if (normalized === 'wallets' || normalized === 'wallet') return 'wallet';
  return null;
};

export const getAccountsForPaymentMode = (accounts: Account[], mode?: string | null) => {
  const accountType = getAccountTypeForPaymentMode(mode);
  if (!accountType) return accounts;
  return accounts.filter((account) => normalizeAccountType(account.type) === accountType);
};

export const getPreferredAccountForPaymentMode = (accounts: Account[], mode?: string | null) => {
  const compatibleAccounts = getAccountsForPaymentMode(accounts, mode);
  return compatibleAccounts.find((account) => account.is_default) ?? compatibleAccounts[0] ?? null;
};

export const getAutoAccountPayloadForPaymentMode = (
  mode?: string | null
): AccountPayload | null => {
  if (!mode) return null;
  const matchedMode = Object.keys(paymentModeAccountDefaults).find(
    (option) => option.toLowerCase() === mode.trim().toLowerCase()
  );
  if (!matchedMode) return null;
  return {
    ...paymentModeAccountDefaults[matchedMode],
    provider: '',
    identifier: '',
    credit_limit: 0,
    due_day: 0,
    fee_month: '',
    balance: 0,
    is_default: false,
  };
};

const comparableAccountText = (value?: string | null) =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HINT_FILLER_WORDS = new Set([
  'my',
  'the',
  'a',
  'an',
  'credit',
  'debit',
  'card',
  'cards',
  'account',
  'bank',
  'wallet',
  'upi',
  'ending',
  'last',
  'digits',
  'number',
  'via',
  'from',
  'used',
  'with',
  'using',
  'paid',
  'cc',
]);

const hintWords = (value?: string | null) =>
  (value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !HINT_FILLER_WORDS.has(word) && !/^\d{4}$/.test(word));

const accountWords = (account: Account) =>
  new Set(
    [
      account.name,
      account.provider,
      account.provider_id,
      account.provider_details?.display_name,
      ...(account.provider_details?.aliases ?? []),
    ].flatMap((value) =>
      (value ?? '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    )
  );

export type AccountHintMatch = { account: Account; score: number };

/**
 * Saved accounts a parser hint could be talking about, best first.
 *
 * "ICICI Amazon credit card" and a card saved as "Amazon ICICI" are the same
 * card, and a substring comparison cannot see that: the words are the same and
 * the order is not. This compares word by word, in any order, ignoring the
 * words that only say what kind of thing it is (card, bank, account). A card
 * whose last four digits are in the hint is a certain match.
 *
 * `score` is the share of the hint's own words the account accounts for, so 1
 * means everything the user said is on the account and 0.5 means half of it.
 * Nothing under 0.5 is returned — "HDFC" alone should find both HDFC cards, but
 * "Amazon" should not drag in an unrelated one that shares a single filler.
 */
export const matchAccountsToHint = (
  input: AccountSuggestionHint,
  accounts: Account[]
): AccountHintMatch[] => {
  const type = getAccountTypeForPaymentMode(input.mode);
  const hint = input.accountHint?.trim() ?? '';
  if (!type || !hint) return [];
  const identifier =
    hint.match(/(?:ending|last|xx|\*{2,})\s*[-:]?\s*(\d{4})\b/i)?.[1] ??
    hint.match(/\b(\d{4})\b/)?.[1] ??
    '';
  const words = hintWords(hint);
  if (words.length === 0 && !identifier) return [];

  return accounts
    .filter((account) => normalizeAccountType(account.type) === type)
    .map((account) => {
      const structuredIdentifier =
        account.last4 || account.upi_handle || account.wallet_nickname || account.identifier;
      if (identifier && comparableAccountText(structuredIdentifier).endsWith(identifier)) {
        return { account, score: 1 };
      }
      if (words.length === 0) return { account, score: 0 };
      const known = accountWords(account);
      const found = words.filter((word) => known.has(word)).length;
      return { account, score: found / words.length };
    })
    .filter((match) => match.score >= 0.5)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(Boolean(b.account.is_default)) - Number(Boolean(a.account.is_default))
    );
};

/**
 * The account to pre-select for a hint, or null when the hint does not point at
 * one. A tie at the top is still a guess, so it is returned for the sheet to
 * ask about rather than hidden.
 */
export const bestAccountForHint = (
  input: AccountSuggestionHint,
  accounts: Account[]
): Account | null => matchAccountsToHint(input, accounts)[0]?.account ?? null;

export type AccountSuggestionHint = {
  mode?: string | null;
  accountHint?: string | null;
  cardNetwork?: string | null;
};

/**
 * Turn a parser hint such as "my HDFC card ending 1234" into a secondary
 * setup suggestion. It never creates anything and disappears when an existing
 * provider, name, or identifier already represents the hinted account.
 */
export const suggestAccountFromTransaction = (
  input: AccountSuggestionHint,
  accounts: Account[]
): AccountSuggestion | null => {
  const type = getAccountTypeForPaymentMode(input.mode);
  const hint = input.accountHint?.trim() ?? '';
  if (!type || !hint) return null;

  const identifier =
    hint.match(/(?:ending|last|xx|\*{2,})\s*[-:]?\s*(\d{4})\b/i)?.[1] ??
    hint.match(/\b(\d{4})\b/)?.[1] ??
    '';
  const provider =
    hint
      .replace(
        /\b(my|the|credit|debit|card|account|bank|wallet|upi|ending|last|digits|number|via|from|used)\b/gi,
        ' '
      )
      .replace(/\*+|\b\d{4}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ||
    input.cardNetwork?.trim() ||
    '';
  if (!provider && !identifier) return null;

  const alreadyExists = matchAccountsToHint(input, accounts).length > 0;
  if (alreadyExists) return null;

  const defaults = Object.values(paymentModeAccountDefaults).find((value) => value.type === type);
  const typeLabel =
    type === 'credit_card' ? 'Credit Card' : type === 'bank' ? 'Bank Account' : 'Account';
  const displayProvider = provider || input.cardNetwork?.trim() || '';
  return {
    type,
    name: `${displayProvider || input.mode || 'New'} ${typeLabel}`.trim(),
    color: defaults?.color ?? '#54A0FF',
    provider: displayProvider,
    identifier,
    reason: identifier
      ? `No matching ${displayProvider || input.mode} account ending ${identifier}`
      : `No matching ${displayProvider || input.mode} account`,
  };
};

export class AccountApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiFieldErrors;

  constructor(message: string, status: number, code?: string, fields?: ApiFieldErrors) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const accountFieldLabels: Record<string, string> = {
  type: 'Account type',
  name: 'Account name',
  color: 'Color',
  provider: 'Provider',
  identifier: 'Identifier',
  provider_id: 'Provider',
  last4: 'Last 4 digits',
  upi_handle: 'UPI handle',
  wallet_nickname: 'Wallet nickname',
  account_nickname: 'Account nickname',
  credit_limit: 'Credit limit',
  due_day: 'Due day',
  fee_month: 'Fee month',
  balance: 'Balance',
  is_default: 'Default account',
};

const readAccountError = async (response: Response, fallback: string): Promise<AccountApiError> => {
  const apiError = await readApiError(response, fallback, accountFieldLabels);
  return new AccountApiError(apiError.message, apiError.status, apiError.code, apiError.fields);
};

export const fetchAccounts = async (token: string): Promise<Account[]> => {
  // The same `tz` the dashboard sends, because "this month" has to mean the
  // same month on both tabs — otherwise the two screens disagree about the
  // same account for a few hours either side of a month boundary.
  const query = new URLSearchParams({ tz: getClientTimeZone() });
  const response = await fetch(`${API_BASE_URL}/v1/accounts?${query.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await readAccountError(response, 'Unable to load accounts right now.');
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The accounts response was invalid.');
  }

  return (payload as Account[]).map((account) => ({
    ...account,
    type: normalizeAccountType(account.type),
  }));
};

export const fetchAccountProviders = async (
  token: string,
  type?: AccountType
): Promise<AccountProvider[]> => {
  const query = type ? `?${new URLSearchParams({ type }).toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/v1/account-providers${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readAccountError(response, 'Unable to load account providers right now.');
  }
  const payload: unknown = await response.json();
  return Array.isArray(payload) ? (payload as AccountProvider[]) : [];
};

export const saveAccount = async (token: string, payload: AccountPayload): Promise<Account> => {
  const response = await fetch(`${API_BASE_URL}/v1/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readAccountError(response, 'Unable to save account right now.');
  }

  return response.json();
};

export const updateAccount = async (
  token: string,
  accountId: number,
  payload: AccountPayload
): Promise<Account> => {
  const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readAccountError(response, 'Unable to update account right now.');
  }
  return response.json();
};

export const deleteAccount = async (token: string, accountId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await readAccountError(response, 'Unable to delete account right now.');
  }
};

export const markCardPaidOff = async (token: string, accountId: number): Promise<Account> => {
  const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}/paid-off`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readAccountError(response, 'Unable to mark this card paid off right now.');
  }
  return response.json();
};

export const toAccountPayload = (account: Account): AccountPayload => ({
  type: normalizeAccountType(account.type),
  name: account.name,
  color: account.color,
  provider: account.provider,
  identifier: account.identifier,
  provider_id: account.provider_id,
  last4: account.last4,
  upi_handle: account.upi_handle,
  wallet_nickname: account.wallet_nickname,
  account_nickname: account.account_nickname,
  credit_limit: account.credit_limit,
  due_day: account.due_day,
  // Sent back only when known. The server treats these three as
  // leave-as-is when absent, so an edit that says nothing about a card's
  // billing cycle cannot wipe the statement day it inferred from the
  // user's first bill.
  ...(typeof account.statement_day === 'number' ? { statement_day: account.statement_day } : {}),
  ...(typeof account.reminder_days_before === 'number'
    ? { reminder_days_before: account.reminder_days_before }
    : {}),
  ...(typeof account.reminder_enabled === 'boolean'
    ? { reminder_enabled: account.reminder_enabled }
    : {}),
  ...(typeof account.autopay_enabled === 'boolean'
    ? { autopay_enabled: account.autopay_enabled }
    : {}),
  fee_month: account.fee_month,
  // Leave-as-is when unknown, like the billing-cycle fields above.
  ...(typeof account.annual_fee === 'number' ? { annual_fee: account.annual_fee } : {}),
  ...(typeof account.fee_waiver_spend === 'number'
    ? { fee_waiver_spend: account.fee_waiver_spend }
    : {}),
  balance: account.balance,
  is_default: account.is_default,
});
