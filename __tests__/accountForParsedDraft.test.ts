import { accountForParsedDraft, paymentModeForAccountType, type Account } from '@/lib/accounts';

const account = (over: Partial<Account>) => ({ color: '#000', ...over }) as Account;

const sodexo = account({ id: 1, type: 'wallet', name: 'Sodexo', provider: 'Pluxee' });
const hdfcBank = account({ id: 2, type: 'bank', name: 'HDFC Savings', provider: 'HDFC Bank' });
const hdfcCard = account({ id: 3, type: 'credit_card', name: 'HDFC Millennia', provider: 'HDFC Bank' });
const paytm = account({ id: 4, type: 'wallet', name: 'Paytm', provider: 'Paytm' });
const accounts = [sodexo, hdfcBank, hdfcCard, paytm];

describe('accountForParsedDraft', () => {
  it('reads a wallet hint against every account when the read had no mode', () => {
    expect(
      accountForParsedDraft({ type: 'income', mode: null, account_hint: 'Pluxee Card' }, accounts)
    ).toBe(sodexo);
  });

  it('takes the payer as the wallet for money loaded into one', () => {
    expect(
      accountForParsedDraft({ type: 'income', mode: null, merchant: 'Pluxee' }, accounts)
    ).toBe(sodexo);
  });

  it('never takes an expense merchant as the account', () => {
    expect(
      accountForParsedDraft({ type: 'expense', mode: null, merchant: 'Paytm' }, accounts)
    ).toBeNull();
  });

  it('leaves a tie to the user rather than guessing bank or card', () => {
    expect(
      accountForParsedDraft({ type: 'expense', mode: null, account_hint: 'HDFC' }, accounts)
    ).toBeNull();
  });

  it('keeps matching within the mode when the read gave one', () => {
    expect(
      accountForParsedDraft({ type: 'expense', mode: 'Credit Card', account_hint: 'HDFC' }, accounts)
    ).toBe(hdfcCard);
  });
});

describe('paymentModeForAccountType', () => {
  it.each([
    ['wallet', 'Wallets'],
    ['bank', 'Bank Account'],
    ['credit_card', 'Credit Card'],
    ['upi', 'UPI'],
    ['cash', 'Cash'],
    ['other', null],
  ])('uses %s through %s', (type, mode) => {
    expect(paymentModeForAccountType(type)).toBe(mode);
  });
});
