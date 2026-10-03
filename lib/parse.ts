import { getClientTimeZone } from './datetime';
import { API_BASE_URL } from './transactions';

/**
 * What the parse channel came back with.
 *
 * The channel now carries both directions — a capture and a question — and
 * `stage` is the only thing that tells them apart. Everything downstream
 * branches on it: a `ParseAnswer` must never reach the transaction form, and a
 * `ParseDraft` must never reach the answer card.
 */
export type ParseResult = ParseDraft | ParseAnswer;

export type ParseAnswerStatus = 'answered' | 'no_data' | 'unsupported';

export type ParseAnswerMetric =
  | 'spend_total'
  | 'income_total'
  | 'net'
  | 'count'
  | 'average'
  | 'largest'
  | 'breakdown'
  | 'unsupported';

export type ParseAnswerSlice = {
  label: string;
  amount: number;
  transaction_count: number;
  percentage: number;
};

export type LedgerAnswer = {
  status: ParseAnswerStatus;
  metric: ParseAnswerMetric;
  /**
   * Major units, or null for a count and for anything that is not `answered`.
   * The server never formats money — `formatMoney` does, here.
   */
  amount: number | null;
  currency: string;
  transaction_count: number;
  subject: string;
  entry_type?: 'expense' | 'income';
  period: {
    kind: string;
    /** The window in words, shown beside the number so the scope is never implicit. */
    label: string;
    start_date?: string;
    end_date?: string;
  };
  group_by?: 'category' | 'merchant' | 'month' | 'none';
  breakdown: ParseAnswerSlice[];
  largest_entry?: {
    entry_id: number;
    title: string;
    merchant: string;
    category: string;
    amount: number;
    date: string;
  };
  reason?: string;
  /** Server-authored. Shown as written; the model does not write user-facing prose here. */
  message?: string;
  suggestions: string[];
  /**
   * The `GET /v1/entries` parameters the figures were computed over. Handed
   * straight to the transaction list, so the rows behind the answer are the
   * rows it counted.
   */
  filters: Record<string, string>;
};

export type ParseAnswer = {
  stage: 'answer';
  intent: 'question';
  source_text: string | null;
  answer: LedgerAnswer;
  credits_charged?: number;
  credits_remaining_today?: number;
  credits_remaining_total?: number;
  plan_code?: string;
};

export const isParseAnswer = (result: ParseResult): result is ParseAnswer =>
  (result as ParseAnswer).stage === 'answer';

/**
 * A guess at whether typed text is a question, used for **one** thing: deciding
 * whether to open the draft review sheet before the response arrives.
 *
 * The capture sheet opens optimistically so the wait has somewhere to happen,
 * which is right for a capture and wrong for a question — a sheet that appears
 * and then withdraws to reveal an answer reads as a glitch. This lets an
 * obvious question wait behind an inline indicator instead.
 *
 * It has no authority over anything else. The server classifies the intent, and
 * a wrong guess here costs a slightly later sheet or a slightly earlier one —
 * never a draft that is not shown or an answer treated as a transaction.
 */
const questionOpeners =
  /^(how|what|what's|whats|where|when|which|who|why|do i|did i|am i|was i|have i|has|is my|are my|show|show me|tell me|list|give me|kitna|kitne|kahan|kaha)\b/i;

/**
 * Words that can only be asking about records that already exist.
 *
 * None of these describes money moving. "Spent" is the one that looks like it
 * does, and it is here because "spent 250 on food" carries an amount and is
 * excluded by the digit test below — while "food spent" carries none and is
 * plainly a question.
 */
const ledgerMetricWords =
  /\b(spend|spends|spending|spent|expense|expenses|income|earned|total|totals|breakdown|summary|biggest|largest|highest|average|kharch|kharcha)\b/i;

/**
 * A number is the difference between "today spend 250" and "today spend".
 *
 * Money that moved has an amount, so a digit is the single strongest capture
 * signal there is — strong enough to outrank every word in the sentence.
 * Period names that contain their own digits are removed before the test, so
 * "spend last 30 days" is not read as an amount.
 */
const digitBearingPeriods = /\blast\s+(7|30|90)\s+days\b/gi;

export const looksLikeQuestion = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('?')) return true;
  if (questionOpeners.test(trimmed)) return true;

  /*
   * The telegraphic form: "today spend", "food spends", "biggest expense".
   *
   * People type into this field the way they type into a search box — no verb,
   * no question mark — and the old rule read every one of those as a capture,
   * so asking Finnri for a number opened a transaction form instead. A
   * spending word with no amount anywhere in the sentence is not a capture,
   * because there is nothing to capture.
   */
  const withoutPeriodDigits = trimmed.replace(digitBearingPeriods, ' ');
  if (/\d/.test(withoutPeriodDigits)) return false;
  return ledgerMetricWords.test(withoutPeriodDigits);
};

