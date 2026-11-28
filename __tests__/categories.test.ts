import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  DEFAULT_INCOME_CATEGORY,
  INCOME_CATEGORIES,
  categoryOptionsFor,
  categoryVisual,
  resolveCategory,
} from '@/lib/categories';

describe('transaction categories', () => {
  it('shows only income categories for income entries', () => {
    expect(categoryOptionsFor(undefined, 'Income')).toEqual([...INCOME_CATEGORIES]);
    expect(categoryOptionsFor(undefined, 'Expense')).toEqual([...CATEGORIES]);
    expect(categoryOptionsFor(undefined, 'Income')).not.toContain(DEFAULT_CATEGORY);
    expect(categoryOptionsFor(undefined, 'Expense')).not.toContain(DEFAULT_INCOME_CATEGORY);
  });

  it('resolves the same word according to the transaction type', () => {
    expect(resolveCategory('Other', 'Income')).toBe('Other');
    expect(resolveCategory('Other', 'Expense')).toBe('Misc');
    expect(resolveCategory('cashback', 'Income')).toBe('Refund');
    expect(resolveCategory('Salary', 'Expense')).toBeNull();
  });

  it('knows Health, its everyday names, and draws it with its own icon', () => {
    expect(CATEGORIES).toContain('Health');
    expect(resolveCategory('medicines', 'Expense')).toBe('Health');
    expect(resolveCategory('Pharmacy', 'Expense')).toBe('Health');
    expect(categoryVisual('Health', 'Expense').icon).toBe('medical-bag');
    const icons = CATEGORIES.map((category) => categoryVisual(category, 'Expense').icon);
    expect(new Set(icons).size).toBe(CATEGORIES.length);
  });

  it('gives each income category its own visual', () => {
    const icons = INCOME_CATEGORIES.map((category) => categoryVisual(category, 'Income').icon);
    expect(new Set(icons).size).toBe(INCOME_CATEGORIES.length);
  });
});
