import { render } from '@testing-library/react-native';

import { CreditStatusCard } from '@/components/billing/CreditStatusCard';
import type { CreditSummary } from '@/lib/billing';

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

const emptyBalance = {
  total_credits_remaining: 0,
  daily_credits_used: 0,
  daily_credits_remaining: 0,
};

describe('CreditStatusCard', () => {
  it('shows the daily meter while there is a balance to spend', async () => {
    const { getByText } = await render(<CreditStatusCard credits={summary()} compact />);

    expect(getByText('AI credits')).toBeTruthy();
    expect(getByText('10/50 used today')).toBeTruthy();
    expect(getByText('420 total credits left')).toBeTruthy();
  });

  it('says the account is out of credits instead of showing 0/50 used', async () => {
    const { getByText, queryByText } = await render(
      <CreditStatusCard credits={summary(emptyBalance)} compact />
    );

    expect(getByText('Out of AI credits')).toBeTruthy();
    expect(queryByText('0/50 used today')).toBeNull();
    expect(getByText('Renew to keep capturing by voice and text')).toBeTruthy();
  });

  it('puts an expired trial in the past tense', async () => {
    const { getByText, queryByText } = await render(
      <CreditStatusCard
        credits={summary({ ...emptyBalance, trial_expires_at: '2026-09-16T00:00:00Z' })}
        compact
      />
    );

    expect(getByText(/Free trial ended/)).toBeTruthy();
    expect(queryByText(/Trial expires/)).toBeNull();
  });

  it('keeps the future tense while the trial is still running', async () => {
    const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { getByText, queryByText } = await render(
      <CreditStatusCard credits={summary({ trial_expires_at: inAWeek })} />
    );

    expect(getByText(/Trial expires/)).toBeTruthy();
    expect(queryByText(/Free trial ended/)).toBeNull();
  });
});
