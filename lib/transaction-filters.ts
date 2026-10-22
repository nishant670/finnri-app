import { formatMoney } from '@/lib/money';
import { formatApiDate } from '@/lib/datetime';
import {
  DEFAULT_TRANSACTION_SORT,
  type TransactionFilters,
  type TransactionSort,
} from '@/lib/transactions';

/**
 * Everything the transactions screen is currently filtered by.
 *
 * One shape, owned by the screen and edited by the sheet. Before this the two
 * kept parallel copies with different names (`paymentMethod` here, `mode`
 * there) and the amount range carried a magic 10000 that meant "no upper
 * limit" in four places — `maxAmount === null` says it once.
 */
export type TransactionFilterState = {
  type: 'All' | 'Expense' | 'Income';
  category: string | null;
  mode: string | null;
  accountId: number | null;
  /** Rupees. `null` on either end means that end is open. */
  minAmount: number | null;
  maxAmount: number | null;
  /** `YYYY-MM-DD`. */
  startDate: string | null;
  endDate: string | null;
  /** Entries with no category at all. Misc is a category, so it does not match. */
  uncategorised: boolean;
  sort: TransactionSort;
};

export const emptyFilterState: TransactionFilterState = {
  type: 'All',
  category: null,
  mode: null,
  accountId: null,
  minAmount: null,
  maxAmount: null,
  startDate: null,
  endDate: null,
  uncategorised: false,
  sort: DEFAULT_TRANSACTION_SORT,
};

/** Every field except the sort, which is an ordering rather than a constraint. */
export const isFilterActive = (state: TransactionFilterState) =>
  state.type !== 'All' ||
  state.category !== null ||
  state.mode !== null ||
  state.accountId !== null ||
  state.minAmount !== null ||
  state.maxAmount !== null ||
  state.startDate !== null ||
  state.endDate !== null ||
  state.uncategorised;

export const toTransactionFilters = (state: TransactionFilterState): TransactionFilters => ({
  type: state.type === 'All' ? undefined : state.type,
  category: state.category ?? undefined,
  mode: state.mode ?? undefined,
  account_id: state.accountId ?? undefined,
  min_amount: state.minAmount ?? undefined,
  max_amount: state.maxAmount ?? undefined,
  start_date: state.startDate ?? undefined,
  end_date: state.endDate ?? undefined,
  uncategorised: state.uncategorised ? '1' : undefined,
  sort: state.sort,
});

const startOfMonth = (now: Date) => new Date(now.getFullYear(), now.getMonth(), 1);

const daysAgo = (now: Date, days: number) => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // setDate rather than subtracting milliseconds, so a 23-hour DST day still
  // lands on the right calendar date.
  date.setDate(date.getDate() - days);
  return date;
};

export type FilterPreset = {
  key: string;
  label: string;
  /** The state this preset represents, over and above whatever is already set. */
  patch: (now: Date) => Partial<TransactionFilterState>;
};

/**
 * The five questions people actually open this sheet to ask.
 *
 * Each is a patch rather than a whole state, so a preset composes with what is
 * already applied: "Over ₹1,000" inside "This month" is the useful pair, and
 * having the second silently discard the first would be its own bug.
 */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    key: 'this-month',
    label: 'This month',
    patch: (now) => ({ startDate: formatApiDate(startOfMonth(now)), endDate: formatApiDate(now) }),
  },
  {
    key: 'last-30',
    label: 'Last 30 days',
    patch: (now) => ({ startDate: formatApiDate(daysAgo(now, 30)), endDate: formatApiDate(now) }),
  },
  {
    key: 'over-1000',
    label: `Over ${formatMoney(1000)}`,
    patch: () => ({ minAmount: 1000, maxAmount: null }),
  },
  {
    key: 'income-only',
    label: 'Income only',
    patch: () => ({ type: 'Income' }),
  },
  {
    key: 'uncategorised',
    label: 'Uncategorised',
    // Picking a category and then asking for the ones without a category is a
    // contradiction, so this clears it.
    patch: () => ({ uncategorised: true, category: null }),
  },
];

/** True when everything the preset sets is already set. */
export const isPresetApplied = (
  preset: FilterPreset,
  state: TransactionFilterState,
  now: Date
): boolean => {
  const patch = preset.patch(now);
  return (Object.keys(patch) as (keyof TransactionFilterState)[]).every(
    (key) => state[key] === patch[key]
  );
};

export const applyPreset = (
  preset: FilterPreset,
  state: TransactionFilterState,
  now: Date
): TransactionFilterState => {
  if (isPresetApplied(preset, state, now)) {
    // A second tap takes it back off, so a preset is never a one-way door.
    const reverted = { ...state };
    (Object.keys(preset.patch(now)) as (keyof TransactionFilterState)[]).forEach((key) => {
      (reverted as Record<string, unknown>)[key] = emptyFilterState[key];
    });
    return reverted;
  }
  return { ...state, ...preset.patch(now) };
};

