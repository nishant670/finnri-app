import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { BudgetsPanel } from '@/components/money/BudgetsPanel';
import * as budgets from '@/lib/budgets';
import type { Budget } from '@/lib/budgets';
import * as insights from '@/lib/insights';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useScrollToTop: () => undefined,
  };
});
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));
jest.mock('@/components/ui/AppDialogProvider', () => ({
  useAppDialog: () => ({ confirm: jest.fn().mockResolvedValue(false), alert: jest.fn() }),
}));

const groceries = {
  id: 4,
  name: 'Food budget',
  category: 'Food & Drinks',
  limit_amount: 8000,
  alert_threshold_percent: 80,
  active: true,
} as Budget;

describe('Budgets panel', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(insights, 'fetchDashboard').mockResolvedValue({
      top_categories: [{ category: 'Food & Drinks', amount: 6240 }],
    } as never);
  });

  it('asks two questions for a first budget and names it after the category', async () => {
    jest.spyOn(budgets, 'fetchBudgets').mockResolvedValue([]);
    const create = jest.spyOn(budgets, 'createBudget').mockResolvedValue(groceries);
    const ui = await render(<BudgetsPanel embedded />);

    // With nothing to list, the form is the empty state.
    expect(await ui.findByTestId('budget-form')).toBeTruthy();
    // Name and alert level are answered for the user and folded away.
    expect(ui.queryByText('Alert me at (% of the limit)')).toBeNull();

    await fireEvent.press(await ui.findByTestId('budget-category-Food & Drinks'));
    await fireEvent.changeText(await ui.findByTestId('budget-limit-input'), '7000');
    await fireEvent.press(await ui.findByTestId('budget-save'));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][1]).toEqual({
      name: 'Food & Drinks budget',
      category: 'Food & Drinks',
      limit_amount: 7000,
      alert_threshold_percent: 80,
      active: true,
    });
  });

  it('keeps the list on top and opens the form only when asked', async () => {
    jest.spyOn(budgets, 'fetchBudgets').mockResolvedValue([groceries]);
    const ui = await render(<BudgetsPanel embedded />);

    expect(await ui.findByText('Food budget')).toBeTruthy();
    expect(ui.queryByTestId('budget-form')).toBeNull();

    await fireEvent.press(await ui.findByText('New budget'));

    expect(await ui.findByTestId('budget-form')).toBeTruthy();
  });

  it('offers a limit priced off what was already spent in the category', async () => {
    jest.spyOn(budgets, 'fetchBudgets').mockResolvedValue([groceries]);
    const ui = await render(<BudgetsPanel embedded />);

    await fireEvent.press(await ui.findByText('New budget'));
    await fireEvent.press(await ui.findByTestId('budget-category-Food & Drinks'));
    await fireEvent.press(await ui.findByText(/You've spent ₹6,240 on Food & Drinks/));

    expect(await ui.findByTestId('budget-limit-input')).toHaveDisplayValue('6900');
  });

  it('opens More options when the alert level it holds is refused', async () => {
    jest.spyOn(budgets, 'fetchBudgets').mockResolvedValue([groceries]);
    const update = jest.spyOn(budgets, 'updateBudget');
    const ui = await render(<BudgetsPanel embedded />);

    await fireEvent.press(await ui.findByText('Food budget'));
    await fireEvent.press(await ui.findByTestId('budget-more-options'));
    await fireEvent.changeText(await ui.findByLabelText('Alert me at (% of the limit)'), '0');
    // Close it, so the refusal has to open it again.
    await fireEvent.press(await ui.findByTestId('budget-more-options'));
    await fireEvent.press(await ui.findByTestId('budget-save'));

    expect(await ui.findByText('Alert level should be between 1% and 100%.')).toBeTruthy();
    expect(await ui.findByLabelText('Alert me at (% of the limit)')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });
});
