import { inferTransactionCategory } from '@/lib/transaction-category';

describe('title category hints', () => {
  it.each([
    ['dining out', 'Food & Drinks'],
    ['DINNER with friends!', 'Food & Drinks'],
    ['Coffee at work', 'Food & Drinks'],
    ['Uber Eats', 'Food & Drinks'],
    ['चाय और नाश्ता', 'Food & Drinks'],
    ['Metro to office', 'Transport'],
    ['मेट्रो का टिकट', 'Transport'],
    ['Auto rickshaw', 'Transport'],
    ['Flight to Delhi', 'Travel'],
    ['Hotel booking', 'Travel'],
    ['New shoes', 'Shopping'],
    ['Electricity bill', 'Bills'],
    ['Netflix subscription', 'Entertainment'],
    ['Birthday gift', 'Family/Gifts'],
    ['Dinnerware', null],
    ['Metropolis', null],
    ['Automatic transfer', null],
    ['Cafe + taxi', null],
    ['Something else', null],
    ['', null],
  ])('classifies %s conservatively', (title, expected) => {
    expect(inferTransactionCategory(title, 'Expense')).toBe(expected);
  });

  it.each([
    ['Monthly salary', 'Salary'],
    ['Client payment', 'Freelance'],
    ['Bank interest', 'Interest'],
    ['Dinner refund', 'Refund'],
    ['Groceries cashback', 'Refund'],
    ['ब्याज', 'Interest'],
    ['Dinner', null],
  ])('keeps %s in the income vocabulary', (title, expected) => {
    expect(inferTransactionCategory(title, 'Income')).toBe(expected);
  });
});
