import { moneyOutOf, type DashboardSummary } from '@/lib/insights';

const summary = (overrides: Partial<DashboardSummary>): DashboardSummary => ({
  total_spent: 1000,
  total_income: 50000,
  daily_average: 33,
  transaction_count: 4,
  ...overrides,
});

describe('moneyOutOf', () => {
  it('counts investments as money leaving the account', () => {
    expect(moneyOutOf(summary({ total_invested: 7000, money_out: 8000 }))).toBe(8000);
  });

  it('falls back to spent on an older API, where spent already includes investments', () => {
    expect(moneyOutOf(summary({}))).toBe(1000);
  });
});
