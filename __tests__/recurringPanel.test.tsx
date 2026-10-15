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

  // The device report: the investment was a blank box, this month's PPF
  // instalment could not be logged, and the bank account to pay from looked
  // like a second copy of the mode.
  it('adds a PPF from the type chips, logging this payment from a bank account', async () => {
    jest
      .spyOn(accounts, 'fetchAccounts')
      .mockResolvedValue([
        { id: 4, type: 'bank', name: 'HDFC Bank', color: '#000', last4: '1234' },
      ] as accounts.Account[]);
    const createSpy = jest
      .spyOn(subscriptions, 'createSubscription')
      .mockResolvedValue({ ...netflix, id: 10 } as Subscription);
    const { findByTestId, findByText, findByPlaceholderText, findAllByText, queryByText } =
      await render(<SubscriptionsPanel embedded />);

    await findByTestId('recurring-overview');
    await fireEvent.press((await findAllByText('New'))[0]);
    await fireEvent.press(await findByText('Investment'));
    await findByTestId('recurring-investment-type');
    expect(queryByText('Swiggy')).toBeNull();
    await fireEvent.press(await findByText('PPF'));
    await fireEvent.changeText(await findByPlaceholderText('5,000'), '3000');

    // Daily and every two weeks are in Repeats now, not under More options.
    await findByText('Every 2 weeks');

    await fireEvent.press(await findByText("Also log this month's payment"));
    await findByText('Paid from');
    await findByText('•• 1234');
    await fireEvent.press(await findByText('Add investment'));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const today = new Date();
    const todayISO = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    expect(createSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        name: 'PPF',
        merchant: 'PPF',
        kind: 'investment',
        amount: 3000,
        payment_mode: 'Bank Account',
        account_id: 4,
        log_payment_on: todayISO,
      })
    );
  });

  it('takes a type that is not listed under Other', async () => {
    const createSpy = jest
      .spyOn(subscriptions, 'createSubscription')
      .mockResolvedValue({ ...netflix, id: 11 } as Subscription);
    const { findByTestId, findByText, findByPlaceholderText, findAllByText } = await render(
      <SubscriptionsPanel embedded />
    );
    await findByTestId('recurring-overview');
    await fireEvent.press((await findAllByText('New'))[0]);
    await fireEvent.press(await findByText('Investment'));
    await fireEvent.press(await findByText('Add investment'));
    await findByText(/Pick the investment type\./);

    await fireEvent.press(await findByText('Other'));
    await fireEvent.changeText(
      await findByPlaceholderText('ULIP, Sukanya Samriddhi, chit fund'),
      'Chit fund'
    );
    await fireEvent.changeText(await findByPlaceholderText('5,000'), '2000');
    await fireEvent.press(await findByText('Add investment'));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: 'Chit fund', kind: 'investment' })
    );
    expect(createSpy.mock.calls[0][1]).not.toHaveProperty('log_payment_on');
  });

  // Mark paid moved the date on and wrote nothing, so the payment never
  // reached the transactions. It now logs it — from the account it came
  // from — unless turned off for a payment already logged.
  it('marks a payment paid and logs it from the chosen account', async () => {
    jest.spyOn(accounts, 'fetchAccounts').mockResolvedValue([
      { id: 4, type: 'bank', name: 'SBI Savings', color: '#000', is_default: true },
      { id: 5, type: 'upi', name: 'GPay', color: '#000' },
    ] as accounts.Account[]);
    const paidSpy = jest
      .spyOn(subscriptions, 'markSubscriptionPaid')
      .mockResolvedValue({ ...netflix, logged_entry_id: 7 } as never);
    const { findByLabelText, findByText, findByTestId } = await render(
      <SubscriptionsPanel embedded />
    );

    await fireEvent.press(await findByLabelText('Mark Netflix paid'));
    await findByTestId('mark-paid-sheet');
    // Cash, the item's mode, is not one an account can be picked for.
    await findByLabelText('Paid from SBI Savings');
    await fireEvent.press(await findByText('UPI'));
    await fireEvent.press(await findByText('Mark paid'));

    await waitFor(() => expect(paidSpy).toHaveBeenCalled());
    expect(paidSpy.mock.calls[0][1]).toBe(netflix.id);
    expect(paidSpy.mock.calls[0][3]).toEqual({
      logTransaction: true,
      paymentMode: 'UPI',
      accountId: 5,
    });
  });

  it('can mark paid without logging, for a payment already logged', async () => {
    const paidSpy = jest.spyOn(subscriptions, 'markSubscriptionPaid').mockResolvedValue(netflix);
    const { findByLabelText, findByText } = await render(<SubscriptionsPanel embedded />);

    await fireEvent.press(await findByLabelText('Mark Netflix paid'));
    await fireEvent.press(await findByLabelText('Add to transactions'));
    await findByText(/Nothing is added to your transactions/);
    await fireEvent.press(await findByText('Mark paid'));

    await waitFor(() => expect(paidSpy).toHaveBeenCalled());
    expect(paidSpy.mock.calls[0][3]).toEqual(expect.objectContaining({ logTransaction: false }));
  });
});
