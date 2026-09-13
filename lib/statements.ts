import { File } from 'expo-file-system';

import { API_BASE_URL } from './transactions';
import { ApiFieldErrors, readApiError } from './api-error';
import { calendarDay } from './statement-dates';

/**
 * Credit card statements — the bank's side of a card, alongside the ledger.
 *
 * The split that governs every type in here: the **statement is authoritative
 * for money** (what is owed, what is left to pay, how much limit is free), and
 * the **ledger is authoritative for detail** (which categories, which
 * merchants). When they disagree, the bill is right about the amount and
 * Finnri is simply missing some transactions.
 *
 * See `internal/http/card_statements.go` for the server side.
 */

/**
 * `draft` is a placeholder the reminder job opens on the statement day, before
 * the user has told us the amount. It is not a zero bill — a card with a draft
 * still reports its outstanding from the ledger.
 *
 * `overdue` is deliberately not a status: it depends on today's date, so the
 * server derives it per request as `is_overdue`.
 */
export type StatementStatus = 'draft' | 'unpaid' | 'partial' | 'paid';

/** Whether the ledger can account for the bill. */
export type ReconciliationState = 'balanced' | 'under' | 'over';

export type StatementReconciliation = {
  cycle_start: string;
  cycle_end: string;
  /** Net spend on the card inside the cycle, excluding the unitemized entry. */
  itemized_total: number;
  entries_count: number;
  /** Unpaid remainder of the previous bill, which the issuer rolled into this one. */
  previous_unpaid: number;
  statement_total: number;
  /**
   * Billed but not explained by the ledger. Held as a real expense entry, so
   * the user's monthly spending total stays right while the breakdown is
   * still incomplete.
   */
  unitemized_amount: number;
  /** Signed. Positive when the bank knows more than Finnri does. */
  gap: number;
  state: ReconciliationState;
};

export type StatementPayment = {
  id: number;
  statement_id: number;
  account_id: number;
  /** The bank account the money left, when the user said which. */
  from_account_id?: number | null;
  bank_entry_id?: number | null;
  amount: number;
  paid_on: string;
  method?: string;
  note?: string;
  created_at?: string;
};

export type CardStatement = {
  id: number;
  account_id: number;
  /** Inclusive window this bill covers. `cycle_end` is the statement date. */
  cycle_start: string;
  cycle_end: string;
  statement_date: string;
  due_date: string;
  total_due: number;
  minimum_due: number;
  paid_amount: number;
  /** Floored at zero, so an overpaid bill reads as settled. */
  remaining_due: number;
  currency: string;
  status: StatementStatus;
  is_overdue: boolean;
  /** Negative once the due date has passed. */
  days_to_due: number;
  source: 'manual' | 'sms' | 'email';
  unitemized_entry_id?: number | null;
  notes?: string;
  /** Absent on list endpoints, which do not reconcile every row. */
  reconciliation?: StatementReconciliation;
  payments: StatementPayment[];
  created_at?: string;
  updated_at?: string;
};

export type CardStatementPayload = {
  statement_date: string;
  /** Derived from the card's due day when omitted. */
  due_date?: string;
  total_due: number;
  minimum_due?: number;
  notes?: string;
};

export type StatementPaymentPayload = {
  amount: number;
  /** Defaults to today. */
  paid_on?: string;
  method?: string;
  from_account_id?: number | null;
  note?: string;
};

export class StatementApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiFieldErrors;

  constructor(message: string, status: number, code?: string, fields?: ApiFieldErrors) {
    super(message);
    this.name = 'StatementApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const statementFieldLabels: Record<string, string> = {
  statement_date: 'Statement date',
  due_date: 'Due date',
  total_due: 'Total due',
  minimum_due: 'Minimum due',
  currency: 'Currency',
  source: 'Source',
  amount: 'Amount',
  paid_on: 'Payment date',
  method: 'Payment method',
  from_account_id: 'Paid from',
};

