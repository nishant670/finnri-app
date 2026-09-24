import type { BillingStatus } from '@/lib/billing';
import { creditGateFor } from '@/lib/credit-gate';

/**
 * The bug: with a zero balance the microphone still opened, and the refusal
 * only arrived after the recording had been made and Process pressed.
 */
const status = (credits: Partial<BillingStatus['credits']>): Pick<BillingStatus, 'credits'> => ({
  credits: {
    total_credits_remaining: 800,
    daily_limit: 50,
    daily_credits_used: 10,
    daily_credits_remaining: 40,
    reset_at: '2026-09-26T00:00:00Z',
    trial_expires_at: null,
    ...credits,
  },
});

describe('creditGateFor', () => {
  it('lets a funded account through', () => {
    expect(creditGateFor(status({}), { isGuest: false })).toBeNull();
  });

  it('never blocks while the status is still loading', () => {
    expect(creditGateFor(null, { isGuest: false })).toBeNull();
  });

  it('blocks an empty balance and points at the plans', () => {
    const gate = creditGateFor(
      status({ total_credits_remaining: 0, daily_credits_remaining: 0 }),
      { isGuest: false }
    );

    expect(gate?.title).toBe('Out of AI credits');
    expect(gate?.action).toBe('upgrade');
    expect(gate?.message).toMatch(/Manual entry stays free/);
  });

  it('sends a guest to sign in rather than to a payment page', () => {
    const gate = creditGateFor(
      status({ total_credits_remaining: 0, daily_credits_remaining: 0 }),
      { isGuest: true }
    );

    expect(gate?.action).toBe('login');
    expect(gate?.title).toMatch(/guest AI credits/);
  });

  it('tells a spent daily cap apart from a spent balance', () => {
    const gate = creditGateFor(
      status({ total_credits_remaining: 600, daily_credits_used: 50, daily_credits_remaining: 0 }),
      { isGuest: false }
    );

    // Credits remain; they simply cannot be spent until tomorrow, so the
    // advice is to wait or type it in — not to buy anything.
    expect(gate?.title).toBe("Today's AI credits are used up");
    expect(gate?.message).toMatch(/come back tomorrow/);
  });

  it('ignores the daily cap when the plan has none', () => {
    expect(
      creditGateFor(status({ daily_limit: 0, daily_credits_remaining: 0 }), { isGuest: false })
    ).toBeNull();
  });
});
