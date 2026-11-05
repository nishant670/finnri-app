import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import EMIPlanDetailScreen from '@/app/emi-plans/[id]';
import * as emiPlans from '@/lib/emi-plans';
import type { EMIPlan } from '@/lib/emi-plans';

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { back: () => mockBack() },
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ id: '7' }),
  };
});
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));

const plan = {
  id: 7,
  account_id: 3,
  title: 'Bed and mattress',
  principal: 67518,
  annual_rate_pct: 0,
  tenure_months: 6,
  monthly_amount: 11253,
  total_interest: 0,
  currency: 'INR',
  purchased_on: '2026-08-20',
  first_installment: '2026-09-09',
  status: 'active',
  installments: [],
  progress: {
    installments_total: 6,
    installments_paid: 2,
    principal_remaining: 45012,
    principal_repaid: 22506,
    blocked_principal: 45012,
    amount_remaining: 45012,
    next_due_date: '2026-11-09',
  },
} as EMIPlan;

describe('EMI plan screen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockBack.mockReset();
    jest.spyOn(emiPlans, 'fetchEMIPlan').mockResolvedValue(plan);
  });

  it('opens a menu from ⋯ instead of going straight to delete', async () => {
    await render(<EMIPlanDetailScreen />);
    await fireEvent.press(await screen.findByLabelText('More options for this plan'));

    expect(await screen.findByTestId('emi-plan-actions')).toBeTruthy();
    expect(screen.getByText('₹11,253 a month · 2 of 6 paid')).toBeTruthy();
    expect(screen.queryByText('Delete Bed and mattress?')).toBeNull();
  });

  it('forecloses from the menu after confirming', async () => {
    const foreclose = jest
      .spyOn(emiPlans, 'forecloseEMIPlan')
      .mockResolvedValue({ ...plan, status: 'foreclosed' });
    await render(<EMIPlanDetailScreen />);
    await fireEvent.press(await screen.findByLabelText('More options for this plan'));
    await fireEvent.press(await screen.findByLabelText('Foreclose Bed and mattress'));

    expect(await screen.findByText('Foreclose this plan?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Foreclose'));
    await waitFor(() => expect(foreclose).toHaveBeenCalledWith('test-token', 7));
  });

  it('deletes from the menu after confirming', async () => {
    const remove = jest.spyOn(emiPlans, 'deleteEMIPlan').mockResolvedValue();
    await render(<EMIPlanDetailScreen />);
    await fireEvent.press(await screen.findByLabelText('More options for this plan'));
    await fireEvent.press(await screen.findByLabelText('Delete Bed and mattress'));

    expect(await screen.findByText('Delete Bed and mattress?')).toBeTruthy();
    // The sheet's own Delete row is still sliding out; the dialog's is last.
    const confirms = screen.getAllByText('Delete');
    await fireEvent.press(confirms[confirms.length - 1]);
    await waitFor(() => expect(remove).toHaveBeenCalledWith('test-token', 7));
    expect(mockBack).toHaveBeenCalled();
  });

  it('offers only Delete once a plan is closed', async () => {
    jest.spyOn(emiPlans, 'fetchEMIPlan').mockResolvedValue({ ...plan, status: 'foreclosed' });
    await render(<EMIPlanDetailScreen />);
    await fireEvent.press(await screen.findByLabelText('More options for this plan'));

    expect(await screen.findByLabelText('Delete Bed and mattress')).toBeTruthy();
    expect(screen.queryByLabelText('Foreclose Bed and mattress')).toBeNull();
  });
});
