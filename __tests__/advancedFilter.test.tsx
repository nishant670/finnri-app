import { fireEvent, render } from '@testing-library/react-native';

import {
  AdvancedFilter,
  activeFilterCount,
  dateRangeLabel,
} from '@/components/transactions/AdvancedFilter';
import type { Account } from '@/lib/accounts';
import { emptyFilterState, type TransactionFilterState } from '@/lib/transaction-filters';

const accounts = [
  { id: 1, type: 'credit_card', name: 'HDFC Millennia' },
  { id: 2, type: 'cash', name: 'Cash' },
  { id: 3, type: 'bank', name: 'SBI Account' },
  { id: 4, type: 'wallet', name: 'Sodexo' },
  { id: 5, type: 'upi', name: 'PhonePe' },
] as unknown as Account[];

const setup = async (currentFilters: TransactionFilterState = emptyFilterState) => {
  const onApply = jest.fn();
  const onClose = jest.fn();
  const screen = await render(
    <AdvancedFilter
      onApply={onApply}
      onClose={onClose}
      currentFilters={currentFilters}
      accounts={accounts}
      categoryCounts={{ 'Food & Drinks': 49, Transport: 16 }}
    />
  );
  return { screen, onApply, onClose };
};

describe('AdvancedFilter', () => {
  it('applies every section from one open sheet', async () => {
    const { screen, onApply } = await setup();
    await fireEvent.press(screen.getByTestId('filter-sort-highest'));
    await fireEvent.press(screen.getByTestId('filter-type-Expense'));
    await fireEvent.press(screen.getByTestId('filter-category-Food & Drinks'));
    await fireEvent.press(screen.getByTestId('filter-mode-UPI'));
    await fireEvent.changeText(screen.getByTestId('filter-amount-min'), '1,000');
    await fireEvent.press(screen.getByTestId('filter-apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'highest',
        type: 'Expense',
        category: 'Food & Drinks',
        mode: 'UPI',
        minAmount: 1000,
        maxAmount: null,
      })
    );
  });

  it('counts the chosen sections beside the title', async () => {
    const { screen } = await setup();
    expect(screen.queryByTestId('filter-count')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-type-Income'));
    await fireEvent.press(screen.getByTestId('filter-mode-Cash'));
    expect(screen.getByTestId('filter-count')).toHaveTextContent('2');
  });

  it('shows Paid via in sentence case and no stale count on the button', async () => {
    const { screen } = await setup();
    expect(screen.getByText('Bank account')).toBeTruthy();
    expect(screen.getByText('Credit card')).toBeTruthy();
    expect(screen.getByText('Wallet')).toBeTruthy();
    expect(screen.getByTestId('filter-apply')).toHaveTextContent('Show results');
  });

  it('keeps Uncategorised and a category from both being chosen', async () => {
    const { screen, onApply } = await setup({ ...emptyFilterState, category: 'Transport' });
    await fireEvent.press(screen.getByTestId('filter-category-uncategorised'));
    await fireEvent.press(screen.getByTestId('filter-apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ category: null, uncategorised: true })
    );
  });

  it('opens a custom range with its own From and To', async () => {
    const { screen } = await setup();
    expect(screen.queryByTestId('filter-date-start')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-date-custom'));
    expect(screen.getByTestId('filter-date-start')).toBeTruthy();
    expect(screen.getByTestId('filter-date-end')).toBeTruthy();
  });

  it('opens a filter whose dates are not a preset on Custom range', async () => {
    const { screen } = await setup({
      ...emptyFilterState,
      startDate: '2026-02-03',
      endDate: '2026-02-09',
    });
    expect(screen.getByTestId('filter-date-start')).toBeTruthy();
    expect(screen.getByText('3 – 9 Feb 2026')).toBeTruthy();
  });

  it('picks an account from the grouped picker', async () => {
    const { screen, onApply } = await setup();
    await fireEvent.press(screen.getByTestId('filter-account-row'));
    expect(screen.getByText('Cards · 1')).toBeTruthy();
    expect(screen.getByText('Bank and cash · 2')).toBeTruthy();
    expect(screen.getByText('Wallets and UPI · 2')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('filter-account-search'), 'sod');
    expect(screen.queryByText('HDFC Millennia')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-account-4'));
    await fireEvent.press(screen.getByTestId('filter-apply'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ accountId: 4 }));
  });

  it('clears everything but the sort', async () => {
    const { screen, onApply } = await setup({
      ...emptyFilterState,
      sort: 'oldest',
      type: 'Income',
      accountId: 2,
      minAmount: 500,
    });
    await fireEvent.press(screen.getByTestId('filter-clear-all'));
    await fireEvent.press(screen.getByTestId('filter-apply'));
    expect(onApply).toHaveBeenCalledWith({ ...emptyFilterState, sort: 'oldest' });
  });
});

describe('filter helpers', () => {
  it.each([
    ['2026-10-01', '2026-10-24', '1 – 24 Oct 2026'],
    ['2026-09-25', '2026-10-24', '25 Sep – 24 Oct 2026'],
    ['2025-12-25', '2026-01-05', '25 Dec 2025 – 5 Jan 2026'],
    ['2026-10-24', '2026-10-24', '24 Oct 2026'],
    ['2026-10-01', null, 'From 1 Oct 2026'],
    [null, '2026-10-24', 'Until 24 Oct 2026'],
    [null, null, ''],
  ])('labels %s → %s as %s', (start, end, label) => {
    expect(dateRangeLabel(start, end)).toBe(label);
  });

  it('counts sections, not fields', () => {
    expect(activeFilterCount(emptyFilterState)).toBe(0);
    expect(
      activeFilterCount({
        ...emptyFilterState,
        startDate: '2026-10-01',
        endDate: '2026-10-24',
        minAmount: 100,
        maxAmount: 500,
        sort: 'highest',
      })
    ).toBe(2);
  });
});
