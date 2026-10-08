import { render } from '@testing-library/react-native';

import { SettlementRequests } from '@/components/split/SettlementRequests';
import {
  SETTLEMENT_PAYMENT_MODES,
  settlementPaymentCaption,
  settlementPaymentPhrase,
  type SplitSettlement,
} from '@/lib/splits';

const fromWife: SplitSettlement = {
  id: 41,
  user_id: 2,
  friend_id: 9,
  amount: 500,
  direction: 'user_paid_friend',
  date: '2026-10-07',
  notes: 'Groceries',
  payment_mode: 'upi',
  status: 'pending',
  recorded_by_name: 'Priya',
  group_name: 'Home',
};

describe('settlement payment mode', () => {
  it('tells the person asked to confirm how the money was sent', async () => {
    // The report: the receiver saw who and how much, but not how it was paid,
    // so there was nothing to check it against.
    const screen = await render(
      <SettlementRequests settlements={[fromWife]} decidingId={null} onDecide={jest.fn()} />
    );

    expect(screen.getByText(/^Priya says they paid you .*500.* by UPI\.$/)).toBeTruthy();
    expect(screen.getByText('“Groceries”')).toBeTruthy();
  });

  it('reads an older settlement without inventing a method', async () => {
    const screen = await render(
      <SettlementRequests
        settlements={[{ ...fromWife, payment_mode: '' }]}
        decidingId={null}
        onDecide={jest.fn()}
      />
    );

    expect(screen.getByText(/^Priya says they paid you .*500\.$/)).toBeTruthy();
  });

  it('words each method for a sentence and for the feed', () => {
    expect(settlementPaymentPhrase('cash')).toBe('in cash');
    expect(settlementPaymentPhrase('bank_transfer')).toBe('by bank transfer');
    expect(settlementPaymentPhrase('other')).toBeNull();
    expect(settlementPaymentPhrase('')).toBeNull();
    expect(settlementPaymentPhrase(undefined)).toBeNull();

    expect(settlementPaymentCaption('upi')).toBe('Paid by UPI');
    expect(settlementPaymentCaption('wallet')).toBe('Paid from a wallet');
    expect(settlementPaymentCaption('other')).toBe('Paid another way');
    expect(settlementPaymentCaption('')).toBeNull();
  });

  it('offers exactly the methods the server accepts', () => {
    // Mirrors split_settlements_payment_mode_check on the API.
    expect(SETTLEMENT_PAYMENT_MODES.map((mode) => mode.value).sort()).toEqual(
      ['bank_transfer', 'card', 'cash', 'other', 'upi', 'wallet'].sort()
    );
  });
});
