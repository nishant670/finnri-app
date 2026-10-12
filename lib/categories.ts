import { MaterialCommunityIcons } from '@expo/vector-icons';

import { mixHex, withAlpha, type ThemeMode } from '@/constants/theme';

/**
 * Canonical transaction categories — the single source of truth for the app.
 *
 * This must stay in step with `canonicalCategories` in the backend's
 * `internal/http/categories.go`, the enum in `schemas/expense_entry.schema.json`,
 * and `internal/ai/prompt.txt`.
 *
 * These drifted once: the app added "Food & Drinks" and "Transport" to its
 * picker while the parser still only knew the original six, so every
 * AI-captured meal was filed as "Food" and every auto rickshaw as "Travel",
 * while manual entries used the newer names. The same spend ended up split
 * across two keys and every rollup quietly stopped being true.
 *
 * Transport and Travel are deliberately separate. Transport is getting around
 * day to day — autos, cabs, the metro, fuel. Travel is going somewhere —
 * flights, hotels, a trip.
 */
export const CATEGORIES = [
  'Food & Drinks',
  'Transport',
  'Travel',
  'Shopping',
  'Bills',
  'Entertainment',
  'Family/Gifts',
  'Misc',
] as const;

export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Interest', 'Refund', 'Other'] as const;

export type ExpenseCategory = (typeof CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type Category = ExpenseCategory | IncomeCategory;

/** Confirm-first fallback when the category is unknown. */
export const DEFAULT_CATEGORY: ExpenseCategory = 'Misc';
export const DEFAULT_INCOME_CATEGORY: IncomeCategory = 'Other';

export type CategoryVisual = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
};

/** One icon and colour per canonical category, keyed lowercase. */
export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  'food & drinks': { icon: 'silverware-fork-knife', color: '#D4A017', bgColor: '#FFF9C4' },
  transport: { icon: 'bus', color: '#E57373', bgColor: '#FFEBEE' },
  travel: { icon: 'airplane', color: '#7E57C2', bgColor: '#EDE7F6' },
  shopping: { icon: 'cart-outline', color: '#42A5F5', bgColor: '#E3F2FD' },
  bills: { icon: 'file-document-outline', color: '#26A69A', bgColor: '#E0F2F1' },
  entertainment: { icon: 'play-circle-outline', color: '#5C6BC0', bgColor: '#E8EAF6' },
  'family/gifts': { icon: 'gift-outline', color: '#EC407A', bgColor: '#FCE4EC' },
  misc: { icon: 'dots-horizontal', color: '#90A4AE', bgColor: '#F5F5F5' },
  salary: { icon: 'briefcase-outline', color: '#16A34A', bgColor: '#DCFCE7' },
  freelance: { icon: 'account-cash-outline', color: '#0D9488', bgColor: '#CCFBF1' },
  interest: { icon: 'percent-outline', color: '#2563EB', bgColor: '#DBEAFE' },
  refund: { icon: 'cash-refund', color: '#7C3AED', bgColor: '#EDE9FE' },
  other: { icon: 'dots-horizontal', color: '#64748B', bgColor: '#F1F5F9' },
};

/** Legacy fallback for an income row whose old category cannot be resolved. */
export const INCOME_VISUAL: CategoryVisual = {
  icon: 'briefcase-outline',
  color: '#FF7043',
  bgColor: '#F3E5F5',
};

/**
 * A category the app does not recognise — an older row, or one typed before
 * the list settled. A plain tag, in slate: it used to be ⇄, which read as a
 * transfer and sent people looking for the other half of one.
 */
export const UNKNOWN_VISUAL: CategoryVisual = {
  icon: 'tag-outline',
  color: '#64748B',
  bgColor: '#F1F5F9',
};

/**
 * Legacy and loose names still readable from older rows and older app builds.
 * Mirrors `categoryAliases` on the backend.
 */
