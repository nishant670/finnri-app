import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { MoneyOverview } from '@/components/money/MoneyOverview';
import * as accountsLib from '@/lib/accounts';
import type { Account } from '@/lib/accounts';
import * as billing from '@/lib/billing';
import * as insights from '@/lib/insights';
import { accountKindGroups, cardTotalSummary, dueAction } from '@/lib/money-overview';
import * as refundables from '@/lib/refundables';
import * as subscriptions from '@/lib/subscriptions';
import type { UpcomingDue } from '@/lib/upcoming';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    useScrollToTop: () => undefined,
  };
});
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => ({ confirm: jest.fn(), alert: jest.fn() }),
}));

const card = (id: number, outstanding: number, limit: number): Account =>
  ({
    id,
    type: 'credit_card',
    name: `Card ${id}`,
    color: '#8257E5',
    credit_limit: limit,
    summary: { outstanding },
  }) as unknown as Account;

const due = (over: Partial<UpcomingDue>): UpcomingDue => ({
  key: 'k',
  kind: 'subscription',
  sourceID: 1,
  title: 'Zee',
  subtitle: 'Monthly',
  amount: 399,
  dueDate: '2026-10-01',
  daysUntil: -3,
  state: 'overdue',
  ...over,
});

describe('Honest card total (P19)', () => {
  it('names the limit only when every card has one', () => {
    expect(cardTotalSummary([card(1, 1000, 50000), card(2, 500, 20000)])).toMatchObject({
      outstanding: 1500,
      limit: 70000,
      headline: '₹1,500 owed on 2 cards',
      caption: 'of ₹70,000 limit',
    });
    expect(cardTotalSummary([card(1, 1000, 50000), card(2, 500, 0)])).toMatchObject({
      limit: null,
      caption: '2 cards · 1 without a limit',
    });
  });
});

describe('Accounts by kind (P17)', () => {
  it('sums what the cards owe and leaves a balance out when one is unknown', () => {
    const bank = { id: 9, type: 'bank', name: 'SBI', summary: {} } as unknown as Account;
    const groups = accountKindGroups([card(1, 1000, 0), bank]);
    expect(groups.map((group) => [group.label, group.amount])).toEqual([
      ['Credit cards', 1000],
      ['Bank', null],
    ]);
  });
});

describe('Due actions (P20)', () => {
  it('offers Mark paid on a due recurring payment and Got it on a refund', () => {
    expect(dueAction(due({}))).toBe('mark-paid');
    expect(dueAction(due({ state: 'scheduled', daysUntil: 20 }))).toBeNull();
    expect(dueAction(due({ kind: 'refund' }))).toBe('got-it');
    expect(dueAction(due({ kind: 'card' }))).toBeNull();
  });
});

describe('Money overview (P17, P18, P22)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockPush.mockClear();
    jest.spyOn(accountsLib, 'fetchAccounts').mockResolvedValue([card(1, 2000, 0)]);
    jest.spyOn(subscriptions, 'fetchSubscriptions').mockResolvedValue([]);
    jest.spyOn(refundables, 'fetchRefundables').mockResolvedValue([]);
    jest.spyOn(billing, 'fetchBillingStatus').mockResolvedValue(null as never);
  });

  it('opens on the figures and sections, with Unlock past the free budget', async () => {
    jest.spyOn(insights, 'fetchDashboard').mockResolvedValue({
      budget_statuses: [
        {
          budget_id: 1,
          name: 'Bills',
          category: 'Bills',
          limit_amount: 64000,
          spent_amount: 58150,
          status: 'watch',
        },
      ],
    } as never);
    const onOpenList = jest.fn();
    const ui = await render(<MoneyOverview onOpenList={onOpenList} />);

    expect(await ui.findByText('Owed on cards')).toBeTruthy();
    expect(ui.getByText('1 card · 1 without a limit')).toBeTruthy();
    expect(ui.getByText('Bills & dues')).toBeTruthy();
    expect(ui.getByText('₹58,150 of ₹64,000')).toBeTruthy();

    await fireEvent.press(ui.getByLabelText('Unlock, Budgets'));
    expect(mockPush).toHaveBeenCalledWith('/billing');

    await fireEvent.press(ui.getByLabelText('See all, Accounts'));
    expect(onOpenList).toHaveBeenCalledWith('accounts');
  });

  it('offers a first budget when there is none', async () => {
    jest.spyOn(insights, 'fetchDashboard').mockResolvedValue({ budget_statuses: [] } as never);
    const onOpenList = jest.fn();
    const ui = await render(<MoneyOverview onOpenList={onOpenList} />);

    expect(await ui.findByText('Set a monthly budget')).toBeTruthy();
    await waitFor(() => expect(ui.getByText('One budget is free. See what is left as you spend.')).toBeTruthy());
  });
});
