import { fireEvent, render, waitFor } from '@testing-library/react-native';

import BillingScreen from '@/app/billing';
import { PlansOfferSheet } from '@/components/billing/PlansOfferSheet';
import * as billing from '@/lib/billing';
import type { BillingPlan, BillingStatus } from '@/lib/billing';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  };
});
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'test-token', user: { is_guest: false } }),
}));
// One dialog for the whole file: a new object per render would change the
// screen's load callback every render and reload it forever.
const mockDialog = { confirm: jest.fn().mockResolvedValue(false), alert: jest.fn() };
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => mockDialog,
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

const offer = (price: number, original: number) => ({
  code: 'launch_75',
  label: 'Launch offer',
  percent_off: 75,
  price_minor: price,
  original_price_minor: original,
  ends_at: '2027-01-04T00:00:00Z',
});

const plan = (code: string, interval: string, price: number, credits: number): BillingPlan => ({
  code,
  name: code === 'weekly_pass' ? 'Weekly Pass' : code[0].toUpperCase() + code.slice(1),
  billing_interval: interval,
  price_minor: price,
  currency: 'INR',
  included_credits: credits,
  daily_credit_limit: 250,
  requires_login: true,
  requires_prior_paid_months: 0,
  checkout_enabled: true,
  feature_gates: [],
  offer: offer(Math.floor((price * 25) / 100 / 100) * 100, price),
});

const plans = [
  plan('weekly_pass', 'weekly', 7900, 800),
  plan('monthly', 'monthly', 14900, 3600),
  plan('quarterly', 'quarterly', 32900, 11000),
  plan('yearly', 'yearly', 79900, 48000),
];

const status = (eligible = true, spotsLeft?: number): BillingStatus => ({
  subscription_status: 'free',
  credits: {
    total_credits_remaining: 12,
    daily_limit: 50,
    daily_credits_used: 0,
    daily_credits_remaining: 50,
    reset_at: '',
  },
  lifetime_eligibility: { eligible: false, paid_months_completed: 0, required_paid_months: 3 },
  launch_offer: {
    active: true,
    eligible,
    code: 'launch_75',
    label: 'Launch offer',
    percent_off: 75,
    spots_left: spotsLeft ?? null,
  },
});

describe('PlansOfferSheet', () => {
  it('opens on the monthly plan at the launch price and hands back the choice', async () => {
    const onChoose = jest.fn();
    const { findByTestId, findByText, getByText } = await render(
      <PlansOfferSheet
        visible
        plans={plans}
        status={status(true, 37)}
        reason="low_credits"
        onChoose={onChoose}
        onClose={jest.fn()}
      />
    );

    await findByTestId('plans-offer-badge');
    await findByText('Running low on AI credits');
    await findByText('Only 37 launch spots left');
    expect(getByText('MOST POPULAR')).toBeTruthy();
    expect(getByText('₹149')).toBeTruthy(); // struck through
    await findByText(/Get Monthly for ₹37/);

    await fireEvent.press(await findByTestId('plans-offer-card-yearly'));
    await findByText(/Get Yearly for ₹199/);
    await fireEvent.press(await findByTestId('plans-offer-cta'));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ code: 'yearly' }));
  });

  it('shows regular prices to someone who has used the launch price', async () => {
    const { findByText, queryByTestId } = await render(
      <PlansOfferSheet
        visible
        plans={plans}
        status={status(false)}
        reason="no_plan"
        onChoose={jest.fn()}
        onClose={jest.fn()}
      />
    );
    await findByText(/Get Monthly for ₹149/);
    expect(queryByTestId('plans-offer-badge')).toBeNull();
  });
});

describe('Plans screen with the launch offer', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockParams = {};
    jest.spyOn(billing, 'fetchBillingPlans').mockResolvedValue(plans);
    jest.spyOn(billing, 'fetchBillingStatus').mockResolvedValue(status());
  });

  it('strikes through today’s price and quotes the launch price', async () => {
    const { findByTestId, findByText } = await render(<BillingScreen />);
    await findByTestId('launch-offer-banner');
    expect((await findByTestId('plan-original-price-monthly')).props.children).toBe('₹149');
    expect((await findByTestId('plan-offer-price-monthly')).props.children).toBe('₹37');
    await findByText('Continue to pay ₹37');
  });

  it('starts checkout for the plan chosen in the Home pop-up', async () => {
    mockParams = { checkout: 'monthly' };
    const checkout = jest.spyOn(billing, 'createBillingCheckout').mockResolvedValue({
      provider: 'razorpay',
      order_id: 'order_1',
      key_id: 'rzp',
      amount_minor: 3700,
      currency: 'INR',
      plan_code: 'monthly',
      plan_name: 'Monthly',
      payment_id: 1,
    });
    await render(<BillingScreen />);
    await waitFor(() => expect(checkout).toHaveBeenCalledWith('test-token', 'monthly'));
    expect(checkout).toHaveBeenCalledTimes(1);
  });
});
