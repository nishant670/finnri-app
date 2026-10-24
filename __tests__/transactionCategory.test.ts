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
    // Dishes on their own, without a meal word (device report, 2026-10-24).
    ['Mutton seekh kebab + roomali', 'Food & Drinks'],
    ['Mutton seekh kebab + rumali', 'Food & Drinks'],
    ['Momos', 'Food & Drinks'],
    ['Momo', 'Food & Drinks'],
    ['Chicken tikka', 'Food & Drinks'],
    ['Veg biryani', 'Food & Drinks'],
    ['Masala dosa', 'Food & Drinks'],
    ['Blinkit order', 'Food & Drinks'],
    ['Swiggy Instamart', 'Food & Drinks'],
    ['समोसा', 'Food & Drinks'],
    ['सब्ज़ी', 'Food & Drinks'],
    ['Buses', 'Transport'],
    ['Metro recharge', 'Transport'],
    ['Fastag', 'Transport'],
    ['MakeMyTrip', 'Travel'],
    ['Jeans', 'Shopping'],
    ['Jio recharge', 'Bills'],
    ['Gas cylinder', 'Bills'],
    ['BookMyShow tickets', 'Entertainment'],
    ['Shagun', 'Family/Gifts'],
    ['Dinnerware', null],
    ['Momentum', null],
    ['Gift wrap', null],
    ['Petrol + snacks', null],
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
    ['Diwali bonus', 'Salary'],
    ['Upwork invoice', 'Freelance'],
    ['Dinner', null],
  ])('keeps %s in the income vocabulary', (title, expected) => {
    expect(inferTransactionCategory(title, 'Income')).toBe(expected);
  });
});