const readStatementError = async (
  response: Response,
  fallback: string
): Promise<StatementApiError> => {
  const apiError = await readApiError(response, fallback, statementFieldLabels);
  return new StatementApiError(apiError.message, apiError.status, apiError.code, apiError.fields);
};

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/** One card's billing history, newest first. */
export const fetchCardStatements = async (
  token: string,
  accountId: number
): Promise<CardStatement[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}/statements`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to load statements right now.');
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('The statements response was invalid.');
  }
  return payload as CardStatement[];
};

/**
 * Create or correct the bill for one statement date.
 *
 * The server upserts on (account, statement_date), so re-submitting the same
 * month corrects it rather than adding a second bill — which is also what
 * makes this safe to call from a retry.
 */
export const saveCardStatement = async (
  token: string,
  accountId: number,
  payload: CardStatementPayload
): Promise<CardStatement> => {
  const response = await fetch(`${API_BASE_URL}/v1/accounts/${accountId}/statements`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to save this statement right now.');
  }
  return response.json();
};

/** One bill, with its payments and a freshly computed reconciliation. */
export const fetchStatement = async (
  token: string,
  statementId: number
): Promise<CardStatement> => {
  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to load this statement right now.');
  }
  return response.json();
};

export const deleteStatement = async (token: string, statementId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to delete this statement right now.');
  }
};

/**
 * Log a payment the user made in their bank's app. Finnri never moves money;
 * partial payments are simply repeated calls.
 */
export const recordStatementPayment = async (
  token: string,
  statementId: number,
  payload: StatementPaymentPayload
): Promise<CardStatement> => {
  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}/payments`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to record this payment right now.');
  }
  return response.json();
};

export const deleteStatementPayment = async (
  token: string,
  statementId: number,
  paymentId: number
): Promise<CardStatement> => {
  const response = await fetch(
    `${API_BASE_URL}/v1/statements/${statementId}/payments/${paymentId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to remove this payment right now.');
  }
  return response.json();
};

/** Every unsettled bill across every card, soonest due first. */
export const fetchUpcomingStatements = async (token: string): Promise<CardStatement[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/statements/upcoming`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to load upcoming bills right now.');
  }
  const payload: unknown = await response.json();
  return Array.isArray(payload) ? (payload as CardStatement[]) : [];
};

/* ------------------------------------------------------------------ *
 * Display helpers
 * ------------------------------------------------------------------ */

/** "Due in 7 days", "Due today", "5 days overdue". */
export const formatDueLabel = (statement: { days_to_due: number; is_overdue: boolean }): string => {
  if (statement.is_overdue) {
    const late = Math.abs(statement.days_to_due);
    if (late === 0) return 'Overdue';
    return `${late} day${late === 1 ? '' : 's'} overdue`;
  }
  if (statement.days_to_due === 0) return 'Due today';
  if (statement.days_to_due === 1) return 'Due tomorrow';
  if (statement.days_to_due < 0) return 'Due';
  return `Due in ${statement.days_to_due} days`;
};

