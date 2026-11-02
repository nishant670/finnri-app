import {
  FILTER_PRESETS,
  applyPreset,
  clearFilterFields,
  describeFilters,
  emptyFilterState,
  isFilterActive,
  isPresetApplied,
  toTransactionFilters,
  type TransactionFilterState,
} from '@/lib/transaction-filters';

const preset = (key: string) => {
  const found = FILTER_PRESETS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`no preset ${key}`);
  return found;
};

const now = new Date(2026, 7, 12); // 12 Aug 2026

describe('toTransactionFilters', () => {
  it('sends nothing for an untouched filter', () => {
    expect(toTransactionFilters(emptyFilterState)).toEqual({
      type: undefined,
      category: undefined,
      mode: undefined,
      account_id: undefined,
      event_id: undefined,
      min_amount: undefined,
      max_amount: undefined,
      start_date: undefined,
      end_date: undefined,
      uncategorised: undefined,
      sort: 'newest',
    });
  });

  it('omits the maximum when there is no upper limit', () => {
    // The slider this replaces capped at 10,000 and the screen only sent
    // max_amount when it was below that, so ₹18,000 rent could not be isolated.
    const filters = toTransactionFilters({ ...emptyFilterState, minAmount: 1000 });
    expect(filters.min_amount).toBe(1000);
    expect(filters.max_amount).toBeUndefined();
  });

  it('treats a zero minimum as a real bound, not an absent one', () => {
    expect(toTransactionFilters({ ...emptyFilterState, minAmount: 0 }).min_amount).toBe(0);
  });
});

describe('isFilterActive', () => {
  it('ignores the sort, which orders rather than constrains', () => {
    expect(isFilterActive({ ...emptyFilterState, sort: 'highest' })).toBe(false);
  });

  it('notices every constraint', () => {
    const constrained: Partial<TransactionFilterState>[] = [
      { type: 'Income' },
      { category: 'Bills' },
      { mode: 'Bank Account' },
      { accountId: 3 },
      { minAmount: 1000 },
      { maxAmount: 5000 },
      { startDate: '2026-08-01' },
      { endDate: '2026-08-12' },
      { uncategorised: true },
    ];
    constrained.forEach((patch) => {
      expect(isFilterActive({ ...emptyFilterState, ...patch })).toBe(true);
    });
  });
});

describe('presets', () => {
  it('This month runs from the first to today', () => {
    const next = applyPreset(preset('this-month'), emptyFilterState, now);
    expect(next.startDate).toBe('2026-08-01');
    expect(next.endDate).toBe('2026-08-12');
  });

  it('Last 30 days counts back by calendar date', () => {
    const next = applyPreset(preset('last-30'), emptyFilterState, now);
    expect(next.startDate).toBe('2026-07-13');
  });

  it('Over 1,000 leaves the upper end open', () => {
    const next = applyPreset(preset('over-1000'), emptyFilterState, now);
    expect(next.minAmount).toBe(1000);
    expect(next.maxAmount).toBeNull();
  });

  it('composes with what is already applied', () => {
    // "Over ₹1,000 this month" is the useful pair; a preset that wiped the
    // other one would make the row a set of mutually exclusive buttons.
    const monthly = applyPreset(preset('this-month'), emptyFilterState, now);
    const both = applyPreset(preset('over-1000'), monthly, now);
    expect(both.startDate).toBe('2026-08-01');
    expect(both.minAmount).toBe(1000);
    expect(isPresetApplied(preset('this-month'), both, now)).toBe(true);
    expect(isPresetApplied(preset('over-1000'), both, now)).toBe(true);
  });

  it('a second tap takes the preset back off', () => {
    const applied = applyPreset(preset('income-only'), emptyFilterState, now);
    expect(applied.type).toBe('Income');
    expect(applyPreset(preset('income-only'), applied, now).type).toBe('All');
  });

  it('Uncategorised clears a chosen category, which would contradict it', () => {
    const withCategory = { ...emptyFilterState, category: 'Bills' };
    const next = applyPreset(preset('uncategorised'), withCategory, now);
    expect(next.uncategorised).toBe(true);
    expect(next.category).toBeNull();
  });
});

describe('describeFilters', () => {
  it('says nothing when nothing is applied', () => {
    expect(describeFilters(emptyFilterState)).toEqual([]);
  });

  it('names the event filter and clears only it', () => {
    const state = { ...emptyFilterState, eventId: 7 };
    expect(isFilterActive(state)).toBe(true);
    expect(toTransactionFilters(state).event_id).toBe(7);
    expect(describeFilters(state, undefined, (id) => (id === 7 ? '🪔 Diwali party' : undefined))).toEqual([
      expect.objectContaining({ key: 'eventId', label: '🪔 Diwali party', clears: ['eventId'] }),
    ]);
    expect(clearFilterFields(state, ['eventId'])).toEqual(emptyFilterState);
  });

  it('collapses the amount range into one removable chip', () => {
    const chips = describeFilters({ ...emptyFilterState, minAmount: 1000, maxAmount: 5000 });
    expect(chips).toEqual([
      expect.objectContaining({ label: '₹1,000 – ₹5,000', clears: ['minAmount', 'maxAmount'] }),
    ]);
  });

  it('names an open-ended amount by the end that is set', () => {
    expect(describeFilters({ ...emptyFilterState, minAmount: 1000 })[0].label).toBe('Over ₹1,000');
    expect(describeFilters({ ...emptyFilterState, maxAmount: 500 })[0].label).toBe('Under ₹500');
  });

  it('resolves the account chip to its name', () => {
    const chips = describeFilters({ ...emptyFilterState, accountId: 2 }, (id) =>
      id === 2 ? 'HDFC UPI' : undefined
    );
    expect(chips[0].label).toBe('HDFC UPI');
  });

  it('describes a filter set by hand, not only one arriving from a chart', () => {
    const chips = describeFilters({
      ...emptyFilterState,
      type: 'Expense',
      mode: 'Bank Account',
      startDate: '2026-08-01',
      endDate: '2026-08-12',
    });
    expect(chips.map((chip) => chip.label)).toEqual([
      'Expense',
      'Bank Account',
      '1 Aug – 12 Aug',
    ]);
  });
});

describe('clearFilterFields', () => {
  it('resets only the named fields', () => {
    const state: TransactionFilterState = {
      ...emptyFilterState,
      type: 'Expense',
      minAmount: 1000,
      maxAmount: 5000,
      sort: 'highest',
    };
    const cleared = clearFilterFields(state, ['minAmount', 'maxAmount']);
    expect(cleared.minAmount).toBeNull();
    expect(cleared.maxAmount).toBeNull();
    expect(cleared.type).toBe('Expense');
    expect(cleared.sort).toBe('highest');
  });
});
