import type { Category } from './categories';

type CategoryRule = { category: Category; phrases: string[] };

const expenseRules: CategoryRule[] = [
  {
    category: 'Food & Drinks',
    phrases: [
      'food',
      'dining',
      'dining out',
      'dinner',
      'lunch',
      'breakfast',
      'brunch',
      'meal',
      'meals',
      'snack',
      'snacks',
      'restaurant',
      'cafe',
      'coffee',
      'tea',
      'chai',
      'drinks',
      'groceries',
      'grocery',
      'swiggy',
      'zomato',
      'uber eats',
      'खाना',
      'खाने',
      'चाय',
      'नाश्ता',
      'भोजन',
    ],
  },
  {
    category: 'Transport',
    phrases: [
      'metro',
      'bus',
      'cab',
      'taxi',
      'auto',
      'rickshaw',
      'uber',
      'ola',
      'rapido',
      'commute',
      'transport',
      'petrol',
      'diesel',
      'fuel',
      'parking',
      'toll',
      'train ticket',
      'मेट्रो',
      'बस',
      'ऑटो',
      'टैक्सी',
      'पेट्रोल',
    ],
  },
  {
    category: 'Travel',
    phrases: [
      'travel',
      'trip',
      'vacation',
      'holiday',
      'flight',
      'flights',
      'airfare',
      'hotel',
      'hotels',
      'airbnb',
      'resort',
      'irctc',
      'यात्रा',
      'होटल',
      'फ्लाइट',
    ],
  },
  {
    category: 'Shopping',
    phrases: [
      'shopping',
      'clothes',
      'clothing',
      'shoes',
      'shirt',
      'dress',
      'electronics',
      'furniture',
      'amazon',
      'flipkart',
      'myntra',
      'कपड़े',
      'खरीदारी',
    ],
  },
  {
    category: 'Bills',
    phrases: [
      'rent',
      'electricity',
      'water bill',
      'gas bill',
      'phone bill',
      'mobile bill',
      'internet',
      'broadband',
      'wifi',
      'recharge',
      'insurance',
      'utility',
      'utilities',
      'किराया',
      'बिजली',
      'रिचार्ज',
    ],
  },
  {
    category: 'Entertainment',
    phrases: [
      'movie',
      'movies',
      'cinema',
      'netflix',
      'spotify',
      'concert',
      'gaming',
      'game',
      'games',
      'theatre',
      'theater',
      'entertainment',
      'सिनेमा',
      'फिल्म',
    ],
  },
  {
    category: 'Family/Gifts',
    phrases: [
      'gift',
      'gifts',
      'present',
      'birthday gift',
      'family support',
      'pocket money',
      'donation',
      'उपहार',
      'तोहफा',
    ],
  },
];

const incomeRules: CategoryRule[] = [
  { category: 'Salary', phrases: ['salary', 'payroll', 'paycheck', 'wages', 'वेतन', 'सैलरी'] },
  {
    category: 'Freelance',
    phrases: ['freelance', 'freelancing', 'consulting', 'client payment', 'side hustle'],
  },
  { category: 'Interest', phrases: ['interest', 'ब्याज'] },
  {
    category: 'Refund',
    phrases: ['refund', 'cashback', 'reimbursement', 'returned purchase', 'रिफंड'],
  },
];

/** Local hints only: unknown or equally specific conflicting clues stay uncategorized. */
export function inferTransactionCategory(title: string, type: string): Category | null {
  const normalized = ` ${title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()} `;
  const rules = type.toLowerCase() === 'income' ? incomeRules : expenseRules;
  let category: Category | null = null;
  let bestScore = 0;
  for (const rule of rules) {
    const score = rule.phrases.reduce(
      (best, phrase) =>
        normalized.includes(` ${phrase} `) ? Math.max(best, phrase.split(' ').length) : best,
      0
    );
    if (score > bestScore) {
      category = rule.category;
      bestScore = score;
    } else if (score > 0 && score === bestScore) {
      category = null;
    }
  }
  return category;
}
