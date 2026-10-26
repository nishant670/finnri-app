import type { BillingStatus } from '@/lib/billing';
import { creditBlockFor, creditBlockLifted, creditGateFor } from '@/lib/credit-gate';

/**
 * The bugs: with a zero balance the microphone still opened, and the refusal
 * only arrived after the recording had been made and Process pressed. Then a
 * guest with 15 credits left today could still open the camera for a 25-credit
 * bill scan, and was told afterwards they had "used all 15".
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
    expect(creditGateFor(status({}), { isGuest: false, kind: 'text' })).toBeNull();
  });

  it('never blocks while the status is still loading', () => {
    expect(creditGateFor(null, { isGuest: false, kind: 'text' })).toBeNull();
  });

  it('blocks an empty balance and points at the plans', () => {
    const gate = creditGateFor(status({ total_credits_remaining: 0, daily_credits_remaining: 0 }), {
      isGuest: false,
      kind: 'text',
    });

    expect(gate?.title).toBe('Out of AI credits');
    expect(gate?.action).toBe('upgrade');
    expect(gate?.message).toMatch(/Manual entry stays free/);
  });

  it('sends a guest to sign in rather than to a payment page', () => {
    const gate = creditGateFor(status({ total_credits_remaining: 0, daily_credits_remaining: 0 }), {
      isGuest: true,
      kind: 'text',
    });

    expect(gate?.action).toBe('login');
    expect(gate?.title).toMatch(/guest AI credits/);
  });

  it('tells a spent daily cap apart from a spent balance', () => {
    const gate = creditGateFor(
      status({ total_credits_remaining: 600, daily_credits_used: 50, daily_credits_remaining: 0 }),
      { isGuest: false, kind: 'text' }
    );

    // Credits remain; they simply cannot be spent until tomorrow, so the
    // advice is to wait or type it in — not to buy anything.
    expect(gate?.title).toBe("Today's AI credits are used up");
    expect(gate?.message).toMatch(/come back tomorrow/);
    expect(gate?.reason).toBe('daily_limit');
  });

  it('stops a bill scan before the camera when today has less than it costs', () => {
    const today = status({ daily_credits_used: 35, daily_credits_remaining: 15 });

    expect(creditGateFor(today, { isGuest: false, kind: 'text' })).toBeNull();
    const gate = creditGateFor(today, { isGuest: true, kind: 'receipt' });
    expect(gate?.title).toBe('Not enough AI credits left today');
    expect(gate?.message).toMatch(/^A bill scan needs 25 credits and you have 15 left today\./);
    expect(gate?.message).not.toMatch(/used all/);
    expect(gate?.action).toBe('login');
  });

  it('prices captures from the server when it says', () => {
    const cheap = status({
      daily_credits_remaining: 15,
      capture_credits: { text: 5, voice: 12, receipt: 10 },
    });
    expect(creditGateFor(cheap, { isGuest: false, kind: 'receipt' })).toBeNull();
  });

  it('asks for a pass when the balance cannot cover the capture, whatever is left today', () => {
    const gate = creditGateFor(status({ total_credits_remaining: 20 }), {
      isGuest: false,
      kind: 'receipt',
    });

    expect(gate?.title).toBe('AI credits are low');
    expect(gate?.message).toMatch(/^A bill scan needs 25 credits and you have 20 left\./);
    expect(gate?.action).toBe('upgrade');
    expect(gate?.reason).toBe('out_of_credits');
  });

  it('ignores the daily cap when the plan has none', () => {
    expect(
      creditGateFor(status({ daily_limit: 0, daily_credits_remaining: 0 }), {
        isGuest: false,
        kind: 'text',
      })
    ).toBeNull();
  });
});

/**
 * The bug: someone out of credits was gifted a pass. The footnote under Home's
 * "Out of AI credits" card updated to "3600 total credits left", but the card
 * itself stayed until the app was restarted.
 */
describe('creditBlockLifted', () => {
  const empty = status({ total_credits_remaining: 0, daily_limit: 50, daily_credits_remaining: 0 });

  it('lifts once a gifted pass brings the balance back', () => {
    const block = creditBlockFor(empty, 5);
    const gifted = status({ total_credits_remaining: 3600, daily_limit: 250, daily_credits_remaining: 250 });
    expect(creditBlockLifted(block, gifted)).toBe(true);
  });

  it('holds while nothing has changed, even if the app thinks it is enough', () => {
    // A long voice clip: the server wanted 40, the app only knows the 12-credit
    // shortest-clip price, and the balance has not moved.
    const thirty = status({ total_credits_remaining: 30, daily_credits_remaining: 30 });
    expect(creditBlockLifted(creditBlockFor(thirty, 40), thirty)).toBe(false);
  });

  it('holds when credits came in but still not enough for what was refused', () => {
    const block = creditBlockFor(empty, 25);
    expect(creditBlockLifted(block, status({ total_credits_remaining: 20, daily_credits_remaining: 20 }))).toBe(false);
  });

  it("lifts a daily-limit refusal when tomorrow's allowance arrives", () => {
    const usedUp = status({ total_credits_remaining: 900, daily_limit: 50, daily_credits_remaining: 0 });
    const tomorrow = status({ total_credits_remaining: 900, daily_limit: 50, daily_credits_remaining: 50 });
    expect(creditBlockLifted(creditBlockFor(usedUp, 5), tomorrow)).toBe(true);
  });

  it('never lifts without a billing status', () => {
    expect(creditBlockLifted(creditBlockFor(empty, 5), null)).toBe(false);
  });
});
