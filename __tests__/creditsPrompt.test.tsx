import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';

import AskFinnriScreen from '@/app/ask';
import { usePlansPrompt } from '@/hooks/use-plans-prompt';
import type { BillingPlan, BillingStatus } from '@/lib/billing';
import { blockedAIReason } from '@/lib/credit-gate';
import { ParseApiError } from '@/lib/parse';
import { recordPlansPrompt } from '@/lib/plans-prompt';

const mockPush = jest.fn();
const mockConfirm = jest.fn();
const mockAlert = jest.fn();
const mockAuth = { token: 'session-token', user: { is_guest: false } };
const mockParse = jest.fn();
const mockStatus = jest.fn();
const mockPlans = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => mockAuth }));
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => ({ confirm: mockConfirm, alert: mockAlert }),
}));
jest.mock('@/lib/parse', () => ({
  ...jest.requireActual('@/lib/parse'),
  parseEntryDraft: (...args: unknown[]) => mockParse(...args),
}));
jest.mock('@/lib/billing', () => ({
  ...jest.requireActual('@/lib/billing'),
  fetchBillingStatus: (...args: unknown[]) => mockStatus(...args),
  fetchBillingPlans: (...args: unknown[]) => mockPlans(...args),
}));
jest.mock('@/lib/plans-prompt', () => ({
  ...jest.requireActual('@/lib/plans-prompt'),
  recordPlansPrompt: jest.fn(),
}));

const weekly: BillingPlan = {
  code: 'weekly_pass',
  name: 'Weekly Pass',
  billing_interval: 'weekly',
  price_minor: 7900,
  currency: 'INR',
  included_credits: 800,
  daily_credit_limit: 200,
  requires_login: true,
  requires_prior_paid_months: 0,
  checkout_enabled: true,
  feature_gates: [],
};

const status = (overrides: Partial<BillingStatus> = {}): BillingStatus => ({
  subscription_status: 'free',
  credits: {
    total_credits_remaining: 0,
    daily_limit: 50,
    daily_credits_used: 0,
    daily_credits_remaining: 0,
    reset_at: '2026-10-09T00:00:00Z',
    trial_expires_at: '2026-09-16T00:00:00Z',
  },
  lifetime_eligibility: { eligible: false, paid_months_completed: 0, required_paid_months: 3 },
  ...overrides,
});

const outOfCredits = () =>
  new ParseApiError({ error: 'insufficient_ai_credits' }, 402, 'Out of credits');

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user.is_guest = false;
  mockConfirm.mockResolvedValue(false);
  mockPlans.mockResolvedValue([weekly]);
  mockStatus.mockResolvedValue(status());
});

describe('blockedAIReason', () => {
  it('tells a spent balance from a spent day, and ignores everything else', () => {
    expect(blockedAIReason(outOfCredits())).toBe('out_of_credits');
    expect(blockedAIReason(new ParseApiError({ error: 'daily_ai_limit_reached' }, 429, ''))).toBe(
      'daily_limit'
    );
    expect(blockedAIReason(new ParseApiError({ error: 'could_not_parse' }, 422, ''))).toBeNull();
    expect(blockedAIReason(new Error('offline'))).toBeNull();
  });
});

describe('offerForBlockedAI', () => {
  const hook = () =>
    renderHook(() =>
      usePlansPrompt({ token: 'session-token', isGuest: false, isBusy: () => false })
    );

  it('opens the plans sheet at once for someone with no pass running', async () => {
    const { result } = await hook();

    let shown = false;
    await act(async () => {
      shown = await result.current.offerForBlockedAI('out_of_credits');
    });

    expect(shown).toBe(true);
    expect(result.current.sheet.visible).toBe(true);
    expect(result.current.sheet.reason).toBe('out_of_credits');
    // Asked for, in effect — it must not count towards the sales cool-down.
    expect(recordPlansPrompt).not.toHaveBeenCalled();

    await act(async () => result.current.sheet.onClose());
    expect(recordPlansPrompt).not.toHaveBeenCalled();
  });

  it('does not sell a second pass to someone whose pass is still running', async () => {
    mockStatus.mockResolvedValue(
      status({
        plan: weekly,
        subscription_status: 'active',
        current_period_end: new Date(Date.now() + 3 * 86400000).toISOString(),
      })
    );
    const { result } = await hook();

    let shown = true;
    await act(async () => {
      shown = await result.current.offerForBlockedAI('out_of_credits');
    });

    expect(shown).toBe(false);
    expect(result.current.sheet.visible).toBe(false);
  });

  it('stays closed for a guest, who signs in rather than buys', async () => {
    const { result } = await renderHook(() =>
      usePlansPrompt({ token: 'session-token', isGuest: true, isBusy: () => false })
    );

    let shown = true;
    await act(async () => {
      shown = await result.current.offerForBlockedAI('out_of_credits');
    });

    expect(shown).toBe(false);
    expect(mockStatus).not.toHaveBeenCalled();
  });
});

describe('Ask Finnri out of credits', () => {
  const ask = async (question: string) => {
    const screen = await render(<AskFinnriScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Ask Finnri a question'), question);
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send question'));
    });
    return screen;
  };

  it('says why it could not answer, and offers credits on the spot', async () => {
    // The report: "That capture did not go through" — to a question — and no
    // way forward from it.
    mockParse.mockRejectedValue(outOfCredits());
    const screen = await ask('How much spent today?');

    await waitFor(() =>
      expect(
        screen.getByText('You are out of AI credits, so Finnri could not answer that.')
      ).toBeTruthy()
    );
    expect(screen.queryByText(/capture did not go through/)).toBeNull();
    await waitFor(() => expect(screen.getByText('You’re out of AI credits')).toBeTruthy());
  });

  it('asks a guest to sign in instead', async () => {
    mockAuth.user.is_guest = true;
    mockConfirm.mockResolvedValue(true);
    mockParse.mockRejectedValue(outOfCredits());
    await ask('How much spent today?');

    await waitFor(() =>
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Sign in for more AI credits' })
      )
    );
    expect(mockPush).toHaveBeenCalledWith('/auth?mode=link');
    expect(mockStatus).not.toHaveBeenCalled();
  });
});
