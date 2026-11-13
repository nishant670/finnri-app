import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import CardsScreen from '@/app/cards';
import * as accountsLib from '@/lib/accounts';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) },
    useRouter: () => ({ back: jest.fn(), push: mockPush }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'test-token', user: { username: 'Asha Rao' } }),
}));
jest.mock('@/lib/subscription-form', () => ({ todayISO: () => '2026-11-13' }));

const accounts = [
  {
    id: 1,
    type: 'credit_card',
    name: 'SBI BPCL',
    color: '#000',
    provider_id: 'sbi',
    provider: 'State Bank of India',
    last4: '7924',
    card_network: 'visa',
    card_product_id: 'sbi-bpcl',
    card_product: { id: 'sbi-bpcl', issuer_id: 'sbi', name: 'BPCL', tone: 'deep', drawing: 'splash', orientation: 'landscape' },
    summary: {
      spent_this_month: 4200,
      entries_this_month: 3,
      current_statement: {
        id: 41, statement_date: '2026-10-28', due_date: '2026-11-18', total_due: 8412, minimum_due: 420,
        paid_amount: 0, remaining_due: 8412, status: 'unpaid', is_overdue: false, days_to_due: 5,
      },
    },
  },
  {
    id: 2,
    type: 'credit_card',
    name: 'HDFC Swiggy',
    color: '#000',
    provider_id: 'hdfc',
    provider: 'HDFC Bank',
    last4: '9584',
    due_day: 2,
    summary: { spent_this_month: 0, entries_this_month: 0 },
  },
  { id: 3, type: 'credit_card', credit_kind: 'pay_later', name: 'CRED flash', color: '#000' },
  { id: 4, type: 'bank', name: 'Salary', color: '#000' },
];

describe('All cards (board R18-AllCards)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    jest.spyOn(accountsLib, 'fetchAccounts').mockResolvedValue(accounts as never);
  });

  it('draws each card with its bill on the face and one chip under it', async () => {
    const ui = await render(<CardsScreen />);
    expect(await ui.findByText('₹8,412 due on 1 card')).toBeTruthy();
    expect(ui.getByText('Bills due · 1')).toBeTruthy();
    expect(ui.getByText('ALL 2')).toBeTruthy();
    // Pay-later lines and bank accounts are not cards.
    expect(ui.queryByLabelText(/CRED flash/)).toBeNull();

    expect(ui.getByLabelText('SBI BPCL: ₹8,412, Due 18 Nov')).toBeTruthy();
    expect(ui.getByLabelText('Mark paid, SBI BPCL')).toBeTruthy();
    expect(ui.getByText('3 entries this month')).toBeTruthy();

    expect(ui.getByLabelText('HDFC Swiggy: No bill, Next on 2 Dec')).toBeTruthy();
    await fireEvent.press(ui.getByLabelText('Add bill, HDFC Swiggy'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/accounts/[id]', params: { id: '2', add: 'statement' } });

    await fireEvent.press(ui.getByTestId('card-face-1'));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/accounts/[id]', params: { id: '1' } });
  });

  it("switches to this month's spend", async () => {
    const ui = await render(<CardsScreen />);
    await fireEvent.press(await ui.findByTestId('cards-tab-spend'));
    expect(ui.getByText('₹4,200 spent')).toBeTruthy();
    expect(ui.getByLabelText('SBI BPCL: ₹4,200, 3 entries')).toBeTruthy();
    expect(ui.queryByLabelText('Mark paid, SBI BPCL')).toBeNull();
  });

  it('offers to add a card when there are none', async () => {
    jest.spyOn(accountsLib, 'fetchAccounts').mockResolvedValue([accounts[3]] as never);
    const ui = await render(<CardsScreen />);
    expect(await ui.findByText('No credit cards yet')).toBeTruthy();
  });
});
