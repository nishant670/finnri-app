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
  /**
   * The launch offer on this plan, while it runs. `price_minor` stays the
   * regular price; this is what checkout charges an eligible buyer.
   */
  offer?: PlanOffer | null;
};

export type PlanOffer = {
  code: string;
  label: string;
  percent_off: number;
  price_minor: number;
  original_price_minor: number;
  ends_at: string;
  /** Only present when few spots remain. */
  spots_left?: number | null;
};

/** The offer as it applies to the signed-in user. */
export type LaunchOfferStatus = {
  active: boolean;
  /** False once this user has bought at the launch price. */
  eligible: boolean;
  code: string;
  label: string;
  percent_off: number;
  ends_at?: string;
  spots_left?: number | null;
};

/**
 * The most recent paid pass, once it is over. The server sends it only while
 * nothing is running, so its end is always in the past.
 */
export type PastPass = {
  plan_code: string;
  plan_name: string;
  billing_interval: string;
  period_start: string;
  period_end: string;
  /** "expired" when it ran its course, "refunded" when a refund ended it. */
  ended_by: string;
};

export type BillingStatus = {
  plan?: BillingPlan | null;
  subscription_status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  credits: CreditSummary;
  lifetime_eligibility: LifetimeEligibility;
  /** Present only while no pass runs, and only when one ran before. */
  last_pass?: PastPass | null;
  /** Present while the launch offer runs. */
  launch_offer?: LaunchOfferStatus | null;
};

/**
 * One row of purchase history. Orders opened and never paid are not listed.
 *
 * A partly refunded purchase stays `captured`, with `amount_refunded_minor`
 * above zero; `refunded` means all of it went back.
 */
export type BillingPayment = {
  id: number;
  status: 'captured' | 'refunded' | 'failed' | string;
  plan_code: string;
  plan_name: string;
  billing_interval: string;
  amount_minor: number;
  amount_refunded_minor: number;
  original_amount_minor?: number;
  offer_label?: string;
  currency: string;
  method?: string;
  /** Razorpay's payment id — what its receipt email and support desk quote. */
  reference?: string;
  failure_reason?: string;
  created_at: string;
  captured_at?: string | null;
  refunded_at?: string | null;
  period_start?: string | null;
  period_end?: string | null;
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

export const fetchBillingPayments = async (token: string): Promise<BillingPayment[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/billing/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load your purchases right now.');
  }
  const payload = (await response.json()) as { payments?: BillingPayment[] };
  return payload.payments ?? [];
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

const parseInstant = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Whatever ran out most recently: a paid pass, or the free trial. */
export type EndedAccess =
  | { kind: 'pass'; planName: string; endedAt: string; refunded: boolean }
  | { kind: 'trial'; endedAt: string };

/**
 * What someone has, or last had, as one decision for every screen that says it.
 *
 * Each screen used to work this out for itself from the trial date alone, so
 * the day a bought pass ran out they all said "Free trial ended 16 Sept" — to
 * someone who had paid after that date and was left guessing whether the pass
 * had ever existed. The rule now: a running pass, else a running trial, else
 * whichever of the two ended last.
 */
export type Access =
  | { kind: 'pass'; planName: string; endsAt: string | null; cancelled: boolean }
  | { kind: 'trial'; endsAt: string }
  | { kind: 'ended'; ended: EndedAccess }
  | { kind: 'none' };

export const describeAccess = (
  status: BillingStatus | null | undefined,
  now: Date = new Date()
): Access => {
  if (!status) return { kind: 'none' };
  const periodEnd = parseInstant(status.current_period_end);
  if (
    status.plan &&
    (status.subscription_status === 'active' || status.subscription_status === 'cancelled') &&
    (!periodEnd || periodEnd > now)
  ) {
    return {
      kind: 'pass',
      planName: status.plan.name,
      endsAt: status.current_period_end ?? null,
      cancelled: status.subscription_status === 'cancelled',
    };
  }

  const trialEnd = parseInstant(status.credits?.trial_expires_at);
  if (trialEnd && trialEnd > now) {
    return { kind: 'trial', endsAt: status.credits.trial_expires_at as string };
  }

  const pass = status.last_pass;
  const passEnd = parseInstant(pass?.period_end);
  if (pass && passEnd && passEnd <= now && (!trialEnd || passEnd >= trialEnd)) {
    return {
      kind: 'ended',
      ended: {
        kind: 'pass',
        planName: pass.plan_name,
        endedAt: pass.period_end,
        refunded: pass.ended_by === 'refunded',
      },
    };
  }
  if (trialEnd) {
    return {
      kind: 'ended',
      ended: { kind: 'trial', endedAt: status.credits.trial_expires_at as string },
    };
  }
  return { kind: 'none' };
};

/** "Weekly Pass ended 23 Sept", "Free trial ended 16 Sept". */
export const endedAccessLine = (ended: EndedAccess) => {
  const date = formatCreditDate(ended.endedAt);
  const when = date ? ` ${date}` : '';
  if (ended.kind === 'trial') return `Free trial ended${when}`;
  return `${ended.planName} ${ended.refunded ? 'refunded' : 'ended'}${when}`;
};

/**
 * The offer this user would actually get on this plan, or null. The plan list
 * is public and cannot know who is asking; billing status can, and once the
 * user has used the launch price — or it has sold out — it says so.
 */
export const planOffer = (plan: BillingPlan, status?: BillingStatus | null): PlanOffer | null => {
  if (!plan.offer) return null;
  if (status && (!status.launch_offer?.active || !status.launch_offer.eligible)) return null;
  return plan.offer;
};

export const formatMinor = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(minor / 100);

export const formatPlanPrice = (plan: BillingPlan) => {
  if (plan.billing_interval === 'lifetime_quote') return 'Quote';
  if (plan.price_minor == null || plan.price_minor <= 0) return 'Coming soon';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: plan.currency || 'INR',
    maximumFractionDigits: 0,
  }).format(plan.price_minor / 100);
};
