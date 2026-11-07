import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import ManageAccountScreen from '@/app/accounts/manage';
import * as accountsLib from '@/lib/accounts';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));

describe('Add an account in one sheet (P21)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(accountsLib, 'fetchAccountProviders').mockResolvedValue([]);
  });

  it('takes the type, the name and the details on one screen, with one Save', async () => {
    const save = jest
      .spyOn(accountsLib, 'saveAccount')
      .mockResolvedValue({ id: 7, type: 'upi', name: 'Daily UPI', color: '#00D2B4' } as never);
    const ui = await render(<ManageAccountScreen />);

    expect(ui.getByText('Add an account')).toBeTruthy();
    expect(ui.queryByText('Continue')).toBeNull();

    await fireEvent.press(ui.getByTestId('account-type-upi'));
    await fireEvent.changeText(ui.getByLabelText('Account name'), 'Daily UPI');
    expect(ui.getByText('Colour & default')).toBeTruthy();
    await fireEvent.press(ui.getByTestId('account-save'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatchObject({ type: 'upi', name: 'Daily UPI' });
  });
});
