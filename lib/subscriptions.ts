import { API_BASE_URL } from './transactions';

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type BillingInterval =
  'daily' | 'business_daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export type Subscription = {
  id: number;
  user_id: number;
  account_id?: number | null;
  account?: {
    id: number;
    name: string;
    type: string;
  } | null;
  name: string;
  merchant: string;
  category: string;
  amount: number | string;
  currency: 'INR';
  billing_interval: BillingInterval;
  next_due_date: string;
  last_charged_date?: string;
  status: SubscriptionStatus;
  reminder_days: number;
  cancel_before_due: boolean;
  cancel_on_date?: string;
  autopay: boolean;
  payment_mode: string;
  transaction_tag: string;
  purpose_type: string;
  notes: string;
  /** 0 means open-ended. */
  total_instalments: number;
  instalments_paid: number;
  days_until_due: number;
  due_state: 'scheduled' | 'due_soon' | 'overdue' | 'paused' | 'cancelled' | 'unknown';
  /** What the payment is. Absent from an older API, which means subscription. */
  kind?: RecurringKind;
  loan_type?: LoanType | '';
  lender?: string;
  principal?: number | string;
  annual_rate_pct?: number;
  processing_fee?: number | string;
  foreclosure_charge_pct?: number;
  /** First payment of the schedule — first EMI or first SIP instalment. */
  start_date?: string;
  platform?: string;
  step_up_pct?: number;
  /** Server-computed figures; absent from an older API. */
  schedule?: RecurringSchedule;
  created_at: string;
  updated_at: string;
};

export type SubscriptionPayload = {
  name: string;
  merchant?: string;
  category?: string;
  amount: number;
  billing_interval?: BillingInterval;
  next_due_date: string;
  last_charged_date?: string;
  status?: SubscriptionStatus;
  reminder_days?: number;
  cancel_before_due?: boolean;
  cancel_on_date?: string;
  autopay?: boolean;
  payment_mode?: string;
  transaction_tag?: string;
  purpose_type?: string;
  notes?: string;
  account_id?: number | null;
  total_instalments?: number;
  instalments_paid?: number;
  kind?: RecurringKind;
  loan_type?: LoanType | '';
  lender?: string;
  principal?: number;
  annual_rate_pct?: number;
  processing_fee?: number;
  foreclosure_charge_pct?: number;
  start_date?: string;
  platform?: string;
  step_up_pct?: number;
};

export type RecurringKind = 'subscription' | 'loan' | 'investment' | 'bill';

export type LoanType =
  | 'personal'
  | 'car'
  | 'two_wheeler'
  | 'home'
  | 'education'
  | 'gold'
  | 'consumer'
  | 'business'
  | 'other';

/** An item's schedule in plain figures, worked out by the server. */
export type RecurringSchedule = {
  monthly_equivalent: number;
  total_instalments?: number;
  instalments_paid?: number;
  remaining_instalments?: number;
  end_date?: string;
  completed?: boolean;
  amount_paid?: number;
  outstanding_principal?: number;
  total_interest?: number;
  invested_so_far?: number;
};

export type SubscriptionOccurrence = {
  id: number;
  subscription_id: number;
  entry_id: number;
  due_date: string;
  status: 'pending' | 'confirmed' | 'reverted';
  subscription?: Subscription;
};

export const syncSubscriptionAutomation = async (token?: string | null): Promise<number> => {
  if (!token) return 0;
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return 0;
  const payload = await response.json();
  return Number(payload?.created ?? 0);
};

export const fetchSubscriptionOccurrences = async (
  token: string
): Promise<SubscriptionOccurrence[]> => {
  const response = await fetch(`${API_BASE_URL}/v1/subscription-occurrences?status=pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load Autopay reviews.');
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
};

export const confirmSubscriptionOccurrence = async (token: string, id: number) => {
  const response = await fetch(`${API_BASE_URL}/v1/subscription-occurrences/${id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to confirm this transaction.');
};

export const revertSubscriptionOccurrence = async (
  token: string,
  id: number
): Promise<SubscriptionOccurrence> => {
  const response = await fetch(`${API_BASE_URL}/v1/subscription-occurrences/${id}/revert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to open this transaction for correction.');
  return response.json();
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const readSubscriptionError = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json();
    if (payload?.fields && typeof payload.fields === 'object') {
      return Object.values(payload.fields).join('\n');
    }
    if (typeof payload?.error === 'string') {
      return payload.error;
    }
  } catch {
    // Ignore invalid error bodies and use the fallback.
  }
  return fallback;
};

export const syncSubscriptionReminders = async (token?: string | null): Promise<number> => {
  if (!token) return 0;
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions/reminders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return 0;
  const payload = await response.json();
  return Number(payload?.created ?? 0);
};

export const fetchSubscriptions = async (
  token?: string | null,
  status: 'all' | SubscriptionStatus = 'all'
): Promise<Subscription[]> => {
  if (!token) return [];
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Unable to load subscriptions right now.');
  }
  const payload = await response.json();
  return Array.isArray(payload) ? (payload as Subscription[]) : [];
};

export const createSubscription = async (
  token: string,
  payload: SubscriptionPayload
): Promise<Subscription> => {
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      currency: 'INR',
      billing_interval: 'monthly',
      status: 'active',
      reminder_days: 3,
      ...payload,
    }),
  });
  if (!response.ok) {
    throw new Error(await readSubscriptionError(response, 'Unable to save this subscription.'));
  }
  return (await response.json()) as Subscription;
};

export const updateSubscription = async (
  token: string,
  id: number,
  payload: SubscriptionPayload
): Promise<Subscription> => {
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      currency: 'INR',
      billing_interval: 'monthly',
      status: 'active',
      reminder_days: 3,
      ...payload,
    }),
  });
  if (!response.ok) {
    throw new Error(await readSubscriptionError(response, 'Unable to update this subscription.'));
  }
  return (await response.json()) as Subscription;
};

export const markSubscriptionPaid = async (
  token: string,
  id: number,
  paidDate: string
): Promise<Subscription> => {
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions/${id}/mark-paid`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ paid_date: paidDate }),
  });
  if (!response.ok) {
    throw new Error(
      await readSubscriptionError(response, 'Unable to mark this subscription paid.')
    );
  }
  return (await response.json()) as Subscription;
};

export const deleteSubscription = async (token: string, id: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/subscriptions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await readSubscriptionError(response, 'Unable to delete this subscription.'));
  }
};
