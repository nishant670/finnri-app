import { readApiError } from './api-error';
import { API_BASE_URL, type ApiEntry } from './transactions';

const entryFieldLabels: Record<string, string> = {
  account_id: 'Account',
  // A transaction can carry a split, and the server reports its problems under
  // `split.*` paths. Without these the composer surfaced raw field paths —
  // "Split.Participants[0].Friend must belong to the current user" — which
  // names an internal shape rather than anything on screen.
  'split.group_id': 'Split group',
  'split.participants': 'Split shares',
  friend_id: 'Friend',
  share_amount: 'Share amount',
  direction: 'Split direction',
  amount: 'Amount',
  attachment: 'Receipt',
  category: 'Category',
  currency: 'Currency',
  date: 'Date',
  mode: 'Payment method',
  source: 'Source',
  title: 'Title',
  type: 'Transaction type',
};

export type EntryMutationPayload = {
  title: string;
  amount: string;
  currency: string;
  account_id: number | null;
  type: string;
  mode: string;
  category: string;
  notes: string;
  merchant: string;
  tag: string | null;
  date?: string;
  time?: string;
  source?: 'manual' | 'text' | 'voice' | 'receipt';
  source_text?: string;
  attachment?: string | null;
  refundable_amount?: string | number | null;
  refund_expected_on?: string | null;
  refund_reminder_at?: string | null;
  refund_status?: 'pending' | 'received' | 'written_off' | null;
  split?: {
    group_id?: number | null;
    group_name?: string;
    notes?: string;
    participants: Array<{
      friend_id?: number;
      friend?: {
        name: string;
      };
      share_amount: string | number;
      direction?: 'friend_owes_user' | 'user_owes_friend';
    }>;
  } | null;
};

const entryHeaders = (token: string, idempotencyKey?: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
});

export const fetchEntry = async (token: string, id: string | number): Promise<ApiEntry> => {
  const response = await fetch(`${API_BASE_URL}/v1/entries/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await readApiError(
      response,
      'Unable to load the transaction right now.',
      entryFieldLabels
    );
  }
  return response.json();
};

export const createEntry = async (
  token: string,
  payload: EntryMutationPayload,
  idempotencyKey: string
): Promise<ApiEntry> => {
  const response = await fetch(`${API_BASE_URL}/v1/entries`, {
    method: 'POST',
    headers: entryHeaders(token, idempotencyKey),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to save the entry right now.', entryFieldLabels);
  }
  return response.json();
};

export const updateEntry = async (
  token: string,
  id: string | number,
  payload: EntryMutationPayload
): Promise<ApiEntry> => {
  const response = await fetch(`${API_BASE_URL}/v1/entries/${id}`, {
    method: 'PUT',
    headers: entryHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readApiError(
      response,
      'Unable to update the transaction right now.',
      entryFieldLabels
    );
  }
  return response.json();
};

/** Link an existing review item without rebuilding its entire edit payload. */
export const linkEntryAccount = async (
  token: string,
  id: string | number,
  accountId: number
): Promise<ApiEntry> => {
  const response = await fetch(`${API_BASE_URL}/v1/entries/${id}`, {
    method: 'PUT',
    headers: entryHeaders(token),
    body: JSON.stringify({ account_id: accountId }),
  });
  if (!response.ok) {
    throw await readApiError(response, 'Unable to link this account right now.', entryFieldLabels);
  }
  return response.json();
};

export const deleteEntry = async (token: string, id: string | number): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/v1/entries/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  // A row that is already gone is the outcome the caller asked for, so a 404 is
  // success rather than failure. Deleting the same entry twice is reachable in
  // ordinary use — the undo window commits the pending delete as soon as a
  // second one is requested, so an impatient double tap sends the same id twice
  // — and the caller's failure path says "it is still in your ledger", which in
  // that race is the one thing that is definitely not true.
  if (response.status === 404) return;
  if (!response.ok) {
    throw await readApiError(
      response,
      'Unable to delete the transaction right now.',
      entryFieldLabels
    );
  }
};
