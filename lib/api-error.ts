export type ApiFieldErrors = Record<string, string>;

type ApiErrorPayload = {
  error?: string;
  message?: string;
  fields?: ApiFieldErrors;
  feature_code?: string;
  feature_label?: string;
  required_plan?: string;
  required_entitlement?: string;
  upgrade_required?: boolean;
};

/**
 * An entitlement response is not a failure. The backend answers a gated
 * endpoint with `402 payment_required` (or `403 feature_locked`) plus enough
 * detail to build a paywall: which feature was asked for, what it is called,
 * and whether paying unlocks it. Screens read this off `ApiError.entitlement`
 * and render `<UpgradeSheet />` instead of an error.
 *
 * Emitted by `ensureEntitlement` in the backend's `internal/http/entitlements.go`.
 */
export type Entitlement = {
  featureCode?: string;
  featureLabel: string;
  requiredPlan?: string;
  upgradeRequired: boolean;
};

const entitlementCodes = new Set(['payment_required', 'feature_locked']);

/** Fallback labels for the rare case the backend omits `feature_label`. */
const entitlementFeatureLabels: Record<string, string> = {
  ai_text_capture: 'AI text capture',
  ai_voice_capture: 'Voice capture',
  advanced_insights: 'Advanced insights',
  weekly_review: 'Weekly review',
  budgets: 'Budgets',
  subscription_reminders: 'Subscription reminders',
  split_ledger: 'Split ledger',
  web_dashboard: 'Web dashboard',
  exports: 'Exports',
  bulk_edit: 'Bulk edit',
  future_ai_advisor: 'AI advisor',
};

const readEntitlement = (
  status: number,
  payload: ApiErrorPayload | null,
): Entitlement | null => {
  if (status !== 402 && status !== 403) {
    return null;
  }
  const code = payload?.error;
  const featureCode = payload?.feature_code ?? payload?.required_entitlement;
  if (!code || !entitlementCodes.has(code)) {
    return null;
  }
  // Naming the feature is what separates an entitlement gate from the AI
  // credit 402s, which are about a spent allowance rather than a locked
  // feature and keep their own handling in `lib/parse.ts`.
  if (!featureCode && !payload?.feature_label) {
    return null;
  }
  const featureLabel =
    payload?.feature_label ||
    (featureCode ? entitlementFeatureLabels[featureCode] : undefined) ||
    'This feature';
  return {
    featureCode,
    featureLabel,
    requiredPlan: payload?.required_plan,
    // `feature_locked` omits the flag; the plan is still the way through.
    upgradeRequired: payload?.upgrade_required ?? true,
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: ApiFieldErrors;
  entitlement?: Entitlement;

  constructor(
    message: string,
    status: number,
    code?: string,
    fields?: ApiFieldErrors,
    entitlement?: Entitlement,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.entitlement = entitlement;
  }
}

/**
 * The entitlement behind an error, or null when it is a genuine failure.
 * Anything that renders an error message should check this first — an
 * entitlement response must never reach a red banner.
 */
export const entitlementFromError = (error: unknown): Entitlement | null =>
  error instanceof ApiError ? error.entitlement ?? null : null;

/** Exported so the auth layer can swap in its own wording by reference, not by copy. */
export const NETWORK_ERROR_MESSAGE =
  "Can't reach Finnri right now. Check your internet connection and try again.";

const rawNetworkPatterns = [
  /fetch failed/i,
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /connectexception/i,
  /failed to connect/i,
  /connection refused/i,
  /timed out/i,
  /timeout/i,
  /network is unreachable/i,
  /internet connection appears to be offline/i,
  /could not connect to the server/i,
];

const codeMessages: Record<string, string> = {
  invalid_json: "Something in the form didn't come through. Check your details and try again.",
  invalid_entry: 'Please fix the highlighted transaction details.',
  invalid_account: 'Please fix the highlighted account details.',
  invalid_filters: 'Please adjust the filters and try again.',
  unauthorized: 'Your session expired. Please sign in again.',
  authorization_header_missing: 'Your session expired. Please sign in again.',
  authorization_header_invalid: 'Your session expired. Please sign in again.',
  invalid_token: 'Your session expired. Please sign in again.',
  invalid_or_expired_session: 'Your session expired. Please sign in again.',
  account_in_use: 'Move or delete linked transactions before deleting this account.',
  last_account: 'Create another account before deleting your only account.',
  statement_date_taken: 'This card already has a statement on that date.',
  statement_date_out_of_order: 'That date is past another statement on this card. Pick a date between its neighbours.',
};

/**
 * A field path the backend names, turned into something a person can act on.
 *
 * Server field names are paths, not labels: `split.participants[0].friend_id`.
 * Title-casing one whole produced **"Split.Participants[0].Friend must belong
 * to the current user"** under a Save button — three lines of it at once, in
 * the shape of a stack trace, about people the user could see on screen.
 *
 * So the path is read rather than decorated. The last segment is the thing the
 * message is actually about; the segments in front of it are context worth at
 * most a short prefix; and an index is a position in a list the user filled in,
 * which means it counts from one, not zero.
 */
const humanizeField = (field: string) => {
  const segments = field.split('.').filter(Boolean);
  const last = segments[segments.length - 1] ?? field;

  // `participants[0]` — the index belongs to the row, not to the leaf.
  const indexed = /^(.*)\[(\d+)\]$/.exec(segments[segments.length - 2] ?? '');
  const word = (value: string) =>
    value
      .replace(/\[\d+\]$/, '')
      .replace(/_id$/, '')
      .replaceAll('_', ' ')
      .trim();

  const leaf = word(last);
  const titled = leaf.replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (!indexed) {
    return titled || field;
  }
  const position = Number(indexed[2]) + 1;
  const container = word(indexed[1]).replace(/s$/, '');
  return `${container.replace(/\b\w/g, (letter) => letter.toUpperCase())} ${position} ${leaf}`;
};

const humanizeCode = (code: string) =>
  code.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase());

