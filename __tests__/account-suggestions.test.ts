import {
  bestAccountForHint,
  getAutoAccountPayloadForPaymentMode,
  matchAccountsToHint,
  suggestAccountFromTransaction,
  type Account,
} from '@/lib/accounts';
import { PAYMENT_MODES } from '@/lib/payment-modes';

const account = (overrides: Partial<Account>): Account => ({
  id: 1,
  type: 'credit_card',
  name: 'Card',
  color: '#8257E5',
  ...overrides,
});

describe('transaction account suggestions', () => {
  it('prefills provider, card type, and last four from a parser hint', () => {
    expect(
      suggestAccountFromTransaction(
        { mode: 'Credit Card', accountHint: 'my HDFC card ending 1234', cardNetwork: 'Visa' },
        []
      )
    ).toMatchObject({
      type: 'credit_card',
      provider: 'HDFC',
      identifier: '1234',
      name: 'HDFC Credit Card',
    });
  });

  it('does not suggest an account when that provider already exists', () => {
    expect(
      suggestAccountFromTransaction(
        { mode: 'Credit Card', accountHint: 'HDFC card' },
        [account({ provider: 'HDFC Bank', name: 'HDFC Millennia' })]
      )
    ).toBeNull();
  });

  it('stops asking once the hinted account is added to the list', () => {
    const hint = { mode: 'UPI', accountHint: 'SBI upi' };
    const before: Account[] = [];
    expect(suggestAccountFromTransaction(hint, before)).toMatchObject({
      type: 'upi',
      provider: 'SBI',
    });

    // The prompt is re-derived from the live accounts, so the account created
    // from the prompt itself settles it.
    const after = [account({ id: 2, type: 'upi', name: 'SBI Account', provider: 'SBI' })];
    expect(suggestAccountFromTransaction(hint, after)).toBeNull();
  });

  it('does not invent a suggestion without a specific account hint', () => {
    expect(
      suggestAccountFromTransaction({ mode: 'Credit Card', accountHint: 'my credit card' }, [])
    ).toBeNull();
  });
});

describe('auto-create payload coverage', () => {
  // `Bank Account` was missing, so "Create one for me" threw before it reached
  // the network — on salary, the transaction most likely to need it. A mode
  // without a default is a dead button, so assert the whole set rather than
  // the one that broke.
  it('has an auto-create payload for every payment mode', () => {
    const missing = PAYMENT_MODES.filter(
      (mode) => getAutoAccountPayloadForPaymentMode(mode) === null
    );
    expect(missing).toEqual([]);
  });

  it('creates a bank account for bank-account mode', () => {
    const payload = getAutoAccountPayloadForPaymentMode('Bank Account');
    expect(payload).toMatchObject({ type: 'bank' });
  });
});

describe('matching a parser hint to a saved account', () => {
  const amazonIcici = account({ id: 7, name: 'Amazon ICICI', provider: 'ICICI Bank' });
  const oneCard = account({ id: 1, name: 'One Card', provider: 'Federal Bank', is_default: true });
  const hdfcSwiggy = account({ id: 3, name: 'HDFC Swiggy', provider: 'HDFC Bank' });
  const hdfcMillennia = account({ id: 4, name: 'HDFC Millennia', provider: 'HDFC Bank' });
  const accounts = [oneCard, amazonIcici, hdfcSwiggy, hdfcMillennia];

  it('finds the card when the words are the same and the order is not', () => {
    const hint = { mode: 'Credit Card', accountHint: 'ICICI Amazon credit card' };
    expect(bestAccountForHint(hint, accounts)?.id).toBe(7);
    // ...so it no longer offers to add a card the user already has.
    expect(suggestAccountFromTransaction(hint, accounts)).toBeNull();
  });

  it('returns every plausible card for a bank-only hint, so the sheet can ask', () => {
    const matches = matchAccountsToHint(
      { mode: 'Credit Card', accountHint: 'HDFC card' },
      accounts
    );
    expect(matches.map((match) => match.account.id).sort()).toEqual([3, 4]);
  });

  it('treats the last four digits as a certain match', () => {
    const withDigits = [oneCard, account({ id: 9, name: 'Travel card', last4: '4321' })];
    expect(
      bestAccountForHint({ mode: 'Credit Card', accountHint: 'card ending 4321' }, withDigits)?.id
    ).toBe(9);
  });

  it('does not match an unrelated card or the wrong kind of account', () => {
    expect(
      matchAccountsToHint({ mode: 'Credit Card', accountHint: 'Kotak card' }, accounts)
    ).toEqual([]);
    expect(
      matchAccountsToHint(
        { mode: 'UPI', accountHint: 'ICICI Amazon' },
        accounts
      )
    ).toEqual([]);
  });

  it('still suggests a new card when none of the saved ones fit', () => {
    expect(
      suggestAccountFromTransaction({ mode: 'Credit Card', accountHint: 'Kotak card' }, accounts)
    ).toMatchObject({ provider: 'Kotak' });
  });
});

