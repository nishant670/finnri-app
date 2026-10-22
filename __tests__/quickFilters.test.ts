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
});
