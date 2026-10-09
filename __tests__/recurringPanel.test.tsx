import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { SubscriptionsPanel } from '@/components/money/SubscriptionsPanel';
import * as accounts from '@/lib/accounts';
import * as insights from '@/lib/insights';
import * as merchants from '@/lib/merchant-suggestions';
import * as recurring from '@/lib/recurring';
import * as subscriptions from '@/lib/subscriptions';
import type { Subscription } from '@/lib/subscriptions';

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
  useAppDialog: () => ({ confirm: jest.fn().mockResolvedValue(false), alert: jest.fn() }),
}));

const base = {
  user_id: 1,
  merchant: '',
  category: 'Bills',
  currency: 'INR',
  billing_interval: 'monthly',
  status: 'active',
  reminder_days: 3,
  cancel_before_due: false,
  autopay: false,
  payment_mode: 'Cash',
  purpose_type: 'normal_spend',
  notes: '',
  total_instalments: 0,
  instalments_paid: 0,
  days_until_due: 10,
  due_state: 'scheduled',
  created_at: '',
  updated_at: '',
} as const;

const carLoan = {
  ...base,
  id: 1,
  name: 'Car loan',
  amount: 9965,
  next_due_date: '2026-11-05',
  transaction_tag: 'EMI',
  kind: 'loan',
  lender: 'HDFC Bank',
  total_instalments: 36,
  instalments_paid: 12,
  schedule: {
    monthly_equivalent: 9965,
    total_instalments: 36,
    instalments_paid: 12,
    remaining_instalments: 24,
    end_date: '2028-10-05',
    outstanding_principal: 211666.37,
  },
} as unknown as Subscription;

const netflix = {
  ...base,
  id: 2,
  name: 'Netflix',
  amount: 649,
  next_due_date: '2026-11-12',
  transaction_tag: 'Subscription',
  kind: 'subscription',
  schedule: { monthly_equivalent: 649 },
} as unknown as Subscription;

describe('Recurring panel', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockPush.mockReset();
    jest.spyOn(subscriptions, 'syncSubscriptionReminders').mockResolvedValue(0);
    jest.spyOn(accounts, 'fetchAccounts').mockResolvedValue([]);
    jest.spyOn(insights, 'fetchDashboard').mockResolvedValue({ recurring_candidates: [] } as never);
    jest.spyOn(merchants, 'fetchMerchantSuggestions').mockResolvedValue([]);
    jest.spyOn(recurring, 'fetchRecurring').mockResolvedValue({
      summary: {
        monthly_total: 9965 + 649 + 3000,
        by_kind: { loan: 9965, subscription: 649, card_emi: 3000 },
        active_count: 3,
        next_due: { name: 'Car loan', kind: 'loan', amount: 9965, date: '2026-11-05' },
      },
      items: [carLoan, netflix],
      card_emis: [
        {
          plan_id: 77,
          account_id: 5,
          card_name: 'Regalia',
          title: 'iPhone EMI',
          monthly_amount: 3000,
          next_due_date: '2026-11-15',
          total_instalments: 12,
          instalments_paid: 4,
        },
      ],
    });
  });

  it('shows the monthly commitment and filters to loans, card EMIs included', async () => {
    const { findByTestId, findByText, queryByText } = await render(<SubscriptionsPanel embedded />);

    await findByTestId('recurring-overview');
    await findByText('Netflix');
    await fireEvent.press(await findByTestId('recurring-filter-loan'));

    await findByText('Car loan');
    await findByText('iPhone EMI');
    expect(queryByText('Netflix')).toBeNull();
    await findByTestId('recurring-loan-progress');

    await fireEvent.press(await findByTestId('card-emi-77'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/emi-plans/[id]', params: { id: '77' } });
  });

  it('adds a loan, working out the EMI from amount, rate and tenure', async () => {
    const createSpy = jest
      .spyOn(subscriptions, 'createSubscription')
      .mockResolvedValue({ ...carLoan, id: 9 } as Subscription);
    const { findByTestId, findByText, findByPlaceholderText, findAllByText } = await render(
      <SubscriptionsPanel embedded />
    );

    await findByTestId('recurring-overview');
    await fireEvent.press(await findByTestId('recurring-filter-loan'));
    await fireEvent.press((await findAllByText('New'))[0]);

    // Everything about the loan beyond its EMI is optional, so it is folded.
    await fireEvent.press(await findByTestId('recurring-loan-details'));
    await findByTestId('recurring-loan-fields');
    await fireEvent.changeText(
      await findByPlaceholderText('Car loan, Home loan, iPhone EMI'),
      'Bike loan'
    );
    await fireEvent.changeText(await findByPlaceholderText('3,00,000'), '300000');
    await fireEvent.changeText(await findByPlaceholderText('10.5'), '12');
    await fireEvent.changeText(await findByPlaceholderText('36'), '36');

    await fireEvent.press(await findByTestId('recurring-loan-suggestion'));
    await fireEvent.press(await findByText('Add loan'));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        name: 'Bike loan',
        kind: 'loan',
        amount: 9964,
        total_instalments: 36,
        instalments_paid: 0,
        principal: 300000,
        annual_rate_pct: 12,
        transaction_tag: 'EMI',
      })
    );
  });
});
