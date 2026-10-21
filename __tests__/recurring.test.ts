import {
  emiFor,
  kindOf,
  monthlyEquivalentOf,
  overviewFromSubscriptions,
  solveLoan,
} from '@/lib/recurring';
import type { Subscription } from '@/lib/subscriptions';

const item = (overrides: Partial<Subscription>): Subscription =>
  ({
    id: 1,
    user_id: 1,
    name: 'Item',
    merchant: '',
    category: '',
    amount: 100,
    currency: 'INR',
    billing_interval: 'monthly',
    next_due_date: '2026-11-05',
    status: 'active',
    reminder_days: 3,
    cancel_before_due: false,
    autopay: false,
    payment_mode: 'Cash',
    transaction_tag: 'Subscription',
    purpose_type: 'normal_spend',
    notes: '',
    total_instalments: 0,
    instalments_paid: 0,
    days_until_due: 10,
    due_state: 'scheduled',
    created_at: '',
    updated_at: '',
    ...overrides,
  }) as Subscription;

describe('solveLoan', () => {
  it('works out the EMI from amount, rate and tenure', () => {
    expect(solveLoan({ principal: 300000, annualRatePct: 12, months: 36 }).emi).toBeCloseTo(
      9964.29,
      1
    );
  });

  it('works out the tenure from amount, rate and EMI', () => {
    expect(solveLoan({ principal: 300000, annualRatePct: 12, emi: 9965 }).months).toBe(36);
  });

  it('works out the amount from EMI, rate and tenure', () => {
    expect(solveLoan({ emi: 9964.29, annualRatePct: 12, months: 36 }).principal).toBeCloseTo(
      300000,
      -1
    );
  });

  it('works out the rate from amount, tenure and EMI', () => {
    expect(solveLoan({ principal: 300000, months: 36, emi: 9964.29 }).annualRatePct).toBeCloseTo(
      12,
      1
    );
  });

  it('handles a no-cost EMI', () => {
    expect(solveLoan({ principal: 60000, months: 6, emi: 10000 }).annualRatePct).toBe(0);
    expect(emiFor(60000, 0, 6)).toBe(10000);
  });

  it('refuses figures that never pay the loan off, and needs exactly one gap', () => {
    expect(solveLoan({ principal: 300000, annualRatePct: 12, emi: 2000 })).toEqual({});
    expect(solveLoan({ principal: 300000, annualRatePct: 12 })).toEqual({});
    expect(solveLoan({ principal: 300000, annualRatePct: 12, months: 36, emi: 9965 })).toEqual({});
  });
});

describe('kindOf', () => {
  it('files what an older API sends the way the server does', () => {
    expect(kindOf(item({ transaction_tag: 'EMI' }))).toBe('loan');
    expect(kindOf(item({ total_instalments: 24 }))).toBe('loan');
    expect(kindOf(item({ transaction_tag: 'Investment' }))).toBe('investment');
    expect(kindOf(item({}))).toBe('subscription');
    expect(kindOf(item({ kind: 'bill', transaction_tag: 'General' }))).toBe('bill');
  });
});

describe('overviewFromSubscriptions', () => {
  it('totals active items per month by kind for an API without the overview', () => {
    const overview = overviewFromSubscriptions([
      item({ name: 'Car loan', transaction_tag: 'EMI', amount: 9965, next_due_date: '2026-11-05' }),
      item({
        name: 'Prime',
        amount: 1499,
        billing_interval: 'yearly',
        next_due_date: '2026-12-01',
      }),
      item({ name: 'Old gym', amount: 999, status: 'cancelled', next_due_date: '2026-10-01' }),
    ]);
    expect(overview.summary.active_count).toBe(2);
    expect(overview.summary.monthly_total).toBeCloseTo(9965 + 124.92, 2);
    expect(overview.summary.by_kind.loan).toBe(9965);
    expect(overview.summary.next_due?.name).toBe('Car loan');
    expect(monthlyEquivalentOf(300, 'quarterly')).toBe(100);
  });
});
