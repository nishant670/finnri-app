import type { DashboardResponse, InsightCard } from '@/lib/insights';
import {
  getBurnRateCopy,
  getInsightLevel,
  getNeedsReview,
  getPeriodPulse,
  getReviewReasons,
  getTopTakeaway,
  insightDetailParams,
} from '@/lib/insight-summary';

type Entry = DashboardResponse['recent_transactions'][number];

const entry = (over: Partial<Entry> = {}) =>
  ({ id: 1, category: 'Food & Drinks', account_id: 3, ...over }) as Entry;

const dashboard = (over: Record<string, unknown> = {}) =>
  ({
    summary: {
      total_income: 0,
      total_spent: 0,
      daily_average: 0,
      transaction_count: 0,
      lifetime_transaction_count: undefined,
    },
    period: { start: '2026-10-01', end: '2026-10-31' },
    insights: [],
    review_items: [],
    recent_transactions: [],
    top_categories: [],
    top_merchants: [],
    account_spending: [],
    recurring_candidates: [],
    ...over,
  }) as unknown as DashboardResponse;

const summary = (over: Record<string, number | undefined>) =>
  dashboard({ summary: { ...dashboard().summary, ...over } });

describe('getInsightLevel', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [9, 2],
    [10, 3],
    [29, 3],
    [30, 4],
    [500, 4],
  ])('maps %i transactions to level %i', (count, level) => {
    expect(getInsightLevel(summary({ transaction_count: count }))).toBe(level);
  });

  it('prefers the lifetime count over the period count', () => {
    expect(getInsightLevel(summary({ transaction_count: 0, lifetime_transaction_count: 40 }))).toBe(
      4
    );
  });
});

describe('getBurnRateCopy', () => {
  it('asks for more data when there is no daily average', () => {
    expect(getBurnRateCopy(summary({ daily_average: 0 }))).toMatch(/Add more transactions/);
  });

  it('estimates how many days a surplus covers', () => {
    const copy = getBurnRateCopy(
      summary({ total_income: 10000, total_spent: 4000, daily_average: 200 })
    );
    expect(copy).toContain('~30 more days');
  });

  it('never says fewer than one day', () => {
    const copy = getBurnRateCopy(
      summary({ total_income: 4010, total_spent: 4000, daily_average: 5000 })
    );
    expect(copy).toContain('~1 more days');
  });

  it('says spending has caught up when it matches or exceeds income', () => {
    expect(
      getBurnRateCopy(summary({ total_income: 1000, total_spent: 1000, daily_average: 50 }))
    ).toMatch(/caught up/);
  });
});

describe('getPeriodPulse', () => {
  it('waits for data when the period is empty, even if reviews exist', () => {
    expect(getPeriodPulse(summary({ transaction_count: 0 }), 4).label).toBe('Waiting for data');
  });

  it('puts review cleanup ahead of the money verdicts, with a pluralised reason', () => {
    const one = getPeriodPulse(summary({ transaction_count: 5, total_income: 10 }), 1);
    const many = getPeriodPulse(summary({ transaction_count: 5, total_income: 10 }), 3);
    expect(one.label).toBe('Needs review');
    expect(one.reason).toBe('1 transaction need category or account cleanup.');
    expect(many.reason).toBe('3 transactions need category or account cleanup.');
  });

  it('flags expenses with no income', () => {
    expect(
      getPeriodPulse(summary({ transaction_count: 2, total_income: 0, total_spent: 90 }), 0).label
    ).toBe('No income recorded');
  });

  it('counts investments as money out', () => {
    const pulse = getPeriodPulse(
      summary({
        transaction_count: 2,
        total_income: 100,
        total_spent: 20,
        money_out: 220,
      }),
      0
    );
    expect(pulse.label).toBe('Spending ahead of income');
  });

  it('is on track when income exceeds what left', () => {
    const pulse = getPeriodPulse(
      summary({ transaction_count: 2, total_income: 500, total_spent: 100 }),
      0
    );
    expect(pulse).toMatchObject({ label: 'On track', color: '#00B878' });
  });
});

describe('getNeedsReview', () => {
  it('uses the API review items when there are any', () => {
    const api = [entry({ id: 9 })];
    expect(getNeedsReview(dashboard({ review_items: api, recent_transactions: [entry()] }))).toBe(
      api
    );
  });

  it('otherwise falls back to recent transactions missing a category or account', () => {
    const rows = [
      entry({ id: 1 }),
      entry({ id: 2, category: '' }),
      entry({ id: 3, category: ' Uncategorized ' }),
      entry({ id: 4, account_id: undefined }),
      entry({ id: 5, category: null as unknown as string }),
    ];
    const ids = getNeedsReview(dashboard({ recent_transactions: rows })).map((e) => e.id);
    expect(ids).toEqual([2, 3, 4, 5]);
  });
});

