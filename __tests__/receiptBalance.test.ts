import type { Account } from '@/lib/accounts';
import { describeReceiptBalanceUpdate } from '@/lib/receipt-balance';

const wallet = (over: Partial<Account> = {}) =>
  ({ id: 1, type: 'wallet', name: 'Sodexo', color: '#000', ...over }) as Account;
const load = { type: 'Income', amount: 8800 };

describe('describeReceiptBalanceUpdate', () => {
  it('offers to start tracking a wallet with no balance yet', () => {
    expect(describeReceiptBalanceUpdate(wallet(), 33184.16, load)).toMatchObject({
      title: "Track Sodexo's balance?",
      confirmLabel: 'Track it',
    });
  });

  it('offers an update when the receipt disagrees with Finnri', () => {
    const question = describeReceiptBalanceUpdate(
      wallet({ summary: { running_balance: 20000 } as Account['summary'] }),
      33184.16,
      load
    );
    // ₹20,000 before, plus this ₹8,800 load.
    expect(question?.message).toBe('The receipt shows ₹33,184. Finnri has ₹28,800.');
    expect(question?.cancelLabel).toBe('Keep ₹28,800');
  });

  it('asks nothing when they already agree', () => {
    expect(
      describeReceiptBalanceUpdate(
        wallet({ summary: { running_balance: 24384.16 } as Account['summary'] }),
        33184.16,
        load
      )
    ).toBeNull();
  });

  it('asks nothing for a card, a missing balance or no account', () => {
    expect(describeReceiptBalanceUpdate(wallet({ type: 'credit_card' }), 5000, load)).toBeNull();
    expect(describeReceiptBalanceUpdate(wallet(), null, load)).toBeNull();
    expect(describeReceiptBalanceUpdate(null, 5000, load)).toBeNull();
  });
});
