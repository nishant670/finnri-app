import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { BudgetsPanel } from '@/components/money/BudgetsPanel';
import * as budgets from '@/lib/budgets';
import type { Budget } from '@/lib/budgets';
import * as insights from '@/lib/insights';
import { ApiError } from '@/lib/api-error';

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

jest.mock('@/components/billing/UpgradeSheet', () => {
  const actual = jest.requireActual('@/components/billing/UpgradeSheet');
  const { Text } = jest.requireActual('react-native');
  return {
    ...actual,
    // The real sheet loads plans; what matters here is when it opens, for what.
    UpgradeSheet: ({ visible, entitlement }: { visible: boolean; entitlement: { featureLabel: string; freeLimit?: number } | null }) =>
      visible && entitlement ? (
        <Text testID="upgrade-sheet">
          {entitlement.freeLimit != null ? actual.freeLimitLine(entitlement.freeLimit, entitlement.featureLabel) : entitlement.featureLabel}
        </Text>
      ) : null,
  };
});

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

    await fireEvent.press(await ui.findByText('Add'));

    expect(await ui.findByTestId('budget-form')).toBeTruthy();
  });

  it('offers a limit priced off what was already spent in the category', async () => {
    jest.spyOn(budgets, 'fetchBudgets').mockResolvedValue([groceries]);
    const ui = await render(<BudgetsPanel embedded />);

    await fireEvent.press(await ui.findByText('Add'));
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

  it('says why a second free budget is refused and keeps the first one on screen', async () => {
    jest.spyOn(budgets, 'fetchBudgets').mockResolvedValue([groceries]);
    jest.spyOn(budgets, 'createBudget').mockRejectedValue(
      new ApiError('payment_required', 402, 'payment_required', undefined, {
        featureCode: 'budgets',
        featureLabel: 'Budgets',
        upgradeRequired: true,
        freeLimit: 1,
      })
    );
    const ui = await render(<BudgetsPanel embedded />);

    await fireEvent.press(await ui.findByText('Add'));
    await fireEvent.changeText(await ui.findByTestId('budget-limit-input'), '5000');
    await fireEvent.press(await ui.findByTestId('budget-save'));

    expect((await ui.findByTestId('upgrade-sheet')).props.children).toBe(
      'Free accounts get 1 budget, and yours is in use.'
    );
    // Not locked: the budget they keep, the form they typed and Add all stay.
    expect(ui.getByText('Food budget')).toBeTruthy();
    expect(ui.getByTestId('budget-limit-input').props.value).toBe('5000');
    expect(ui.getByText('Add')).toBeTruthy();
    expect(ui.getByTestId('budget-free-limit-note')).toBeTruthy();
  });
});
