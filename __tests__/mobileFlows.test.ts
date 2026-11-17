import { deleteUserAccount, guestCheckin } from '@/lib/auth';
import { createEntry, deleteEntry, updateEntry } from '@/lib/entries';
import { fetchDashboard } from '@/lib/insights';
import { parseEntryDraft } from '@/lib/parse';
import { notifyTransactionsChanged, subscribeTransactionsChanged } from '@/lib/transaction-events';
import { loadTransactions } from '@/lib/transactions';

const jsonResponse = (payload: unknown, ok = true) =>
  ({
    ok,
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  }) as unknown as Response;

const fetchMock = () => global.fetch as jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('mobile MVP flows', () => {
  it('checks in a guest, saves the first manual transaction, and reloads activity', async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'guest-token',
          user: { uuid: 'guest-uuid', is_guest: true, username: 'Guest_1234' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 101,
          title: 'Metro',
          amount: '45.00',
          currency: 'INR',
          account_id: 7,
          account: { id: 7, name: 'Cash', type: 'cash' },
          type: 'expense',
          mode: 'Cash',
          category: 'Travel',
          date: '2026-07-11',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entries: [
            {
              id: 101,
              title: 'Metro',
              amount: '45.00',
              account_id: 7,
              account: { id: 7, name: 'Cash', type: 'cash' },
              type: 'expense',
              mode: 'Cash',
              category: 'Travel',
              date: '2026-07-11',
            },
          ],
        })
      );

    const session = await guestCheckin({ device_id: 'device-1', guest_secret: 'a'.repeat(64) });
    const entry = await createEntry(
      session.token,
      {
        title: 'Metro',
        amount: '45.00',
        currency: 'INR',
        account_id: 7,
        type: 'expense',
        mode: 'Cash',
        category: 'Travel',
        notes: '',
        merchant: '',
        tag: null,
        date: '2026-07-11',
        source: 'manual',
        source_text: '',
      },
      'first-entry-key'
    );
    const transactions = await loadTransactions(session.token);

    expect(entry.id).toBe(101);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual(
      expect.objectContaining({
        id: '101',
        name: 'Metro',
        accountName: 'Cash',
        entryType: 'expense',
      })
    );
    expect(fetchMock()).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/v1/auth/guest'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ device_id: 'device-1', guest_secret: 'a'.repeat(64) }),
      })
    );
    expect(fetchMock()).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/v1/entries'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer guest-token',
          'Idempotency-Key': 'first-entry-key',
        }),
      })
    );
  });

  it('parses typed natural language into an editable AI draft', async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({
        title: 'Lunch',
        amount: 250,
        currency: 'INR',
        type: 'expense',
        mode: 'UPI',
        category: 'Food & Drinks',
        merchant: 'Cafe',
        date: '2026-07-11',
        time: null,
        card_network: null,
        account_hint: null,
        tag: null,
        note: null,
        source_text: 'spent 250 on lunch via upi',
        confidence: { amount: 0.99, category: 0.8 },
        needs_confirmation: { account_id: true },
        missing_fields: ['account_id'],
        clarifications: ['Which account paid for this?'],
      })
    );

    const draft = await parseEntryDraft({
      token: 'guest-token',
      hintText: 'spent 250 on lunch via upi',
      tz: 'Asia/Kolkata',
    });

    expect(draft).toEqual(
      expect.objectContaining({
        title: 'Lunch',
        amount: 250,
        mode: 'UPI',
        source_text: 'spent 250 on lunch via upi',
        missing_fields: ['account_id'],
      })
    );
    expect(fetchMock()).toHaveBeenCalledWith(
      expect.stringContaining('/v1/parse'),
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer guest-token' },
      })
    );
  });

  it('updates and deletes an entry through owned transaction endpoints', async () => {
    fetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 101,
          title: 'Metro ride',
          amount: '50.00',
          type: 'expense',
          mode: 'Cash',
          category: 'Travel',
          date: '2026-07-11',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ message: 'entry deleted' }));

    const updated = await updateEntry('guest-token', 101, {
      title: 'Metro ride',
      amount: '50.00',
      currency: 'INR',
      account_id: 7,
      type: 'expense',
      mode: 'Cash',
      category: 'Travel',
      notes: '',
      merchant: '',
      tag: null,
      date: '2026-07-11',
    });
    await deleteEntry('guest-token', 101);

    expect(updated.title).toBe('Metro ride');
    expect(fetchMock()).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/v1/entries/101'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer guest-token' }),
      })
    );
    expect(fetchMock()).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/v1/entries/101'),
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer guest-token' },
      })
    );
  });

  it('deletes the signed-in user through the account deletion endpoint', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ message: 'account deleted' }));

    await deleteUserAccount('user-token');

    expect(fetchMock()).toHaveBeenCalledWith(
      expect.stringContaining('/v1/user'),
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer user-token' },
      })
    );
  });

  it('refreshes dashboard data when transaction changes are announced', async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({
        period: { start: '2026-07-01', end: '2026-07-31' },
        summary: {
          total_spent: 250,
          total_income: 0,
          daily_average: 25,
          transaction_count: 1,
        },
        top_categories: [],
        top_merchants: [],
        account_spending: [],
        recent_transactions: [],
        insights: [],
      })
    );
    const refresh = jest.fn(() => fetchDashboard('guest-token', '2026-07-01', '2026-07-31'));
    const unsubscribe = subscribeTransactionsChanged(refresh);

    notifyTransactionsChanged();
    const dashboard = await refresh.mock.results[0].value;
    unsubscribe();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dashboard.summary.transaction_count).toBe(1);
    expect(fetchMock()).toHaveBeenCalledWith(
      expect.stringContaining('/v1/dashboard?start_date=2026-07-01&end_date=2026-07-31'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer guest-token' },
      })
    );
  });
});
