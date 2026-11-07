import {
  applyQuickFilter,
  describeFilters,
  emptyFilterState,
  isQuickFilterSelected,
  withoutQuickFilterChips,
} from '@/lib/transaction-filters';

const now = new Date(2026, 9, 22);

describe('Quick filters (P12)', () => {
  it('starts on All', () => {
    expect(isQuickFilterSelected('all', emptyFilterState, now)).toBe(true);
  });

  it('switches the type and takes it back off on a second tap', () => {
    const income = applyQuickFilter('income', emptyFilterState, now);
    expect(income.type).toBe('Income');
    expect(isQuickFilterSelected('all', income, now)).toBe(false);
    const expenses = applyQuickFilter('expenses', income, now);
    expect(expenses.type).toBe('Expense');
    expect(applyQuickFilter('expenses', expenses, now).type).toBe('All');
  });

  it('adds this month on top of a type, and All clears both', () => {
    const both = applyQuickFilter('this-month', applyQuickFilter('expenses', emptyFilterState, now), now);
    expect(both).toMatchObject({ type: 'Expense', startDate: '2026-10-01', endDate: '2026-10-22' });
    expect(isQuickFilterSelected('this-month', both, now)).toBe(true);
    const all = applyQuickFilter('all', both, now);
    expect(all).toMatchObject({ type: 'All', startDate: null, endDate: null });
  });

  it('leaves out the applied chips the quick filters already show', () => {
    const state = { ...applyQuickFilter('this-month', emptyFilterState, now), type: 'Income' as const, category: 'Salary' };
    const keys = withoutQuickFilterChips(describeFilters(state), state, now).map((chip) => chip.key);
    expect(keys).toEqual(['category']);
  });

  it('counts a link to the whole month as This month, and a tap takes it off', () => {
    // A category-in-October link sends the month's last day, not today.
    const linked = { ...emptyFilterState, category: 'Food & Drinks', startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(isQuickFilterSelected('this-month', linked, now)).toBe(true);
    expect(isQuickFilterSelected('all', linked, now)).toBe(false);
    const keys = withoutQuickFilterChips(describeFilters(linked), linked, now).map((chip) => chip.key);
    expect(keys).toEqual(['category']);
    const off = applyQuickFilter('this-month', linked, now);
    expect(off.startDate).toBeNull();
    expect(off.endDate).toBeNull();
    expect(off.category).toBe('Food & Drinks');
  });

  it('does not count last month or a range that stops before today', () => {
    const lastMonth = { ...emptyFilterState, startDate: '2026-09-01', endDate: '2026-09-30' };
    expect(isQuickFilterSelected('this-month', lastMonth, now)).toBe(false);
    const firstWeek = { ...emptyFilterState, startDate: '2026-10-01', endDate: '2026-10-07' };
    expect(isQuickFilterSelected('this-month', firstWeek, now)).toBe(false);
  });
});
