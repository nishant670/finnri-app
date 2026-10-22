import { fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  AskSuggestions,
  QuickFacts,
  ReviewsSection,
  StandsOut,
} from '@/components/insights/InsightsGlance';
import { categoryTrend } from '@/components/insights/insight-ui';
import { buildQuickFacts, glanceComparison, thisWeekRange } from '@/lib/insight-glance';
import * as insightsLib from '@/lib/insights';
import type { DashboardResponse } from '@/lib/insights';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), replace: jest.fn() },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));

const days = Array.from({ length: 12 }, (_, index) => ({
  date: `2026-10-${String(index + 1).padStart(2, '0')}`,
  amount: index === 4 ? 32550 : 1000,
  count: 1,
}));

const dashboard = {
  period: {
    start: '2026-10-01',
    end: '2026-10-12',
    comparison_label: 'Oct 1–12 vs Sep 1–12',
  },
  summary: {
    total_spent: 121311,
    total_income: 0,
    daily_average: 10109,
    transaction_count: 40,
    spend_change: 252,
    spend_change_comparable: true,
  },
  top_categories: [{ category: 'Bills', amount: 58150, percentage: 48, change: 24, change_comparable: true }],
  top_merchants: [],
  account_spending: [{ account_id: 1, account_name: 'Cash', amount: 58000, percentage: 48 }],
  budget_statuses: [],
  daily_spending: days,
  recent_transactions: [],
  review_items: [],
  insights: [
    { kind: 'top_merchant', severity: 'info', title: 'Noida flat led your spending', body: '₹32,550 in 1 payment' },
    { kind: 'unusual_spending', severity: 'warning', title: 'Rent was your largest single expense', body: '₹32,550 on 5 Oct' },
  ],
  recurring_candidates: [
    {
      candidate_key: 'wooden',
      label: 'Wooden street',
      merchant: 'Wooden street',
      category: 'Shopping',
      average_amount: 11253,
      interval_guess: 'monthly',
      confidence: 0.8,
      occurrences: 3,
      last_seen_date: '2026-10-09',
      next_expected_date: '2026-11-09',
      review_due: true,
    },
  ],
  largest_expense: {
    entry_id: 77,
    title: 'Rent',
    category: 'Rent',
    merchant: 'Landlord',
    amount: 32550,
    date: '2026-10-05',
  },
  overview: {
    has_history: true,
    months_tracked: 3,
    lifetime_spent: 0,
    lifetime_income: 0,
    lifetime_transaction_count: 0,
    average_monthly_spend: 0,
    typical_monthly_spend: 0,
    top_category_amount: 0,
    top_category_share: 0,
    recent_months: [
      { month: '2026-08', label: 'Aug', spent: 308665, income: 0, count: 40 },
      { month: '2026-09', label: 'Sep', spent: 61733, income: 0, count: 16 },
    ],
  },
} as unknown as DashboardResponse;

beforeEach(() => mockPush.mockClear());

describe('At a glance and quick facts (P29)', () => {
  it('works out the four facts from the dashboard', () => {
    const facts = buildQuickFacts(dashboard);
    expect(facts.map((fact) => [fact.label, fact.value, fact.caption])).toEqual([
      ['Last 7 days', '₹7,000', '6 – 12 Oct'],
      ['Biggest expense', '₹32,550', 'Rent · 5 Oct'],
      ['Top category', 'Bills', '₹58,150 · 48% of spend'],
      ['Paid most with', 'Cash', '48% of spend'],
    ]);
    expect(glanceComparison(dashboard)).toEqual({
      more: true,
      lead: '252% more',
      rest: 'than Sep 1–12',
    });
  });

  it('opens the biggest expense', async () => {
    const screen = await render(<QuickFacts dashboard={dashboard} />);
    await fireEvent.press(screen.getByLabelText('Biggest expense, ₹32,550, Rent · 5 Oct'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/entry/[id]', params: { id: '77' } });
  });
});

describe('What stands out (P30, P34)', () => {
  it('puts the warning first, asks about the suspected subscription, and tracks it', async () => {
    const track = jest
      .spyOn(insightsLib, 'trackRecurringCandidates')
      .mockResolvedValue({ tracked: [{}] } as never);
    const onChanged = jest.fn();
    const screen = await render(
      <StandsOut dashboard={dashboard} rangeLabel="October 2026" onChanged={onChanged} />
    );
    const titles = screen.getAllByText(/largest single expense|monthly payment|led your spending/);
    expect(titles.map((node) => node.props.children)).toEqual([
      'Rent was your largest single expense',
      'Looks like a monthly payment',
      'Noida flat led your spending',
    ]);
    await fireEvent.press(screen.getByText('Track it'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(track).toHaveBeenCalledWith('test-token', { candidate_keys: ['wooden'] });
  });

  it('marks one as not recurring', async () => {
    const save = jest.spyOn(insightsLib, 'saveRecurringCandidateDecision').mockResolvedValue({} as never);
    const onChanged = jest.fn();
    const screen = await render(
      <StandsOut dashboard={dashboard} rangeLabel="October 2026" onChanged={onChanged} />
    );
    await fireEvent.press(screen.getByText('Not recurring'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(save.mock.calls[0][1]).toMatchObject({ candidate_key: 'wooden', decision: 'dismissed' });
  });
});

describe('Ask Finnri suggestions (P32)', () => {
  it('asks the tapped question on the Ask screen', async () => {
    const screen = await render(<AskSuggestions monthName="October" />);
    expect(screen.getByText('Uses AI credits')).toBeTruthy();
    await fireEvent.press(screen.getByText('Where did my money go this week?'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/ask',
      params: { q: 'Where did my money go this week?' },
    });
  });
});

describe('Reviews (P31)', () => {
  it('opens this week from Monday, and names last month with its total', async () => {
    const screen = await render(<ReviewsSection dashboard={dashboard} />);
    await fireEvent.press(screen.getByText('This week'));
    const week = thisWeekRange();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/weekly-review',
      params: { start: week.start, end: week.end, label: 'This week' },
    });
  });

  it('starts the week on Monday', () => {
    expect(thisWeekRange(new Date(2026, 9, 14))).toMatchObject({
      start: '2026-10-12',
      end: '2026-10-14',
    });
  });
});

describe('Category change vs last month (P33)', () => {
  it('says which way it went, in the colour of the news', () => {
    expect(categoryTrend({ change: 24, change_comparable: true }, 'Sep 1–12')).toEqual({
      label: '↑ 24% vs Sep 1–12',
      tone: 'negative',
    });
    expect(categoryTrend({ change: -10, change_comparable: true }, 'Sep')?.tone).toBe('positive');
    expect(categoryTrend({ change: 40, change_comparable: false }, 'Sep')).toBeNull();
  });
});