/** "6 Jul – 5 Aug" for a cycle window. */
export const formatCycleRange = (start: string, end: string): string => {
  const format = (value: string) => {
    // Through `calendarDay` first. A date that reached the app as an RFC3339
    // timestamp made this concatenation `…T00:00:00ZT00:00:00`, which parses to
    // NaN — so the fallback fired and the banner read the raw timestamp back at
    // the user: "2026-08-13T00:00:00Z – 2026-09-12T00:00:00Z".
    const parsed = new Date(`${calendarDay(value)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  return `${format(start)} – ${format(end)}`;
};

/** "August 2026" — how a statement names itself in a history list. */
export const formatStatementMonth = (statementDate: string): string => {
  const parsed = new Date(`${calendarDay(statementDate)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return statementDate;
  return parsed.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export const statementStatusLabels: Record<StatementStatus, string> = {
  draft: 'Amount needed',
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
};

/* ------------------------------------------------------------------ *
 * Reading a statement: the diff
 * ------------------------------------------------------------------ */

/**
 * What a row on the statement turned out to be.
 *
 * `payment` matters most. Finnri tracks bill payments on the statement, never
 * as card entries — the card's outstanding comes from the statement, not from
 * ledger arithmetic. So a payment row is shown but can never be imported;
 * importing one would reduce the outstanding a second time.
 */
export type StatementLineKind = 'spend' | 'refund' | 'payment' | 'fee' | 'interest' | 'emi';

export type StatementLine = {
  date: string;
  description: string;
  /** Always positive. Direction comes from `type`. */
  amount: number;
  type: 'expense' | 'income';
  kind?: StatementLineKind;
};

export type StatementDiffEntry = {
  entry_id: number;
  date: string;
  title: string;
  merchant?: string;
  category?: string;
  amount: number;
  type: string;
  tag?: string;
};

export type StatementDiff = {
  matched: {
    line: StatementLine;
    entry: StatementDiffEntry;
    /** Days between the statement line and the entry it matched. */
    day_gap: number;
    /** Description overlap, 0..1. A tie-breaker only — low is normal. */
    similarity: number;
  }[];
  /** On the statement, not in Finnri. These are what importing adds. */
  missing: StatementLine[];
  /** In Finnri, not billed. Shown for review — never auto-deleted. */
  extra: StatementDiffEntry[];
  /** Real, but never importable as card entries. */
  ignored: StatementLine[];
  summary: {
    statement_lines: number;
    matched_count: number;
    missing_count: number;
    extra_count: number;
    ignored_count: number;
    missing_amount: number;
    extra_amount: number;
  };
  /** Present for screenshot intake. It is advisory and never blocks review/import. */
  checksum?: {
    parsed_debits: number;
    parsed_credits: number;
    parsed_net: number;
    expected_net: number;
    difference: number;
    matches: boolean;
    message: string;
  };
  source?: 'screenshots_ai';
  credits_charged?: number;
  credits_remaining_today?: number;
  credits_remaining_total?: number;
};

/** Compare already-parsed lines against the ledger. Nothing is stored. */
export const diffStatementLines = async (
  token: string,
  statementId: number,
  lines: StatementLine[]
): Promise<StatementDiff> => {
  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}/diff`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ lines }),
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to compare this statement right now.');
  }
  return response.json();
};

/**
 * Upload a statement PDF and get the diff back.
 *
 * The password is sent for this one request and is never stored — not on the
 * device and not on the server. There is deliberately no "remember it" option:
 * a saved statement password is a saved credential, and the whole month's
 * spending sits behind it.
 *
 * No explicit Content-Type: the multipart boundary is filled in for us, and
 * setting the header by hand drops it and makes the request unparseable. The
 * part is a `File` for the reason spelled out in `lib/uploads.ts` — the
 * `{ uri, name, type }` shape is not a part Expo's fetch knows how to send.
 */
export const uploadStatementPDF = async (
  token: string,
  statementId: number,
  file: { uri: string; name: string },
  password?: string
): Promise<StatementDiff> => {
  const body = new FormData();
  body.append('file', new File(file.uri) as unknown as Blob);
  if (password) {
    body.append('password', password);
  }

  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to read that statement right now.');
  }
  return response.json();
};

export type StatementScreenshotFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

/**
 * Read a batch of cropped statement screenshots and return the same diff used
 * by PDF intake. The images go directly to the request body and are not added
 * to Finnri's receipt uploads or retained by this module.
 */
export const uploadStatementScreenshots = async (
  token: string,
  statementId: number,
  files: StatementScreenshotFile[]
): Promise<StatementDiff> => {
  const body = new FormData();
  files.forEach((file) => {
    body.append('images', new File(file.uri) as unknown as Blob);
  });

  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}/screenshots`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to read those screenshots right now.');
  }
  return response.json();
};

/** Create entries for the lines the user picked. Safe to retry. */
export const importStatementLines = async (
  token: string,
  statementId: number,
  lines: StatementLine[]
): Promise<{ imported: number; reconciliation: StatementReconciliation }> => {
  const response = await fetch(`${API_BASE_URL}/v1/statements/${statementId}/import`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ lines }),
  });
  if (!response.ok) {
    throw await readStatementError(response, 'Unable to import these transactions right now.');
  }
  return response.json();
};

export const statementLineKindLabels: Record<StatementLineKind, string> = {
  spend: 'Purchase',
  refund: 'Refund',
  payment: 'Bill payment',
  fee: 'Fee',
  interest: 'Interest',
  emi: 'EMI instalment',
};

/**
 * Maps the server's upload error codes to something a person can act on.
 * `statement_password_required` is a prompt, not a failure.
 */
export const statementUploadErrorMessage = (code?: string): string => {
  switch (code) {
    case 'statement_password_required':
      return 'This statement is password protected. Enter its password to open it.';
    case 'statement_password_incorrect':
      return "That password didn't open the file. Check your bank's format and try again.";
    case 'invalid_statement_pdf':
      return 'That file is not a PDF Finnri can read.';
    case 'no_transactions_found':
      return "Finnri couldn't find any transactions in that file. You can still add them by hand.";
    case 'statement_unreadable':
      return 'That statement could not be read. It may be a scan rather than a text PDF.';
    case 'unsupported_statement_image':
      return 'Use JPEG, PNG or WebP screenshots.';
    case 'too_many_statement_images':
      return 'Choose up to 8 statement screenshots at a time.';
    case 'statement_images_too_large':
    case 'request_body_too_large':
      return 'Those screenshots are too large. Crop them more tightly or upload fewer pages.';
    case 'statement_image_parse_failed':
      return 'The AI service could not read those screenshots. Try clearer, tightly cropped images.';
    case 'feature_locked':
    case 'insufficient_ai_credits':
      return 'Screenshot reading needs an eligible AI plan and enough credits. PDF reading remains available.';
    default:
      return 'Unable to read that statement right now.';
  }
};
