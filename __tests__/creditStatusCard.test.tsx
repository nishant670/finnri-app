import { render } from '@testing-library/react-native';

import { CreditStatusCard } from '@/components/billing/CreditStatusCard';
import type { BillingStatus, CreditSummary, PastPass } from '@/lib/billing';

/**
 * The bug these cover: daily remaining is capped by the total balance, so an
 * exhausted account rendered "0/50 used today" next to "0 left today" — both
 * numbers true, the pair nonsense — while the trial line stayed in the future
 * tense weeks after the trial had ended.
 */
const summary = (overrides: Partial<CreditSummary> = {}): CreditSummary => ({
  total_credits_remaining: 420,
  daily_limit: 50,
  daily_credits_used: 10,
  daily_credits_remaining: 40,
  reset_at: '2026-09-25T00:00:00Z',
  trial_expires_at: null,
  ...overrides,
});

const status = (credits: CreditSummary, overrides: Partial<BillingStatus> = {}): BillingStatus => ({
  subscription_status: 'free',
  credits,
  lifetime_eligibility: { eligible: false, paid_months_completed: 0, required_paid_months: 3 },
  ...overrides,
});

const emptyBalance = {
  total_credits_remaining: 0,
  daily_credits_used: 0,
  daily_credits_remaining: 0,
};

const weeklyPass: PastPass = {
  plan_code: 'weekly',
  plan_name: 'Weekly Pass',
  billing_interval: 'weekly',
  period_start: '2026-09-16T10:00:00Z',
  period_end: '2026-09-23T10:00:00Z',
  ended_by: 'expired',
};

describe('CreditStatusCard', () => {
  it('shows the daily meter while there is a balance to spend', async () => {
    const { getByText } = await render(<CreditStatusCard status={status(summary())} compact />);

    expect(getByText('AI credits')).toBeTruthy();
    expect(getByText('10/50 used today')).toBeTruthy();
    expect(getByText('420 total credits left')).toBeTruthy();
  });

  it('says the account is out of credits instead of showing 0/50 used', async () => {
    const { getByText, queryByText } = await render(
      <CreditStatusCard status={status(summary(emptyBalance))} compact />
    );

    expect(getByText('Out of AI credits')).toBeTruthy();
    expect(queryByText('0/50 used today')).toBeNull();
    // Nothing was ever bought, so there is nothing to renew.
    expect(getByText('Choose a pass to keep capturing by voice and text')).toBeTruthy();
  });

  it('puts an expired trial in the past tense', async () => {
    const { getByText, queryByText } = await render(
      <CreditStatusCard
        status={status(summary({ ...emptyBalance, trial_expires_at: '2026-09-16T00:00:00Z' }))}
        compact
      />
    );

    expect(getByText(/Free trial ended/)).toBeTruthy();
    expect(queryByText(/Trial expires/)).toBeNull();
  });

  it('keeps the future tense while the trial is still running', async () => {
    const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { getByText, queryByText } = await render(
      <CreditStatusCard status={status(summary({ trial_expires_at: inAWeek }))} />
    );

    expect(getByText(/Trial expires/)).toBeTruthy();
    expect(queryByText(/Free trial ended/)).toBeNull();
  });

  it('names the pass that ran out, not the trial before it', async () => {
    // The report: a Weekly Pass bought after the trial, since expired, and the
    // card still saying "Free trial ended 16 Sept".
    const { getByText, queryByText } = await render(
      <CreditStatusCard
        status={status(summary({ ...emptyBalance, trial_expires_at: '2026-09-16T00:00:00Z' }), {
          last_pass: weeklyPass,
        })}
        compact
      />
    );

    expect(getByText(/Weekly Pass ended/)).toBeTruthy();
    expect(queryByText(/Free trial/)).toBeNull();
    expect(getByText('Renew to keep capturing by voice and text')).toBeTruthy();
  });

  it('does not blame the trial when a running pass is what is used up', async () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { getByText, queryByText } = await render(
      <CreditStatusCard
        status={status(summary({ ...emptyBalance, trial_expires_at: '2026-09-16T00:00:00Z' }), {
          subscription_status: 'active',
          current_period_end: inThreeDays,
          plan: {
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
          },
        })}
        compact
      />
    );

    expect(getByText('Weekly Pass credits used up')).toBeTruthy();
    expect(getByText(/Weekly Pass runs until/)).toBeTruthy();
    expect(queryByText(/Free trial/)).toBeNull();
    // Another pass would queue behind this one and add nothing today.
    expect(queryByText(/Renew/)).toBeNull();
  });
});