const ensurePunctuation = (value: string) => /[.!?]$/.test(value) ? value : `${value}.`;

const tryReadPayloadMessage = (message: string) => {
  try {
    const payload = JSON.parse(message) as ApiErrorPayload;
    return payload.message || (payload.error ? codeMessages[payload.error] ?? humanizeCode(payload.error) : null);
  } catch {
    return null;
  }
};

export const getFriendlyErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Try again in a moment.',
) => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const message = rawMessage.trim();
  if (!message) {
    return fallback;
  }

  if (rawNetworkPatterns.some((pattern) => pattern.test(message))) {
    return NETWORK_ERROR_MESSAGE;
  }

  const payloadMessage = tryReadPayloadMessage(message);
  if (payloadMessage) {
    return payloadMessage;
  }

  if (/^https?:\/\//i.test(message) || /\/\d{1,3}(?:\.\d{1,3}){3}:\d+/.test(message)) {
    return NETWORK_ERROR_MESSAGE;
  }

  return message;
};

/**
 * The label for a field, allowing a caller's map to match on the leaf.
 *
 * A caller cannot enumerate `split.participants[0].friend_id`,
 * `[1]`, `[2]` and so on, so an exact-match-only lookup meant every indexed
 * field fell through to the generated label no matter how carefully the caller
 * had named things.
 */
const fieldLabel = (field: string, labels: Record<string, string>) => {
  if (labels[field]) return labels[field];
  const leaf = field.split('.').pop() ?? field;
  if (labels[leaf]) return labels[leaf];
  return humanizeField(field);
};

export const formatApiFieldErrors = (
  fields: ApiFieldErrors,
  labels: Record<string, string> = {},
) => Object.entries(fields)
  .map(([field, message]) => {
    const label = fieldLabel(field, labels);
    return ensurePunctuation(`${label} ${message}`);
  });

export const readApiError = async (
  response: Response,
  fallback: string,
  labels: Record<string, string> = {},
): Promise<ApiError> => {
  let payload: ApiErrorPayload | null = null;
  try {
    const text = await response.text();
    payload = text ? JSON.parse(text) as ApiErrorPayload : null;
  } catch {
    payload = null;
  }

  const code = payload?.error;
  const fields = payload?.fields;
  const entitlement = readEntitlement(response.status, payload);
  const fieldMessages = fields ? formatApiFieldErrors(fields, labels) : [];
  const baseMessage =
    payload?.message ||
    // An entitlement is described by the paywall, not by an error string. This
    // message is only a last-resort label if something renders it anyway.
    (entitlement ? `${entitlement.featureLabel} is on the paid plan.` : null) ||
    (code ? codeMessages[code] ?? humanizeCode(code) : null) ||
    fallback;
  const message = fieldMessages.length > 0
    ? `${baseMessage}\n${fieldMessages.map((fieldMessage) => `• ${fieldMessage}`).join('\n')}`
    : baseMessage;

  return new ApiError(message, response.status, code, fields, entitlement ?? undefined);
};