describe('getReviewReasons', () => {
  it('names a missing category', () => {
    expect(getReviewReasons(entry({ category: '' })).map((r) => r.label)).toEqual([
      'Missing category',
    ]);
  });

  it('distinguishes uncategorized from missing', () => {
    expect(getReviewReasons(entry({ category: 'uncategorized' }))[0].label).toBe('Uncategorized');
  });

  it('lists both problems together', () => {
    expect(
      getReviewReasons(entry({ category: '', account_id: undefined })).map((r) => r.label)
    ).toEqual(['Missing category', 'Missing account']);
  });

  it('falls back to a generic reason', () => {
    expect(getReviewReasons(entry())).toEqual([{ label: 'Needs review', icon: 'playlist-check' }]);
  });
});

describe('getTopTakeaway', () => {
  it('leads with review cleanup', () => {
    const t = getTopTakeaway(dashboard(), 2);
    expect(t).toMatchObject({ eyebrow: 'Fix first', title: '2 transactions need review' });
    expect(t.promotedKind).toBeNull();
  });

  it('promotes the first warning insight and reports its kind', () => {
    const t = getTopTakeaway(
      dashboard({
        insights: [
          { kind: 'a', severity: 'info', title: 'fine', body: '' },
          { kind: 'budget_risk', severity: 'warning', title: 'Dining is over', body: 'Careful' },
        ],
      }),
      0
    );
    expect(t).toMatchObject({
      eyebrow: 'Worth attention',
      title: 'Dining is over',
      promotedKind: 'budget_risk',
    });
  });

  it('names the main spending driver when nothing is wrong', () => {
    const t = getTopTakeaway(
      dashboard({ top_categories: [{ category: 'Travel', percentage: 41.6, amount: 5000 }] }),
      0
    );
    expect(t.eyebrow).toBe('Main driver');
    expect(t.title).toBe('Travel is 42% of spend');
  });

  it('falls back to the daily pace', () => {
    expect(getTopTakeaway(summary({ daily_average: 120 }), 0)).toMatchObject({
      eyebrow: 'Spending pace',
      icon: 'speedometer',
    });
  });
});

describe('insightDetailParams', () => {
  const card = (over: Partial<InsightCard>) =>
    ({ kind: 'x', severity: 'info', title: 'T', body: 'B', ...over }) as InsightCard;

  it('always carries the card text and period', () => {
    expect(insightDetailParams(card({}), dashboard(), 'October 2026')).toEqual({
      kind: 'x',
      severity: 'info',
      title: 'T',
      body: 'B',
      start: '2026-10-01',
      end: '2026-10-31',
      label: 'October 2026',
    });
  });

  it('resolves a category increase from the title when the card has no category', () => {
    const d = dashboard({ top_categories: [{ category: 'Dining', percentage: 1, amount: 1 }] });
    const p = insightDetailParams(
      card({ kind: 'category_increase', title: 'dining increased' }),
      d,
      'x'
    );
    expect(p.category).toBe('Dining');
  });

  it('serialises numeric fields as strings', () => {
    const p = insightDetailParams(
      card({ budget_id: 7, amount: 120, limit_amount: 500, percentage: 24, change_percentage: -3 }),
      dashboard(),
      'x'
    );
    expect(p).toMatchObject({
      budgetId: '7',
      amount: '120',
      limitAmount: '500',
      percentage: '24',
      change: '-3',
    });
  });

  it('looks up the merchant for a top-merchant card', () => {
    const d = dashboard({ top_merchants: [{ merchant: 'Zomato' }] });
    expect(insightDetailParams(card({ kind: 'top_merchant' }), d, 'x').merchant).toBe('Zomato');
  });

  it('fills the account name and id for an account-usage card', () => {
    const d = dashboard({ account_spending: [{ account_id: 4, account_name: 'HDFC' }] });
    const p = insightDetailParams(card({ kind: 'account_usage', account_id: 4 }), d, 'x');
    expect(p).toMatchObject({ accountName: 'HDFC', accountId: '4' });
  });

  it('takes the first recurring candidate when the card names no merchant', () => {
    const d = dashboard({ recurring_candidates: [{ merchant: 'Netflix', category: 'Fun' }] });
    const p = insightDetailParams(card({ kind: 'recurring_candidate' }), d, 'x');
    expect(p).toMatchObject({ merchant: 'Netflix', category: 'Fun' });
  });

  it('digs an amount out of an unusual-spending body', () => {
    const p = insightDetailParams(
      card({ kind: 'unusual_spending', body: 'A charge of ₹12,500 stood out' }),
      dashboard(),
      'x'
    );
    expect(p.amount).toBe('12500');
  });
});
