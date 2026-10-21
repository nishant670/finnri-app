import {
  describeAccess,
  endedAccessLine,
  type BillingPlan,
  type BillingStatus,
  type PastPass,
} from '@/lib/billing';

const now = new Date('2026-10-08T09:00:00Z');

const weeklyPlan: BillingPlan = {
  code: 'weekly',
  name: 'Weekly Pass',
  billing_interval: 'weekly',
  currency: 'INR',
  included_credits: 800,
  daily_credit_limit: 200,
  requires_login: true,
  requires_prior_paid_months: 0,
  checkout_enabled: true,
  feature_gates: [],
};

const pastWeekly = (overrides: Partial<PastPass> = {}): PastPass => ({
  plan_code: 'weekly',
  plan_name: 'Weekly Pass',
  billing_interval: 'weekly',
  period_start: '2026-09-16T10:00:00Z',
  period_end: '2026-09-23T10:00:00Z',
  ended_by: 'expired',
  ...overrides,
});

const status = (overrides: Partial<BillingStatus> = {}, trialEnd: string | null = null) =>
  ({
    subscription_status: 'free',
    credits: {
      total_credits_remaining: 0,
      daily_limit: 0,
      daily_credits_used: 0,
      daily_credits_remaining: 0,
      reset_at: '2026-10-09T00:00:00Z',
      trial_expires_at: trialEnd,
    },
    lifetime_eligibility: { eligible: false, paid_months_completed: 0, required_paid_months: 3 },
    ...overrides,
  }) as BillingStatus;

describe('describeAccess', () => {
  it('names the pass that expired after the trial, not the trial', () => {
    // The reported account: trial ended 16 Sept, a Weekly Pass bought after
    // it, since run out.
    const access = describeAccess(status({ last_pass: pastWeekly() }, '2026-09-16T00:00:00Z'), now);

    expect(access).toEqual({
      kind: 'ended',
      ended: {
        kind: 'pass',
        planName: 'Weekly Pass',
        endedAt: '2026-09-23T10:00:00Z',
        refunded: false,
      },
    });
    expect(endedAccessLine((access as Extract<typeof access, { kind: 'ended' }>).ended)).toMatch(
      /^Weekly Pass ended 23 Sept?$/
    );
  });

  it('falls back to the trial when no pass was ever bought', () => {
    const access = describeAccess(status({}, '2026-09-16T00:00:00Z'), now);

    expect(access).toEqual({
      kind: 'ended',
      ended: { kind: 'trial', endedAt: '2026-09-16T00:00:00Z' },
    });
  });

  it('says a refund ended the pass when one did', () => {
    const access = describeAccess(
      status({ last_pass: pastWeekly({ ended_by: 'refunded' }) }, '2026-09-16T00:00:00Z'),
      now
    );

    expect(access.kind === 'ended' && endedAccessLine(access.ended)).toMatch(
      /^Weekly Pass refunded/
    );
  });

  it('reports a running pass as current', () => {
    const access = describeAccess(
      status(
        {
          plan: weeklyPlan,
          subscription_status: 'active',
          current_period_end: '2026-10-12T00:00:00Z',
        },
        '2026-09-16T00:00:00Z'
      ),
      now
    );

    expect(access).toEqual({
      kind: 'pass',
      planName: 'Weekly Pass',
      endsAt: '2026-10-12T00:00:00Z',
      cancelled: false,
    });
  });

  it('does not call a pass current once its period is over', () => {
    // A stale status read the second after the pass ended.
    const access = describeAccess(
      status(
        {
          plan: weeklyPlan,
          subscription_status: 'active',
          current_period_end: '2026-10-08T08:59:00Z',
        },
        '2026-09-16T00:00:00Z'
      ),
      now
    );

    expect(access.kind).toBe('ended');
  });

  it('keeps a running trial as current even with an older pass on record', () => {
    const access = describeAccess(status({ last_pass: pastWeekly() }, '2026-10-10T00:00:00Z'), now);

    expect(access).toEqual({ kind: 'trial', endsAt: '2026-10-10T00:00:00Z' });
  });

  it('has nothing to say without a status', () => {
    expect(describeAccess(null, now)).toEqual({ kind: 'none' });
  });
});