export type AppliedFilterChip = {
  key: keyof TransactionFilterState | 'amount' | 'dates';
  label: string;
  /** The fields this chip's × resets. */
  clears: (keyof TransactionFilterState)[];
};

const shortDate = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * The applied filters, in words, for the chip row above the list.
 *
 * Amount and date collapse into one chip each: "₹1,000 – ₹5,000" removed by
 * halves is a state nobody wants to land in, and two chips reading "Min" and
 * "Max" describe the control rather than the constraint.
 */
export const describeFilters = (
  state: TransactionFilterState,
  accountName?: (id: number) => string | undefined
): AppliedFilterChip[] => {
  const chips: AppliedFilterChip[] = [];

  if (state.type !== 'All') {
    chips.push({ key: 'type', label: state.type, clears: ['type'] });
  }
  if (state.uncategorised) {
    chips.push({ key: 'uncategorised', label: 'Uncategorised', clears: ['uncategorised'] });
  }
  if (state.category) {
    chips.push({ key: 'category', label: state.category, clears: ['category'] });
  }
  if (state.mode) {
    chips.push({ key: 'mode', label: state.mode, clears: ['mode'] });
  }
  if (state.accountId !== null) {
    chips.push({
      key: 'accountId',
      label: accountName?.(state.accountId) ?? 'Account',
      clears: ['accountId'],
    });
  }
  if (state.minAmount !== null || state.maxAmount !== null) {
    const label =
      state.minAmount !== null && state.maxAmount !== null
        ? `${formatMoney(state.minAmount)} – ${formatMoney(state.maxAmount)}`
        : state.minAmount !== null
          ? `Over ${formatMoney(state.minAmount)}`
          : `Under ${formatMoney(state.maxAmount as number)}`;
    chips.push({ key: 'amount', label, clears: ['minAmount', 'maxAmount'] });
  }
  if (state.startDate || state.endDate) {
    const label =
      state.startDate && state.endDate
        ? `${shortDate(state.startDate)} – ${shortDate(state.endDate)}`
        : state.startDate
          ? `From ${shortDate(state.startDate)}`
          : `Until ${shortDate(state.endDate as string)}`;
    chips.push({ key: 'dates', label, clears: ['startDate', 'endDate'] });
  }

  return chips;
};

export const clearFilterFields = (
  state: TransactionFilterState,
  fields: (keyof TransactionFilterState)[]
): TransactionFilterState => {
  const next = { ...state };
  fields.forEach((field) => {
    (next as Record<string, unknown>)[field] = emptyFilterState[field];
  });
  return next;
};

export type QuickFilterKey = 'all' | 'expenses' | 'income' | 'this-month';

/** The chips under the search box (board R3-List-Proposals, P12). */
export const QUICK_FILTERS: { key: QuickFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'this-month', label: 'This month' },
];

const thisMonthPreset = FILTER_PRESETS.find((preset) => preset.key === 'this-month')!;

export const isQuickFilterSelected = (
  key: QuickFilterKey,
  state: TransactionFilterState,
  now: Date
): boolean => {
  const thisMonth = isPresetApplied(thisMonthPreset, state, now);
  switch (key) {
    case 'all':
      return state.type === 'All' && !thisMonth;
    case 'expenses':
      return state.type === 'Expense';
    case 'income':
      return state.type === 'Income';
    case 'this-month':
      return thisMonth;
  }
};

/**
 * A quick filter's tap. Expenses and Income take turns as the type and a
 * second tap takes either back off; This month toggles on top of either; All
 * clears both.
 */
export const applyQuickFilter = (
  key: QuickFilterKey,
  state: TransactionFilterState,
  now: Date
): TransactionFilterState => {
  const selected = isQuickFilterSelected(key, state, now);
  switch (key) {
    case 'all': {
      const cleared = { ...state, type: 'All' as const };
      return isPresetApplied(thisMonthPreset, cleared, now)
        ? applyPreset(thisMonthPreset, cleared, now)
        : cleared;
    }
    case 'expenses':
      return { ...state, type: selected ? 'All' : 'Expense' };
    case 'income':
      return { ...state, type: selected ? 'All' : 'Income' };
    case 'this-month':
      return applyPreset(thisMonthPreset, state, now);
  }
};

/**
 * The applied-filter chips, less what the quick filters already show, so a
 * tap on "Income" doesn't also grow an "Income ×" chip below it.
 */
export const withoutQuickFilterChips = (
  chips: AppliedFilterChip[],
  state: TransactionFilterState,
  now: Date
) =>
  chips.filter(
    (chip) =>
      chip.key !== 'type' && !(chip.key === 'dates' && isPresetApplied(thisMonthPreset, state, now))
  );
