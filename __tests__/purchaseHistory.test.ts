import type { BillingPayment } from '@/lib/billing';
import { describePayment } from '@/lib/purchase-history';

const now = new Date('2026-10-08T09:00:00Z');

const payment = (overrides: Partial<BillingPayment> = {}): BillingPayment => ({
  id: 1,
  status: 'captured',
  plan_code: 'weekly',
  plan_name: 'Weekly Pass',
  billing_interval: 'weekly',
  amount_minor: 7900,
  amount_refunded_minor: 0,
  currency: 'INR',
  method: 'upi',
  reference: 'pay_Abc123',
  created_at: '2026-09-16T04:55:00Z',
  captured_at: '2026-09-16T04:56:00Z',
  period_start: '2026-09-16T04:56:00Z',
  period_end: '2026-09-23T04:56:00Z',
  ...overrides,
});

describe('describePayment', () => {
  it('shows an expired pass with what was paid, how, and when it ran', () => {
    const row = describePayment(payment(), now);

    expect(row.title).toBe('Weekly Pass');
    expect(row.amount).toBe('₹79');
    expect(row.badge).toEqual({ label: 'Expired', tone: 'neutral' });
    expect(row.details[0]).toMatch(/^Paid 16 Sept? 2026, .+ · UPI$/);
    expect(row.details[1]).toMatch(/^Valid 16 Sept? 2026 – 23 Sept? 2026$/);
    expect(row.reference).toBe('pay_Abc123');
  });

  it('marks a pass that is still running as active', () => {
    const row = describePayment(
      payment({ period_start: '2026-10-05T00:00:00Z', period_end: '2026-10-12T00:00:00Z' }),
      now
    );

    expect(row.badge).toEqual({ label: 'Active', tone: 'positive' });
  });

  it('marks a renewal queued behind the current pass by when it starts', () => {
    const row = describePayment(
      payment({ period_start: '2026-10-12T00:00:00Z', period_end: '2026-10-19T00:00:00Z' }),
      now
    );

    expect(row.badge.tone).toBe('accent');
    expect(row.badge.label).toMatch(/^Starts 12 Oct 2026$/);
  });

  it('shows the regular price beside an offer price', () => {
    const row = describePayment(
      payment({ amount_minor: 1900, original_amount_minor: 7900, offer_label: 'Launch offer' }),
      now
    );

    expect(row.amount).toBe('₹19');
    expect(row.originalAmount).toBe('₹79');
    expect(row.offerLabel).toBe('Launch offer');
  });

  it('records a full refund', () => {
    const row = describePayment(
      payment({
        status: 'refunded',
        amount_refunded_minor: 7900,
        refunded_at: '2026-09-18T10:00:00Z',
      }),
      now
    );

    expect(row.badge).toEqual({ label: 'Refunded', tone: 'neutral' });
    expect(row.details).toContainEqual(expect.stringMatching(/^Refunded 18 Sept? 2026$/));
  });

  it('notes a partial refund on a purchase that still stands', () => {
    const row = describePayment(payment({ amount_refunded_minor: 3000 }), now);

    expect(row.details).toContain('₹30 refunded');
  });

  it('says a failed attempt failed, and why', () => {
    const row = describePayment(
      payment({
        status: 'failed',
        captured_at: null,
        period_start: null,
        period_end: null,
        failure_reason: 'Payment was declined by the bank',
      }),
      now
    );

    expect(row.badge).toEqual({ label: 'Failed', tone: 'negative' });
    expect(row.details[0]).toMatch(/^Tried 16 Sept? 2026/);
    expect(row.details[1]).toBe('Payment was declined by the bank');
  });
});
