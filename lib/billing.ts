import { readApiError } from './api-error';
import { API_BASE_URL } from './transactions';

export type CreditGrant = {
  id: number;
  source: string;
  credits_granted: number;
  credits_remaining: number;
  valid_from: string;
  expires_at?: string | null;
};

export type CreditSummary = {
  total_credits_remaining: number;
  daily_limit: number;
  daily_credits_used: number;
  daily_credits_remaining: number;
  reset_at: string;
  trial_expires_at?: string | null;
  grants?: CreditGrant[];
};

export type LifetimeEligibility = {
  eligible: boolean;
  paid_months_completed: number;
  required_paid_months: number;
};

export type BillingPlan = {
  code: string;
  name: string;
  billing_interval: string;
  price_minor?: number | null;
  currency: string;
  included_credits: number;
  daily_credit_limit: number;
  requires_login: boolean;
  requires_prior_paid_months: number;
  checkout_enabled: boolean;
  feature_gates: string[];
};

export type BillingStatus = {
  plan?: BillingPlan | null;
  subscription_status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  credits: CreditSummary;
  lifetime_eligibility: LifetimeEligibility;
};

export type AIUsageEvent = {
  id: number;
  request_id: string;
  action_code: string;
  input_kind: string;
  status: string;
  estimated_credits: number;
  reserved_credits: number;
  final_credits: number;
  model?: string;
  secondary_model?: string;
  error_code?: string;
  started_at: string;
  finished_at?: string | null;
};

export type AIUsageList = {
  events: AIUsageEvent[];
  page: number;
  page_size: number;
  total: number;
};

const normalizeCreditSummary = (credits: CreditSummary): CreditSummary => ({
  ...credits,
  daily_credits_remaining: Math.min(
    Math.max(0, credits.daily_credits_remaining),
    Math.max(0, credits.total_credits_remaining)
  ),
});

export const fetchBillingPlans = async (): Promise<BillingPlan[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/billing/plans`);
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load plans right now.');
  }
  const payload = (await response.json()) as { plans?: BillingPlan[] };
  return payload.plans ?? [];
};

export const fetchBillingStatus = async (token?: string | null): Promise<BillingStatus> => {
  const response = await fetch(`${API_BASE_URL}/v1/billing/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load billing status right now.');
  }
  const status = (await response.json()) as BillingStatus;
  return { ...status, credits: normalizeCreditSummary(status.credits) };
};

export const fetchAICredits = async (token?: string | null): Promise<CreditSummary> => {
  const response = await fetch(`${API_BASE_URL}/v1/ai/credits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load AI credits right now.');
  }
  return normalizeCreditSummary((await response.json()) as CreditSummary);
};

export const fetchAIUsage = async (
  token?: string | null,
  page = 1,
  pageSize = 20
): Promise<AIUsageList> => {
  const response = await fetch(`${API_BASE_URL}/v1/ai/usage?page=${page}&page_size=${pageSize}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load AI usage right now.');
  }
  return response.json();
};

export type BillingCheckoutOrder = {
  provider: string;
  order_id: string;
  key_id: string;
  amount_minor: number;
  currency: string;
  plan_code: string;
  plan_name: string;
  payment_id: number;
  /**
   * The hosted page that takes the payment. Built by the server, not the app,
   * so the web origin lives in one place and a staging build cannot send
   * somebody to production's checkout. Absent when no origin is configured.
   */
  checkout_url?: string;
  success_url?: string;
};

export const createBillingCheckout = async (
  token: string,
  planCode: string
): Promise<BillingCheckoutOrder> => {
  const response = await fetch(`${API_BASE_URL}/v1/billing/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan_code: planCode }),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Checkout is not available right now.');
  }
  return response.json();
};

/** What the provider has done with one order, as the server last heard it. */
export type CheckoutOrderStatus = 'created' | 'captured' | 'failed' | 'refunded';

/**
 * The state of a checkout order.
 *
 * Unauthenticated on purpose — the page that normally reads it runs in a
 * browser tab with no Finnri session. Knowing an order id only lets someone
 * pay for it.
 *
 * The app uses it to tell two situations apart that otherwise look identical
 * once the browser closes: a payment that went through, and someone who looked
 * at the price and came back.
 */
export const fetchCheckoutOrderStatus = async (
  orderId: string
): Promise<CheckoutOrderStatus | null> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/v1/billing/checkout/${encodeURIComponent(orderId)}`
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { status?: string };
    return (body.status as CheckoutOrderStatus) ?? null;
  } catch {
    // Offline, or the order is not readable. Not knowing is its own answer,
    // and the caller treats it as "say nothing" rather than inventing one.
    return null;
  }
};

export const requestLifetimeQuote = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/v1/billing/lifetime-quote/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to request a lifetime quote right now.');
  }
  return response.json();
};

export const formatCreditDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const formatPlanPrice = (plan: BillingPlan) => {
  if (plan.billing_interval === 'lifetime_quote') return 'Quote';
  if (plan.price_minor == null || plan.price_minor <= 0) return 'Coming soon';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: plan.currency || 'INR',
    maximumFractionDigits: 0,
  }).format(plan.price_minor / 100);
};
