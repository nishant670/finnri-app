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
    expect(ui.getByText('More details')).toBeTruthy();
    await fireEvent.press(ui.getByTestId('account-save'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatchObject({ type: 'upi', name: 'Daily UPI' });
  });

  const issuers = [
    { id: 'sbi', display_name: 'SBI Card', asset_key: 'credit-card' },
    { id: 'hdfc', display_name: 'HDFC Bank', asset_key: 'bank' },
  ] as never;

  it('labels every field and fills the name in from the card', async () => {
    jest.spyOn(accountsLib, 'fetchAccountProviders').mockResolvedValue(issuers);
    const ui = await render(<ManageAccountScreen />);
    expect(ui.getByText('What is it?')).toBeTruthy();
    expect(ui.getByLabelText('Account name').props.value).toBe('Bank Account');

    await fireEvent.press(ui.getByTestId('account-type-credit_card'));
    expect(ui.getByText('Which card?')).toBeTruthy();
    expect(ui.getByText('Save card')).toBeTruthy();
    expect(ui.getByText('Filled in for you. Change it to what you call this card.')).toBeTruthy();

    await fireEvent(ui.getByLabelText('Which card?'), 'focus');
    await fireEvent.press(await ui.findByText('SBI Card'));
    await fireEvent.changeText(ui.getByLabelText('Last 4 digits'), '4321');
    expect(ui.getByLabelText('Account name').props.value).toBe('SBI Card ••4321');
  });

  it('stops following the card once the name has been typed', async () => {
    const ui = await render(<ManageAccountScreen />);
    await fireEvent.changeText(ui.getByLabelText('Account name'), 'Salary');
    await fireEvent.changeText(ui.getByLabelText('Last 4 digits'), '1234');
    await fireEvent.press(ui.getByTestId('account-type-wallet'));
    expect(ui.getByLabelText('Account name').props.value).toBe('Salary');
    expect(ui.queryByText(/Filled in for you/)).toBeNull();
  });

  it('keeps the rarer types behind More', async () => {
    const ui = await render(<ManageAccountScreen />);
    expect(ui.queryByTestId('account-type-pay_later')).toBeNull();
    await fireEvent.press(ui.getByTestId('account-type-more'));
    await fireEvent.press(ui.getByTestId('account-type-pay_later'));
    expect(ui.getByText('Which lender?')).toBeTruthy();
    expect(ui.queryByLabelText('Last 4 digits')).toBeNull();
  });

  it('folds limit, due date, colour and default, and saves what is in there', async () => {
    const save = jest
      .spyOn(accountsLib, 'saveAccount')
      .mockResolvedValue({ id: 7, type: 'credit_card', name: 'Card', color: '#8257E5' } as never);
    const ui = await render(<ManageAccountScreen />);
    await fireEvent.press(ui.getByTestId('account-type-credit_card'));
    expect(ui.getByText('Limit, due date, colour, default')).toBeTruthy();
    expect(ui.queryByPlaceholderText('500')).toBeNull();

    await fireEvent.press(ui.getByTestId('account-more-details'));
    // One level of fold: everything inside is on show at once.
    await fireEvent.changeText(ui.getByPlaceholderText('500'), '999');
    await fireEvent.press(ui.getByLabelText('Use as default account'));
    await fireEvent.press(ui.getByTestId('account-save'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatchObject({ annual_fee: 999, is_default: true });
  });

  it('keeps cash in hand on show, since it is all a cash account has', async () => {
    const ui = await render(<ManageAccountScreen />);
    await fireEvent.press(ui.getByTestId('account-type-cash'));
    expect(ui.getByText('Cash in hand')).toBeTruthy();
    expect(ui.getByText('Colour, default')).toBeTruthy();
  });

  it('will not save a blank name', async () => {
    const save = jest.spyOn(accountsLib, 'saveAccount');
    const ui = await render(<ManageAccountScreen />);
    await fireEvent.changeText(ui.getByLabelText('Account name'), '   ');
    await fireEvent.press(ui.getByTestId('account-save'));
    expect(ui.getByText('Give this account a name.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});
