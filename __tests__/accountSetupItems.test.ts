import { getAccountSetupItems } from '@/lib/account-display';
import type { Account } from '@/lib/accounts';

const account = (over: Partial<Account>) => ({ id: 1, name: 'Test', ...over }) as Account;

describe('getAccountSetupItems (boards R5-AcctCard, R5-AcctBank)', () => {
  it('lists a card’s four details, with what was entered or what adding it gets you', () => {
    const items = getAccountSetupItems(
      account({ type: 'credit_card', provider: 'HDFC', last4: '1001', due_day: 5 })
    );
    expect(items.map((item) => [item.label, item.complete, item.detail])).toEqual([
      ['Card issuer', true, 'HDFC'],
      ['Last 4 digits', true, '•••• 1001'],
      ['Credit limit', false, 'See how much of your limit is free'],
      ['Due date', true, 'The 5th of each month'],
    ]);
  });

  it('names a bank account’s details for a bank', () => {
    const items = getAccountSetupItems(account({ type: 'bank', provider: 'ICICI Bank' }));
    expect(items.map((item) => item.label)).toEqual(['Bank', 'Last 4 digits', 'Opening balance']);
    expect(items.filter((item) => item.complete)).toHaveLength(1);
    expect(items[1].detail).toBe('Tell it apart from your other accounts');
  });

  it('asks cash for its opening balance only', () => {
    expect(getAccountSetupItems(account({ type: 'cash', balance: 500 }))).toEqual([
      expect.objectContaining({ label: 'Opening cash balance', complete: true, detail: '₹500' }),
    ]);
  });
});