const CATEGORY_ALIASES: Record<string, Category> = {
  food: 'Food & Drinks',
  'food & drink': 'Food & Drinks',
  'food and drinks': 'Food & Drinks',
  dining: 'Food & Drinks',
  restaurant: 'Food & Drinks',
  groceries: 'Food & Drinks',
  grocery: 'Food & Drinks',
  cafe: 'Food & Drinks',
  coffee: 'Food & Drinks',
  transportation: 'Transport',
  commute: 'Transport',
  cab: 'Transport',
  taxi: 'Transport',
  metro: 'Transport',
  fuel: 'Transport',
  petrol: 'Transport',
  trip: 'Travel',
  vacation: 'Travel',
  flight: 'Travel',
  hotel: 'Travel',
  lodging: 'Travel',
  movies: 'Entertainment',
  streaming: 'Entertainment',
  games: 'Entertainment',
  music: 'Entertainment',
  // The old subscription-only vocabulary; these are recurring service bills.
  productivity: 'Bills',
  cloud: 'Bills',
  membership: 'Bills',
  learning: 'Bills',
  family: 'Family/Gifts',
  gifts: 'Family/Gifts',
  gift: 'Family/Gifts',
  miscellaneous: 'Misc',
  other: 'Misc',
  finance: 'Misc',
  split: 'Misc',
};

const INCOME_CATEGORY_ALIASES: Record<string, IncomeCategory> = {
  'salary income': 'Salary',
  wages: 'Salary',
  paycheck: 'Salary',
  freelancing: 'Freelance',
  consulting: 'Freelance',
  'side hustle': 'Freelance',
  'interest income': 'Interest',
  'bank interest': 'Interest',
  cashback: 'Refund',
  reimbursement: 'Refund',
  'returned purchase': 'Refund',
};

/** Resolves a raw value to its canonical form, or null when unrecognised. */
export const resolveCategory = (
  value?: string | null,
  type?: string | null
): Category | null => {
  const normalized = value?.toLowerCase().trim();
  if (!normalized) {
    return null;
  }
  const income = type?.toLowerCase() === 'income';
  const options = income ? INCOME_CATEGORIES : CATEGORIES;
  const exact = options.find((category) => category.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }
  return income
    ? (INCOME_CATEGORY_ALIASES[normalized] ?? null)
    : (CATEGORY_ALIASES[normalized] ?? null);
};

export const defaultCategoryForType = (type?: string | null): Category =>
  type?.toLowerCase() === 'income' ? DEFAULT_INCOME_CATEGORY : DEFAULT_CATEGORY;

/**
 * The picker list. An unrecognised category from an older row is appended so
 * editing that entry never silently rewrites it.
 */
export const categoryOptionsFor = (current?: string | null, type?: string | null): string[] => {
  const income = type?.toLowerCase() === 'income';
  const options = income ? INCOME_CATEGORIES : CATEGORIES;
  const resolved = resolveCategory(current, type);
  if (resolved || !current?.trim()) {
    return [...options];
  }
  return [...options, current.trim()];
};

/** Icon and colour for a category, falling back to income or unknown. */
export const categoryVisual = (
  category?: string | null,
  type?: string | null
): CategoryVisual => {
  const resolved = resolveCategory(category, type);
  if (resolved) {
    return CATEGORY_VISUALS[resolved.toLowerCase()];
  }
  if (type?.toLowerCase() === 'income') {
    return INCOME_VISUAL;
  }
  return UNKNOWN_VISUAL;
};

/**
 * The icon tile's fill and glyph colour for a category, in either mode.
 *
 * The category palette is a set of light pastels, which glare on a dark card.
 * In dark mode the tile is the category's own colour at 18%, and the glyph is
 * that colour lifted 40% toward white — the pair the dark boards draw (pink
 * #EC407A becomes a #F48FB1 glyph on a faint pink tile).
 */
export const categoryTile = (
  visual: Pick<CategoryVisual, 'color' | 'bgColor'>,
  mode: ThemeMode
): { background: string; foreground: string } =>
  mode === 'dark'
    ? { background: withAlpha(visual.color, 0.18), foreground: mixHex(visual.color, '#FFFFFF', 0.4) }
    : { background: visual.bgColor, foreground: visual.color };
