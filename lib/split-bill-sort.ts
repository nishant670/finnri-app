import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SplitBill } from './splits';

/**
 * How a group's expenses are ordered.
 *
 * The list was date-descending and nothing else, which answers "what happened
 * recently" and no other question. A group settling up wants the big items
 * first; a group where somebody has been quietly editing old expenses wants
 * what changed, which the expense's own date cannot show — an edit made today
 * to last month's dinner leaves the bill sitting where it always was.
 */
export type SplitBillSort =
  | 'date_desc'
  | 'date_asc'
  | 'updated_desc'
  | 'amount_desc'
  | 'amount_asc';

export const DEFAULT_SPLIT_BILL_SORT: SplitBillSort = 'date_desc';

export const SPLIT_BILL_SORT_OPTIONS: {
  key: SplitBillSort;
  label: string;
  hint: string;
  icon: 'calendar-arrow-left' | 'calendar-arrow-right' | 'update' | 'sort-numeric-descending' | 'sort-numeric-ascending';
}[] = [
  {
    key: 'date_desc',
    label: 'Newest first',
    hint: 'By expense date',
    icon: 'calendar-arrow-left',
  },
  {
    key: 'date_asc',
    label: 'Oldest first',
    hint: 'By expense date',
    icon: 'calendar-arrow-right',
  },
  {
    key: 'updated_desc',
    label: 'Recently updated',
    hint: 'Edits first, whenever the expense is dated',
    icon: 'update',
  },
  {
    key: 'amount_desc',
    label: 'Highest amount',
    hint: 'Largest expense first',
    icon: 'sort-numeric-descending',
  },
  {
    key: 'amount_asc',
    label: 'Lowest amount',
    hint: 'Smallest expense first',
    icon: 'sort-numeric-ascending',
  },
];

export const splitBillSortLabel = (sort: SplitBillSort) =>
  SPLIT_BILL_SORT_OPTIONS.find((option) => option.key === sort)?.label ??
  SPLIT_BILL_SORT_OPTIONS[0].label;

const isSplitBillSort = (value: unknown): value is SplitBillSort =>
  SPLIT_BILL_SORT_OPTIONS.some((option) => option.key === value);

const timestamp = (value?: string | null) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * `updated_at` is not always there — an older bill, or a payload trimmed on the
 * way through — so it falls back to creation and then to the expense's own
 * date. Sorting by a field half the rows do not have is worse than not
 * offering the sort at all: the rows without it all collapse to the bottom in
 * whatever order they arrived.
 */
const lastTouched = (bill: SplitBill) =>
  timestamp(bill.updated_at) || timestamp(bill.created_at) || timestamp(bill.date);

/**
 * Ties always fall back to the newest-first ordering the list has always had,
 * so two expenses on the same day never swap places between renders.
 */
export const sortSplitBills = (bills: SplitBill[], sort: SplitBillSort): SplitBill[] => {
  const byDateDesc = (a: SplitBill, b: SplitBill) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return timestamp(b.created_at) - timestamp(a.created_at);
  };

  const compare: Record<SplitBillSort, (a: SplitBill, b: SplitBill) => number> = {
    date_desc: byDateDesc,
    date_asc: (a, b) => -byDateDesc(a, b),
    updated_desc: (a, b) => lastTouched(b) - lastTouched(a) || byDateDesc(a, b),
    amount_desc: (a, b) => b.total_amount - a.total_amount || byDateDesc(a, b),
    amount_asc: (a, b) => a.total_amount - b.total_amount || byDateDesc(a, b),
  };

  return [...bills].sort(compare[sort] ?? byDateDesc);
};

const SPLIT_BILL_SORT_KEY = 'finnri_split_bill_sort';

/**
 * The choice is remembered across launches rather than per group: somebody who
 * reads their expenses largest-first means it about how they read expenses, and
 * having to re-pick it in every group is the same preference asked five times.
 */
export const loadSplitBillSort = async (): Promise<SplitBillSort> => {
  try {
    const raw = await AsyncStorage.getItem(SPLIT_BILL_SORT_KEY);
    return isSplitBillSort(raw) ? raw : DEFAULT_SPLIT_BILL_SORT;
  } catch {
    return DEFAULT_SPLIT_BILL_SORT;
  }
};

export const saveSplitBillSort = async (sort: SplitBillSort) => {
  try {
    await AsyncStorage.setItem(SPLIT_BILL_SORT_KEY, sort);
  } catch {
    // A remembered preference is a convenience; losing it must never stop the
    // list from re-ordering right now.
  }
};