export type ParseDraft = {
  stage?: string;
  type: string | null;
  title: string | null;
  time: string | null;
  amount: number | null;
  refundable_amount?: number | null;
  refund_expected_on?: string | null;
  /** A refund the user says already came back; a separate income, not a Refundable tag. */
  refund_received?: { amount: number; date?: string | null } | null;
  emi_tenure_months?: number | null;
  emi_rate_pct?: number | null;
  currency: string | null;
  mode: string | null;
  card_network: string | null;
  account_hint: string | null;
  category: string | null;
  merchant: string | null;
  tag: string | null;
  tags?: string[];
  note: string | null;
  date: string | null;
  source_text: string | null;
  recurring_candidate?: boolean | null;
  subscription_candidate?: {
    name?: string | null;
    merchant?: string | null;
    category?: string | null;
    amount?: number | null;
    billing_interval?:
      | 'daily'
      | 'business_daily'
      | 'weekly'
      | 'biweekly'
      | 'monthly'
      | 'quarterly'
      | 'yearly'
      | null;
    next_due_date?: string | null;
    last_charged_date?: string | null;
    reminder_days?: number | null;
    cancel_before_due?: boolean | null;
    cancel_on_date?: string | null;
    autopay?: boolean | null;
    payment_mode?: string | null;
    notes?: string | null;
    missing_fields?: string[];
  } | null;
  split_candidate?: boolean | null;
  split_candidate_details?: {
    group_name?: string | null;
    participants?: Array<{
      friend_name?: string | null;
      share_amount?: number | null;
      direction?: 'friend_owes_user' | 'user_owes_friend';
    }>;
    missing_fields?: string[];
  } | null;
  confidence?: Record<string, number>;
  needs_confirmation?: Record<string, boolean>;
  missing_fields?: string[];
  clarifications?: string[];
  credits_charged?: number;
  credits_remaining_today?: number;
  credits_remaining_total?: number;
  plan_code?: string;
};

/** The draft shape, under the name the app has always used for it. */
export type ParseResponse = ParseDraft;

export type ParseDraftInput = {
  token?: string | null;
  hintText?: string;
  audio?: {
    file: Blob;
    name: string;
  };
  tz?: string;
};

type ParseErrorPayload = {
  error?: string;
  message?: string;
  details?: string[];
  transcript?: string;
  required_credits?: number;
  available_credits?: number;
  daily_limit_remaining?: number;
  daily_limit?: number;
  used_today?: number;
  reset_at?: string;
  upgrade_required?: boolean;
};

const parseErrorMessages: Record<string, string> = {
  insufficient_ai_credits: 'Not enough Finnri AI credits for this capture.',
  daily_ai_limit_reached: 'You have reached today’s Finnri AI credit limit.',
  feature_locked: 'This AI feature needs an active plan.',
  guest_not_allowed: 'Create an account to use this AI feature.',
  non_transactional_prompt:
    'Tell Finnri about an expense, income, bill, split, subscription, or payment to add.',
  could_not_parse: 'Finnri could not read that just now. Try again in a moment.',
  schema_invalid:
    'I could not turn that into a clean transaction. Try again with the amount, merchant, and payment method.',
};

export class ParseApiError extends Error {
  status: number;
  code?: string;
  /** What the server heard, when it says. Shown back so a misheard word is visible. */
  transcript?: string | null;
  /** Schema complaints. Never shown — carried for logging and bug reports. */
  details?: string[];
  requiredCredits?: number;
  availableCredits?: number;
  dailyLimitRemaining?: number;
  dailyLimit?: number;
  usedToday?: number;
  resetAt?: string;
  upgradeRequired?: boolean;

  constructor(payload: ParseErrorPayload, status: number, fallback: string) {
    const code = payload.error;
    super((code && parseErrorMessages[code]) || payload.message || code || fallback);
    this.name = 'ParseApiError';
    this.status = status;
    this.code = code;
    this.transcript = payload.transcript ?? null;
    this.details = payload.details;
    this.requiredCredits = payload.required_credits;
    this.availableCredits = payload.available_credits;
    this.dailyLimitRemaining = payload.daily_limit_remaining;
    this.dailyLimit = payload.daily_limit;
    this.usedToday = payload.used_today;
    this.resetAt = payload.reset_at;
    this.upgradeRequired = payload.upgrade_required;
  }
}

/**
 * What a failed capture says, and what the user can do about it.
 *
 * A parse failure used to arrive as one red sentence with no way forward: it
 * named no cause, offered no action, and left the recording sitting under a
 * button still labelled "Process" — the same button that had just failed. The
 * three things a person needs after a capture fails are the reason, a sentence
 * that would work instead, and one press to try again, so the failure carries
 * all three.
 *
 * `canRetry` is the honest part. Sending the same words again is worth doing
 * when the parser stumbled or the model produced something unusable — those are
 * not deterministic. It is not worth doing when the sentence itself is the
 * problem, and offering a retry there would just spend another credit to reach
 * the same place.
 */
