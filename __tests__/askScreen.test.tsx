import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AskFinnriScreen from '@/app/ask';
import { describeThreadAnswer } from '@/components/home/AnswerCard';
import type { LedgerAnswer } from '@/lib/parse';

const mockParse = jest.fn();
const mockOpenTransactions = jest.fn();

let mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'session-token', user: { is_guest: false } }),
}));
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => ({ confirm: jest.fn(), alert: jest.fn() }),
}));
jest.mock('@/lib/parse', () => ({
  ...jest.requireActual('@/lib/parse'),
  parseEntryDraft: (...args: unknown[]) => mockParse(...args),
}));
jest.mock('@/lib/billing', () => ({
  ...jest.requireActual('@/lib/billing'),
  fetchBillingStatus: jest.fn(),
  fetchBillingPlans: jest.fn(),
}));
// The answer fades in; the test renderer has no reanimated presets to run.
jest.mock('@/hooks/use-motion', () => ({
  useMotion: () => ({ reduced: true, duration: () => 0, exitDuration: () => 0 }),
}));
jest.mock('@/lib/transaction-links', () => ({
  openAnswerTransactions: (...args: unknown[]) => mockOpenTransactions(...args),
  openAnswerEntry: jest.fn(),
}));

const answer = (overrides: Partial<LedgerAnswer> = {}): LedgerAnswer => ({
  status: 'answered',
  metric: 'spend_total',
  amount: 19916,
  currency: 'INR',
  transaction_count: 14,
  subject: '',
  entry_type: 'expense',
  period: { kind: 'this_month', label: 'this month' },
  breakdown: [],
  filters: { start_date: '2026-10-01', end_date: '2026-10-21' },
  suggestions: [],
  ...overrides,
});

describe('Ask Finnri (boards R12-AskEmpty, R12-AskAnswer)', () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockParams = {};
  });

  it('opens on the starter questions, drawn in ink rather than orange', async () => {
    const screen = await render(<AskFinnriScreen />);
    expect(screen.getByText('Ask about your money')).toBeTruthy();
    expect(screen.getByText('Try asking')).toBeTruthy();
    expect(screen.getByText('How much did I spend this month?')).toBeTruthy();
  });

  it('answers in the thread without repeating the question or offering to close it', async () => {
    mockParse.mockResolvedValue({ stage: 'answer', answer: answer() });
    const screen = await render(<AskFinnriScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('How much did I spend this month?'));
    });

    await waitFor(() => expect(screen.getByText('Spent this month')).toBeTruthy());
    // Once, in the user's own bubble — not again, in quotes, inside the answer.
    expect(screen.getAllByText(/How much did I spend this month\?/)).toHaveLength(1);
    expect(screen.queryByLabelText('Dismiss answer')).toBeNull();
    expect(screen.getByText('from 14 transactions')).toBeTruthy();

    await fireEvent.press(screen.getByText('See the 14 transactions'));
    expect(mockOpenTransactions).toHaveBeenCalledTimes(1);
  });
});

describe('describeThreadAnswer', () => {
  it('puts the measure and window above the number and what was counted below', () => {
    expect(describeThreadAnswer(answer())).toEqual({
      label: 'Spent this month',
      detail: 'from 14 transactions',
    });
    expect(describeThreadAnswer(answer({ subject: 'Food & Drinks', transaction_count: 1 }))).toEqual({
      label: 'Spent this month',
      detail: 'Food & Drinks · from 1 transaction',
    });
    expect(describeThreadAnswer(answer({ metric: 'count', transaction_count: 3 })).detail).toBe('');
  });

  it('asks a question handed over from Insights once (P32)', async () => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ stage: 'answer', answer: answer() });
    mockParams = { q: 'My biggest expenses this month' };
    const screen = await render(<AskFinnriScreen />);

    await waitFor(() => expect(mockParse).toHaveBeenCalledTimes(1));
    expect(mockParse.mock.calls[0][0]).toMatchObject({
      hintText: 'My biggest expenses this month',
    });
    await screen.rerender(<AskFinnriScreen />);
    expect(mockParse).toHaveBeenCalledTimes(1);
    mockParams = {};
  });
});
