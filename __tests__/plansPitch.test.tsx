import { render } from '@testing-library/react-native';

import BillingScreen from '@/app/billing';
import * as billing from '@/lib/billing';
import { aiRecap, aiRecapLine, passInWords, type AIUsageEvent, type BillingPlan, type BillingStatus } from '@/lib/billing';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  };
});
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'test-token', user: { is_guest: false } }),
}));
const mockDialog = { confirm: jest.fn().mockResolvedValue(false), alert: jest.fn() };
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => mockDialog,
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

const event = (over: Partial<AIUsageEvent>): AIUsageEvent => ({
  id: 1,
  request_id: 'r',
  action_code: 'transaction_parse_text',
  input_kind: 'text',
  status: 'succeeded',
  estimated_credits: 5,
  reserved_credits: 5,
  final_credits: 5,
  started_at: '2026-11-01T10:00:00Z',
  ...over,
});

describe('passInWords', () => {
  it('says a pass as each kind of read, joined with "or"', () => {
    expect(passInWords(3600, { text: 5, voice: 12, receipt: 25 })).toBe(
      'about 720 typed entries, 300 voice entries or 144 bill scans'
    );
  });

  it('leaves out what the credits cannot buy once, and says nothing for none', () => {
    expect(passInWords(20, { text: 5, voice: 12, receipt: 25 })).toBe('about 4 typed entries or 1 voice entry');
    expect(passInWords(0, { text: 5, voice: 12, receipt: 25 })).toBeNull();
  });
});

describe('aiRecap', () => {
  it('counts only reads that worked, and captures only once they became entries', () => {
    const recap = aiRecap([
      event({ id: 1, entry_id: 10 }),
      event({ id: 2, action_code: 'transaction_parse_voice_short', input_kind: 'voice', entry_id: 11 }),
      event({ id: 3 }), // a draft thrown away
      event({ id: 4, action_code: 'transaction_parse_receipt' }),
      event({ id: 5, action_code: 'statement_pdf_read' }),
      event({ id: 6, intent: 'question' }),
      event({ id: 7, action_code: 'transaction_parse_receipt', status: 'failed_before_provider' }),
    ]);
    expect(recap).toEqual({ entries: 2, bills: 1, statements: 1, questions: 1 });
    expect(aiRecapLine(recap)).toBe('filled in 2 entries, read 1 bill, read 1 statement and answered 1 question');
  });

  it('has nothing to say when nothing worked', () => {
    expect(aiRecapLine(aiRecap([event({ status: 'failed_after_provider' })]))).toBeNull();
  });
});

const monthly: BillingPlan = {
  code: 'monthly',
  name: 'Monthly',
  billing_interval: 'monthly',
  price_minor: 14900,
  currency: 'INR',
  included_credits: 3600,
  daily_credit_limit: 250,
  requires_login: true,
  requires_prior_paid_months: 0,
  checkout_enabled: true,
  feature_gates: [],
};

const trialStatus: BillingStatus = {
  subscription_status: 'free',
  credits: {
    total_credits_remaining: 120,
    daily_limit: 50,
    daily_credits_used: 0,
    daily_credits_remaining: 50,
    reset_at: '',
    trial_expires_at: '2099-01-01T00:00:00Z',
    capture_credits: { text: 5, voice: 12, voice_max: 18, receipt: 25, statement_pdf: 50 },
  },
  lifetime_eligibility: { eligible: false, paid_months_completed: 0, required_paid_months: 3 },
};

describe('Plans screen pitch', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(billing, 'fetchBillingPlans').mockResolvedValue([monthly]);
  });

  it('says what credits do, what a pass buys, what stays free, and what AI did so far', async () => {
    jest.spyOn(billing, 'fetchBillingStatus').mockResolvedValue(trialStatus);
    jest.spyOn(billing, 'fetchAIUsage').mockResolvedValue({
      events: [event({ id: 1, entry_id: 10 }), event({ id: 2, action_code: 'transaction_parse_receipt' })],
      page: 1,
      page_size: 100,
      total: 2,
    });
    const ui = await render(<BillingScreen />);

    expect(await ui.findByText('So far, Finnri AI filled in 1 entry and read 1 bill for you')).toBeTruthy();
    expect(ui.getByText('A pass lets AI do the typing')).toBeTruthy();
    expect(ui.getByTestId('credit-uses')).toBeTruthy();
    expect(ui.getByText('12–18 credits')).toBeTruthy();
    expect(ui.getByText('50 credits')).toBeTruthy();
    expect(ui.getByTestId('selected-pass-in-words')).toHaveTextContent(
      'Monthly is about 720 typed entries, 300 voice entries or 144 bill scans.'
    );
    expect(ui.getByText('Budgets, insights and reminders')).toBeTruthy();
    expect(ui.getByText('Trial')).toBeTruthy();
    expect(ui.queryByText('Every pass includes')).toBeNull();
  });

  it('leaves the recap out for someone already on a pass', async () => {
    jest.spyOn(billing, 'fetchBillingStatus').mockResolvedValue({
      ...trialStatus,
      plan: monthly,
      subscription_status: 'active',
      current_period_end: '2099-01-01T00:00:00Z',
    });
    jest.spyOn(billing, 'fetchAIUsage').mockResolvedValue({
      events: [event({ id: 1, entry_id: 10 })],
      page: 1,
      page_size: 100,
      total: 1,
    });
    const ui = await render(<BillingScreen />);

    expect(await ui.findByText('A pass lets AI do the typing')).toBeTruthy();
    expect(ui.queryByTestId('ai-recap')).toBeNull();
  });
});