export type ParseFailure = {
  code?: string;
  title: string;
  message: string;
  /** Rewrites of the same intent that do parse. Tappable — they fill the field. */
  examples: string[];
  /** True when re-sending the same input unchanged is worth a credit. */
  canRetry: boolean;
  /** What the server heard, when it told us. */
  heard?: string | null;
};

type ParseFailureCopy = Omit<ParseFailure, 'code' | 'heard'>;

const genericParseFailure: ParseFailureCopy = {
  title: 'That capture did not go through',
  message: 'Something failed between here and Finnri. Try it again in a moment.',
  examples: [],
  canRetry: true,
};

const parseFailureCopy: Record<string, ParseFailureCopy> = {
  // The model answered, but not with a transaction this app can hold. The
  // sentence is usually fine — it is the shape of the reply that broke — so a
  // straight retry genuinely often works.
  schema_invalid: {
    title: 'I heard it, but could not shape it',
    message:
      'The words came through; the transaction did not. Try again, or say it as one line: the amount, what it was for, and how you paid.',
    examples: [
      'Paid 10000 advance rent to landlord by UPI',
      'Paid 10000 rent by UPI, split with the bubu-dudu group',
    ],
    canRetry: true,
  },
  could_not_parse: {
    title: 'Finnri could not read that',
    message: 'The parser did not answer this time. This one is usually temporary.',
    examples: [],
    canRetry: true,
  },
  invalid_parse_response: {
    title: 'Finnri could not read that',
    message: 'The parser answered with something unusable. Sending it again usually clears it.',
    examples: [],
    canRetry: true,
  },
  non_transactional_prompt: {
    title: 'There is no money in that sentence',
    message:
      'Tell me about money that moved — an expense, income, a bill, a split, a subscription — and I will file it.',
    examples: ['Spent 250 on coffee via UPI', 'Got 2000 from freelance work'],
    canRetry: false,
  },
  transcription_failed: {
    title: 'I could not hear that clearly',
    message: 'The recording did not come through. Record again somewhere quieter, or type it.',
    examples: [],
    canRetry: true,
  },
  transcript_too_long: {
    title: 'That was a long one',
    message: 'Keep it to a sentence or two — one transaction at a time.',
    examples: [],
    canRetry: false,
  },
  audio_too_long_for_ai: {
    title: 'That recording was too long',
    message: 'Record a shorter clip — a sentence is plenty.',
    examples: [],
    canRetry: false,
  },
  empty_audio: {
    title: 'Nothing was recorded',
    message: 'The clip came through empty. Record again, or type the entry instead.',
    examples: [],
    canRetry: false,
  },
  guest_not_allowed: {
    title: 'Create an account to use this',
    message: 'AI capture needs an account. Everything you have added so far comes with you.',
    examples: [],
    canRetry: false,
  },
  feature_locked: {
    title: 'This needs an active plan',
    message: 'AI capture is part of a paid plan. You can still add the entry by hand.',
    examples: [],
    canRetry: false,
  },
};

/** True for the errors the credit UI on Home already owns. */
export const isCreditParseError = (error: unknown) =>
  error instanceof ParseApiError &&
  (error.code === 'insufficient_ai_credits' || error.code === 'daily_ai_limit_reached');

export const describeParseFailure = (error: unknown): ParseFailure => {
  if (error instanceof ParseApiError) {
    const copy = (error.code && parseFailureCopy[error.code]) || {
      ...genericParseFailure,
      // An unmapped code still carries the server's own sentence, which beats
      // a house-written guess at what went wrong.
      message: error.message || genericParseFailure.message,
    };
    return { ...copy, code: error.code, heard: error.transcript };
  }
  // No status, no payload: the request never got an answer.
  return {
    ...genericParseFailure,
    title: 'Could not reach Finnri',
    message: 'Check your connection and try again — nothing was lost.',
  };
};

const readParseError = async (response: Response) => {
  const fallback = 'Unable to parse the entry right now.';
  try {
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as ParseErrorPayload) : {};
    return new ParseApiError(payload, response.status, fallback);
  } catch {
    return new ParseApiError({}, response.status, fallback);
  }
};

export const parseEntryDraft = async ({
  token,
  hintText,
  audio,
  tz = getClientTimeZone(),
}: ParseDraftInput): Promise<ParseResult> => {
  const formData = new FormData();
  const trimmedHint = hintText?.trim() ?? '';
  if (trimmedHint) {
    formData.append('hint_text', trimmedHint);
  }
  if (audio) {
    formData.append('audio', audio.file, audio.name);
  }
  formData.append('tz', tz);

  const response = await fetch(`${API_BASE_URL}/v1/parse`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!response.ok) {
    throw await readParseError(response);
  }
  return response.json();
};
