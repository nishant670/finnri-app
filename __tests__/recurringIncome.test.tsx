import { fireEvent, render } from '@testing-library/react-native';

import { MarkPaidSheet } from '@/components/money/subscriptions/MarkPaidSheet';
import { recurringKindTotal, recurringDue } from '@/components/money/RecurringList';
import type { Account } from '@/lib/accounts';
import { isIncomeReminder } from '@/lib/notifications';
import { overviewFromSubscriptions } from '@/lib/recurring';
import type { Subscription } from '@/lib/subscriptions';
import {
  buildUpcomingDues,
  dueStatusLabel,
  isLateDue,
  totalUpcomingAmount,
} from '@/lib/upcoming';

/**
 * Recurring income (device feedback 2026-11-17): a salary repeats on the same
 * schedule as a payment, but it is money coming in — never counted as due or
 * committed, finished with "Mark received", and never received on a card.
 */
const item = (overrides: Partial<Subscription>): Subscription =>
  ({
    id: 1,
    user_id: 1,
    name: 'Netflix',
    merchant: 'Netflix',
    category: 'Entertainment',
    amount: 649,
    currency: 'INR',
    billing_interval: 'monthly',
    next_due_date: '2026-11-20',
    status: 'active',
    reminder_days: 3,
    cancel_before_due: false,
    autopay: false,
    payment_mode: 'UPI',
    transaction_tag: 'Subscription',
    purpose_type: 'normal_spend',
    notes: '',
    days_until_due: 3,
    due_state: 'due_soon',
    created_at: '',
    updated_at: '',
    kind: 'subscription',
    ...overrides,
  }) as Subscription;

const salary = item({
  id: 2,
  name: 'Salary',
  merchant: '',
  category: 'Salary',
  amount: 85000,
  kind: 'income',
  payment_mode: 'Bank Account',
  account_id: 7,
  transaction_tag: 'General',
  next_due_date: '2026-11-18',
});

describe('recurring income in dues', () => {
  const today = new Date(2026, 10, 17);

  it('is listed as money coming in and kept out of what is due', () => {
    const dues = buildUpcomingDues({ subscriptions: [item({}), salary], accounts: [], today });
    const salaryDue = dues.find((due) => due.sourceID === 2)!;
    expect(salaryDue.incoming).toBe(true);
    expect(salaryDue.subtitle).toBe('Coming in');
    expect(dueStatusLabel(salaryDue)).toBe('Expected tomorrow');
    expect(totalUpcomingAmount(dues)).toBe(649);
  });

  it('is "late", never "overdue", once its day has passed', () => {
    const [late] = buildUpcomingDues({
      subscriptions: [{ ...salary, next_due_date: '2026-11-14' }],
      accounts: [],
      today,
    });
    expect(dueStatusLabel(late)).toBe('3 days late');
    expect(isLateDue(late)).toBe(false);
    const [overduePayment] = buildUpcomingDues({
      subscriptions: [item({ next_due_date: '2026-11-14' })],
      accounts: [],
      today,
    });
    expect(isLateDue(overduePayment)).toBe(true);
    expect(dueStatusLabel(overduePayment)).toBe('3 days overdue');
  });
});

describe('recurring income in the Recurring list', () => {
  it('is summed apart from commitments when the API has no overview', () => {
    const { summary } = overviewFromSubscriptions([item({}), salary]);
    expect(summary.monthly_total).toBe(649);
    expect(summary.active_count).toBe(1);
    expect(summary.next_due?.name).toBe('Netflix');
    expect(summary.monthly_income).toBe(85000);
    expect(summary.income_active_count).toBe(1);
    expect(recurringKindTotal(summary, 'income')).toBe(85000);
  });

  it('is expected, not due', () => {
    expect(recurringDue({ ...salary, due_state: 'due_soon' }).label).toBe('Expected 18 Nov');
    expect(recurringDue({ ...salary, due_state: 'overdue' })).toMatchObject({
      label: 'Not received · 18 Nov',
      tone: 'warning',
    });
  });
});

describe('MarkPaidSheet for income', () => {
  const accounts: Account[] = [
    { id: 7, type: 'bank', name: 'HDFC Savings', color: '#000', is_default: true },
    { id: 9, type: 'credit_card', name: 'One Card', color: '#000', is_default: false },
  ];

  it('marks it received into an account, never a card', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <MarkPaidSheet
        visible
        subscription={salary}
        accounts={accounts}
        submitting={false}
        error={null}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        onAddAccount={jest.fn()}
      />
    );
    expect(screen.getByText('Mark Salary received')).toBeTruthy();
    expect(screen.getByText('Received in')).toBeTruthy();
    await fireEvent.press(screen.getByText('Received via'));
    expect(screen.queryByText('Credit Card')).toBeNull();

    await fireEvent.press(screen.getAllByText('Mark received').slice(-1)[0]);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ logTransaction: true, paymentMode: 'Bank Account', accountId: 7 })
    );
  });

  // Found on device 2026-11-17: a salary saved as Cash was forced to
  // "Bank Account · No bank account yet".
  it('keeps a Cash income in cash', async () => {
    const onConfirm = jest.fn();
    const withCash: Account[] = [
      ...accounts,
      { id: 1, type: 'cash', name: 'Cash', color: '#000', is_default: true },
    ];
    const screen = await render(
      <MarkPaidSheet
        visible
        subscription={{ ...salary, payment_mode: 'Cash', account_id: 1 }}
        accounts={withCash}
        submitting={false}
        error={null}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        onAddAccount={jest.fn()}
      />
    );
    expect(screen.queryByText('No bank account yet')).toBeNull();
    await fireEvent.press(screen.getAllByText('Mark received').slice(-1)[0]);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMode: 'Cash', accountId: 1 })
    );
  });

  it('keeps "Mark paid" for a payment', async () => {
    const screen = await render(
      <MarkPaidSheet
        visible
        subscription={item({})}
        accounts={accounts}
        submitting={false}
        error={null}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        onAddAccount={jest.fn()}
      />
    );
    expect(screen.getByText('Mark Netflix paid')).toBeTruthy();
    expect(screen.getByText('Paid from')).toBeTruthy();
  });
});

describe('isIncomeReminder', () => {
  it("reads the server's income reminder titles", () => {
    expect(isIncomeReminder({ type: 'subscription.due', title: 'Salary expected' })).toBe(true);
    expect(isIncomeReminder({ type: 'subscription.overdue', title: 'Salary not marked received' })).toBe(true);
    expect(isIncomeReminder({ type: 'subscription.due', title: 'Subscription due soon' })).toBe(false);
    expect(isIncomeReminder({ type: 'budget.exceeded', title: 'Salary expected' })).toBe(false);
  });
});
