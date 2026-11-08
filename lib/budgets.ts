import { readApiError } from './api-error';
import { API_BASE_URL } from './transactions';

export type Budget = {
  id: number;
  user_id: number;
  name: string;
  period: 'monthly';
  category: string;
  limit_amount: number | string;
  currency: 'INR';
  alert_threshold_percent: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BudgetPayload = {
  name: string;
  category?: string;
  limit_amount: number;
  alert_threshold_percent?: number;
  active?: boolean;
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const budgetFieldLabels: Record<string, string> = {
  limit_amount: 'Limit',
  alert_threshold_percent: 'Alert threshold',
};

export const fetchBudgets = async (token?: string | null): Promise<Budget[]> => {
  if (!token) {
    return [];
  }
  const response = await fetch(`${API_BASE_URL}/v1/budgets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to load budgets right now.', budgetFieldLabels);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? (payload as Budget[]) : [];
};

export const createBudget = async (token: string, payload: BudgetPayload): Promise<Budget> => {
  const response = await fetch(`${API_BASE_URL}/v1/budgets`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      period: 'monthly',
      currency: 'INR',
      alert_threshold_percent: payload.alert_threshold_percent ?? 80,
      active: payload.active ?? true,
      ...payload,
    }),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to save this budget.', budgetFieldLabels);
  }
  return (await response.json()) as Budget;
};

export const updateBudget = async (
  token: string,
  id: number,
  payload: BudgetPayload
): Promise<Budget> => {
  const response = await fetch(`${API_BASE_URL}/v1/budgets/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({
      period: 'monthly',
      currency: 'INR',
      alert_threshold_percent: payload.alert_threshold_percent ?? 80,
      active: payload.active ?? true,
      ...payload,
    }),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to update this budget.', budgetFieldLabels);
  }
  return (await response.json()) as Budget;
};

export const deleteBudget = async (token: string, id: number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/budgets/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to delete this budget.', budgetFieldLabels);
  }
};
