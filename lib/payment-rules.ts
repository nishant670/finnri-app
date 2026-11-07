import { API_BASE_URL } from './transactions';

/**
 * Which account pays for a new expense the bill or sentence did not name one
 * for. The API answers from the user's own rules first ("fuel" → the SBI BPCL
 * card), then from habit: an account that paid most recent expenses of the
 * same kind. See internal/http/payment_suggestions.go in finnri-api.
 */
export type PaymentSuggestion = {
  account_id: number;
  source: 'rule' | 'habit';
  /** The rule's phrase, or the merchant / family / tag / title the habit is on. */
  label: string;
  rule_id?: number;
  matched: number;
  total: number;
};

/** How the expense can be recognised again: what "Always use … for X?" names. */
export type PaymentSpendKind = { key: string; label: string };

export type PaymentSuggestionResult = {
  suggestion: PaymentSuggestion | null;
  kind: PaymentSpendKind | null;
};

export type PaymentRule = {
  id: number;
  account_id: number;
  phrase: string;
  created_at: string;
  updated_at: string;
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/**
 * Null when the lookup fails: a suggestion that did not load leaves the form
 * as it was, never blocks it.
 */
export const fetchPaymentSuggestion = async (
  token: string | null | undefined,
  draft: { type: string; title: string; merchant: string; tag: string },
  signal?: AbortSignal
): Promise<PaymentSuggestionResult | null> => {
  if (!token) return null;
  const params = new URLSearchParams({
    type: draft.type.trim().toLowerCase() || 'expense',
    title: draft.title.trim(),
    merchant: draft.merchant.trim(),
    tag: draft.tag.trim(),
  });
  try {
    const response = await fetch(`${API_BASE_URL}/v1/payment-suggestion?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<PaymentSuggestionResult>;
    return { suggestion: payload.suggestion ?? null, kind: payload.kind ?? null };
  } catch {
    return null;
  }
};

export const listPaymentRules = async (token: string): Promise<PaymentRule[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/payment-rules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Could not load the rules for this account.');
  const payload = (await response.json()) as { rules?: PaymentRule[] };
  return Array.isArray(payload.rules) ? payload.rules : [];
};

/** Ties a phrase to an account; a phrase already on another account moves. */
export const savePaymentRule = async (
  token: string,
  accountId: number,
  phrase: string
): Promise<PaymentRule> => {
  const response = await fetch(`${API_BASE_URL}/v1/payment-rules`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ account_id: accountId, phrase }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      fields?: Record<string, string>;
    } | null;
    const reason = payload?.fields?.phrase;
    throw new Error(reason ? `The phrase ${reason}.` : 'Could not save that rule.');
  }
  return (await response.json()) as PaymentRule;
};

export const deletePaymentRule = async (token: string, ruleId: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/payment-rules/${ruleId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) throw new Error('Could not remove that rule.');
};

/** The one-line reason shown under "Paid from" when the account was picked for the user. */
export const describePaymentPick = (suggestion: PaymentSuggestion, accountName: string) =>
  suggestion.source === 'rule'
    ? `Your rule: ${suggestion.label} → ${accountName}`
    : `You usually pay ${suggestion.label} with ${accountName} (${suggestion.matched} of ${suggestion.total})`;

/** Ready-made phrases for "Use this card for…", each a family the API knows. */
export const PAYMENT_RULE_PRESETS = ['Fuel', 'Groceries', 'Food delivery', 'Cab rides'] as const;
