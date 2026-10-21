import type { Account } from '@/lib/accounts';
import {
  ACCOUNT_DETAIL_COPY,
  COLORS,
  DAYS,
  DEFAULT_ACCOUNT_COLORS,
  DEFAULT_ACCOUNT_NAMES,
  MONTHS,
  getMissingSetupCount,
  providerIcon,
  typeOptions,
} from '@/lib/account-form';

const account = (over: Partial<Account>) =>
  ({ id: 1, type: 'bank', name: 'A', ...over }) as Account;

describe('getMissingSetupCount', () => {
  it('asks a cash account only for an opening balance', () => {
    expect(getMissingSetupCount(account({ type: 'cash', balance: 0 }))).toBe(1);
    expect(getMissingSetupCount(account({ type: 'cash', balance: 500 }))).toBe(0);
  });

  it('counts provider, identifier and balance for a bank account', () => {
    expect(getMissingSetupCount(account({ type: 'bank' }))).toBe(3);
    expect(getMissingSetupCount(account({ type: 'bank', provider: 'HDFC' }))).toBe(2);
    expect(getMissingSetupCount(account({ type: 'bank', provider: 'HDFC', last4: '1234' }))).toBe(
      1
    );
    expect(
      getMissingSetupCount(account({ type: 'bank', provider: 'HDFC', last4: '1234', balance: 10 }))
    ).toBe(0);
  });

  it('accepts any of the identifier fields, ignoring whitespace-only values', () => {
    const base = { type: 'bank' as const, provider: 'x', balance: 1 };
    expect(getMissingSetupCount(account({ ...base, upi_handle: 'a@b' }))).toBe(0);
    expect(getMissingSetupCount(account({ ...base, wallet_nickname: 'w' }))).toBe(0);
    expect(getMissingSetupCount(account({ ...base, identifier: 'ref' }))).toBe(0);
    expect(getMissingSetupCount(account({ ...base, last4: '   ' }))).toBe(1);
    expect(getMissingSetupCount(account({ ...base, provider: '  ' }))).toBe(2);
  });

  it('for a credit card counts provider, identifier, limit and due day, not balance', () => {
    expect(getMissingSetupCount(account({ type: 'credit_card' }))).toBe(4);
    expect(
      getMissingSetupCount(
        account({
          type: 'credit_card',
          provider: 'HDFC',
          last4: '4321',
          credit_limit: 100000,
          due_day: 15,
        })
      )
    ).toBe(0);
  });

  it('treats an out-of-range due day as missing', () => {
    const full = { type: 'credit_card' as const, provider: 'x', last4: '1', credit_limit: 1 };
    expect(getMissingSetupCount(account({ ...full, due_day: 0 }))).toBe(1);
    expect(getMissingSetupCount(account({ ...full, due_day: 32 }))).toBe(1);
    expect(getMissingSetupCount(account({ ...full, due_day: 31 }))).toBe(0);
  });
});

describe('account form config', () => {
  const types = ['cash', 'upi', 'bank', 'credit_card', 'debit_card', 'wallet', 'other'] as const;

  it('has a name, colour and detail copy for every account type', () => {
    for (const t of types) {
      expect(DEFAULT_ACCOUNT_NAMES[t]).toBeTruthy();
      expect(DEFAULT_ACCOUNT_COLORS[t]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ACCOUNT_DETAIL_COPY[t].message).toBeTruthy();
      expect(ACCOUNT_DETAIL_COPY[t].balanceLabel).toBeTruthy();
    }
  });

  it('offers each type once, with "other" last (the success screen falls back to it)', () => {
    expect(typeOptions.map((o) => o.key).sort()).toEqual([...types].sort());
    expect(typeOptions[typeOptions.length - 1].key).toBe('other');
  });

  it('labels a card balance as an outstanding amount and everything else as a balance', () => {
    expect(ACCOUNT_DETAIL_COPY.credit_card.balanceLabel).toBe('Opening outstanding');
    expect(ACCOUNT_DETAIL_COPY.bank.balanceLabel).toBe('Opening balance');
  });

  it('only asks for a provider on types that have one', () => {
    expect(ACCOUNT_DETAIL_COPY.cash.providerLabel).toBeUndefined();
    expect(ACCOUNT_DETAIL_COPY.other.providerLabel).toBeUndefined();
    expect(ACCOUNT_DETAIL_COPY.upi.providerLabel).toBe('UPI app');
  });

  it('lists days 1–31 as strings and twelve months', () => {
    expect(DAYS).toHaveLength(31);
    expect(DAYS[0]).toBe('1');
    expect(DAYS[30]).toBe('31');
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toBe('January');
    expect(COLORS.length).toBeGreaterThan(5);
  });
});

describe('providerIcon', () => {
  it('maps known asset keys and falls back to an outlined bank', () => {
    expect(providerIcon('amazon')).toBe('shopping-outline');
    expect(providerIcon('google')).toBe('google');
    expect(providerIcon('something-new')).toBe('bank-outline');
  });
});
