import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import ManageAccountScreen from '@/app/accounts/manage';
import * as accountsLib from '@/lib/accounts';
import { fetchCardProducts } from '@/lib/card-products';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'test-token', user: { username: 'Asha Rao' } }),
}));

const issuers = [
  { id: 'hdfc', display_name: 'HDFC Bank', asset_key: 'bank' },
  { id: 'kotak', display_name: 'Kotak Mahindra Bank', asset_key: 'bank' },
] as never;

const products = [
  { id: 'hdfc-millennia', issuer_id: 'hdfc', name: 'Millennia', tone: 'solid', drawing: 'dotgrid', orientation: 'landscape', annual_fee: 1000 },
  { id: 'hdfc-tata-neu-infinity', issuer_id: 'hdfc', name: 'Tata Neu Infinity', tone: 'solid', drawing: 'coins', orientation: 'portrait' },
];

const mockedProducts = fetchCardProducts as jest.MockedFunction<typeof fetchCardProducts>;

async function startCard(ui: Awaited<ReturnType<typeof render>>, bank: string) {
  await fireEvent.press(ui.getByTestId('account-type-credit_card'));
  await fireEvent(ui.getByLabelText('Which card?'), 'focus');
  await fireEvent.press(await ui.findByText(bank));
}

describe("Add card picks the product (plan §6)", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(accountsLib, 'fetchAccountProviders').mockResolvedValue(issuers);
    mockedProducts.mockImplementation(async (_token, issuer) => (issuer === 'hdfc' ? (products as never) : []));
  });

  it("offers the bank's cards as sketches, draws the one picked and saves it", async () => {
    const save = jest
      .spyOn(accountsLib, 'saveAccount')
      .mockResolvedValue({ id: 9, type: 'credit_card', name: 'HDFC Millennia ••4321', color: '#000' } as never);
    const ui = await render(<ManageAccountScreen />);
    await startCard(ui, 'HDFC Bank');

    expect(await ui.findByText('Which HDFC Bank card?')).toBeTruthy();
    expect(mockedProducts).toHaveBeenCalledWith('test-token', 'hdfc');
    expect(ui.getByText('Tata Neu Infinity')).toBeTruthy();
    expect(ui.queryByTestId('card-product-preview')).toBeNull();

    await fireEvent.press(ui.getByTestId('card-product-hdfc-millennia'));
    expect(ui.getByTestId('card-product-preview')).toBeTruthy();
    expect(ui.getByTestId('card-product-hdfc-millennia').props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.changeText(ui.getByLabelText('Last 4 digits'), '4321');
    expect(ui.getByLabelText('Account name').props.value).toBe('HDFC Millennia ••4321');
    expect(ui.getByLabelText('HDFC Bank Millennia card ending 4321')).toBeTruthy();

    await fireEvent.press(ui.getByTestId('card-network-visa'));
    await fireEvent.press(ui.getByTestId('account-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatchObject({
      type: 'credit_card',
      provider_id: 'hdfc',
      last4: '4321',
      card_product_id: 'hdfc-millennia',
      card_network: 'visa',
      // The catalogue's fee fills the blank field.
      annual_fee: 1000,
    });
  });

  it("keeps today's path when the card isn't listed", async () => {
    const save = jest
      .spyOn(accountsLib, 'saveAccount')
      .mockResolvedValue({ id: 9, type: 'credit_card', name: 'HDFC Bank', color: '#000' } as never);
    const ui = await render(<ManageAccountScreen />);
    await startCard(ui, 'HDFC Bank');
    await fireEvent.press(await ui.findByTestId('card-product-hdfc-millennia'));
    await fireEvent.press(ui.getByTestId('card-product-not-listed'));
    expect(ui.queryByTestId('card-product-preview')).toBeNull();
    await fireEvent.press(ui.getByTestId('account-save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][1]).toMatchObject({ card_product_id: '', card_network: '' });
  });

  it('skips the step for a bank with nothing in the catalogue, and for pay-later lines', async () => {
    const ui = await render(<ManageAccountScreen />);
    await startCard(ui, 'Kotak Mahindra Bank');
    await waitFor(() => expect(mockedProducts).toHaveBeenCalledWith('test-token', 'kotak'));
    expect(ui.queryByTestId('card-product-picker')).toBeNull();
    // The network still applies to any card.
    expect(ui.getByTestId('card-network-rupay')).toBeTruthy();

    await fireEvent.press(ui.getByTestId('account-type-more'));
    await fireEvent.press(ui.getByTestId('account-type-pay_later'));
    expect(ui.queryByTestId('card-network-rupay')).toBeNull();
  });
});
