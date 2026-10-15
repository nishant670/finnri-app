import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { PaymentFormSheet } from '@/components/statements/PaymentFormSheet';
import type { Account } from '@/lib/accounts';

const card: Account = { id: 1, type: 'credit_card', name: 'HDFC Regalia', color: '#000' };
const otherCard: Account = { id: 2, type: 'credit_card', name: 'SBI Card', color: '#000' };
const bank: Account = { id: 3, type: 'bank', name: 'SBI Savings', color: '#000' };

const renderSheet = async (variant: 'statement' | 'paid-off') => {
  const onSubmit = jest.fn();
  const screen = await render(
    <PaymentFormSheet
      variant={variant}
      visible
      remainingDue={75000}
      minimumDue={variant === 'statement' ? 3750 : 0}
      accounts={[card, otherCard, bank]}
      cardId={card.id}
      submitting={false}
      error={null}
      onClose={jest.fn()}
      onSubmit={onSubmit}
    />
  );
  return { screen, onSubmit };
};

// The report: three ₹25,000 card spends are already logged, so the ₹75,000
// bill must not be counted again. "Mark card paid off" was a yes/no that
// cleared the card and wrote nothing; it now asks, optionally, where the money
// came from.
describe('PaymentFormSheet — mark card paid off', () => {
  it('reads as paying the card off, with no partial-payment warning', async () => {
    const { screen } = await renderSheet('paid-off');
    expect(screen.getAllByText('Mark card paid off').length).toBeGreaterThan(0);
    expect(screen.getByText(/spent on this card since it was last cleared/)).toBeTruthy();
    expect(screen.getByText('Optional — leave empty if someone else paid')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('12,400'), '50000');
    expect(screen.queryByText(/will stay unpaid/)).toBeNull();
  });

  it('sends the bank account it was paid from, never a card', async () => {
    const { screen, onSubmit } = await renderSheet('paid-off');
    await fireEvent.press(screen.getByTestId('payment-source-options'));
    expect(screen.queryByText('SBI Card')).toBeNull();
    await fireEvent.press(screen.getByText('SBI Savings'));
    await fireEvent.press(screen.getByText('Mark paid off'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 75000, from_account_id: bank.id })
    );
  });

  it('can be paid off with no account, as when someone else paid', async () => {
    const { screen, onSubmit } = await renderSheet('paid-off');
    await fireEvent.press(screen.getByText('Mark paid off'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ from_account_id: null }));
  });

  it('leaves the statement sheet as it was', async () => {
    const { screen } = await renderSheet('statement');
    expect(screen.getAllByText('Record payment').length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByPlaceholderText('12,400'), '50000');
    expect(screen.getByText(/will stay unpaid/)).toBeTruthy();
  });
});
