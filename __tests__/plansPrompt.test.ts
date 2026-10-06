import { planOffer, type BillingPlan, type BillingStatus } from '@/lib/billing';
import { plansPromptCooldown, shouldShowPlansPrompt } from '@/lib/plans-prompt';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 6, 10);

const status = (overrides: Partial<BillingStatus> = {}, credits = 300): BillingStatus => ({
  subscription_status: 'free',
  credits: {
    total_credits_remaining: credits,
    daily_limit: 50,
    daily_credits_used: 0,
    daily_credits_remaining: 50,
    reset_at: '',
  },
  lifetime_eligibility: { eligible: false, paid_months_completed: 0, required_paid_months: 3 },
  ...overrides,
});

const decide = (input: Partial<Parameters<typeof shouldShowPlansPrompt>[0]> = {}) =>
  shouldShowPlansPrompt({
    status: status(),
    isGuest: false,
    shownThisSession: false,
    memory: { dismissals: 0 },
    now,
    ...input,
  });

describe('shouldShowPlansPrompt', () => {
  it('offers plans to a signed-in user with no plan', () => {
    expect(decide()).toBe('no_plan');
  });

  it('leads with low credits when they are nearly gone, even on a paid plan', () => {
    expect(decide({ status: status({ subscription_status: 'active' }, 10) })).toBe('low_credits');
  });

  it('leaves a paying user with credits alone, and never shows to guests', () => {
    expect(decide({ status: status({ subscription_status: 'active' }) })).toBeNull();
    expect(decide({ isGuest: true })).toBeNull();
    expect(decide({ status: null })).toBeNull();
  });

  it('shows at most once a session', () => {
    expect(decide({ shownThisSession: true })).toBeNull();
  });

  it('waits longer after each dismissal, and less when credits are low', () => {
    const memory = { lastShownAt: now - 4 * DAY, dismissals: 1 };
    expect(decide({ memory })).toBeNull(); // 6-day wait after one dismissal
    expect(decide({ memory: { ...memory, lastShownAt: now - 7 * DAY } })).toBe('no_plan');
    expect(decide({ memory, status: status({}, 10) })).toBe('low_credits'); // halved to 3 days
    expect(plansPromptCooldown(10, 'no_plan')).toBe(21 * DAY);
  });
});

describe('planOffer', () => {
  const plan = {
    code: 'monthly',
    offer: {
      code: 'launch_75',
      label: 'Launch offer',
      percent_off: 75,
      price_minor: 3700,
      original_price_minor: 14900,
      ends_at: '2027-01-01T00:00:00Z',
    },
  } as BillingPlan;

  it('applies while the user is still eligible', () => {
    const live = status({
      launch_offer: {
        active: true,
        eligible: true,
        code: 'launch_75',
        label: 'Launch offer',
        percent_off: 75,
      },
    });
    expect(planOffer(plan, live)?.price_minor).toBe(3700);
    expect(planOffer(plan)?.price_minor).toBe(3700);
  });

  it('is gone once used or sold out', () => {
    const used = status({
      launch_offer: {
        active: true,
        eligible: false,
        code: 'launch_75',
        label: 'Launch offer',
        percent_off: 75,
      },
    });
    expect(planOffer(plan, used)).toBeNull();
    expect(planOffer(plan, status())).toBeNull();
  });
});
