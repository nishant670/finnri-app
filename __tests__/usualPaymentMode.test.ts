import { usualModeForCategory } from '@/lib/payment-modes';

describe('usualModeForCategory', () => {
  it.each(['Salary', 'Freelance', 'Interest', 'Dividend'])(
    'sends %s income to a bank account',
    (category) => {
      expect(usualModeForCategory(category, 'Income')).toBe('Bank Account');
    }
  );

  it('leaves every other case to the form default', () => {
    expect(usualModeForCategory('Refund', 'Income')).toBeNull();
    expect(usualModeForCategory('Other', 'Income')).toBeNull();
    // An expense filed under a name an income category also uses is not income.
    expect(usualModeForCategory('Salary', 'Expense')).toBeNull();
    expect(usualModeForCategory(null, 'Income')).toBeNull();
  });
});
