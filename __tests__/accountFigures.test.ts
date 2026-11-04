import {
  getAccountHeadline,
  getCreditUsage,
  getLastActivityLabel,
  getRunningBalance,
  hasLedgerActivity,
  hasOpeningBalance,
} from '@/lib/account-display';
import type { Account, AccountSummary } from '@/lib/accounts';

const summary = (overrides: Partial<AccountSummary> = {}): AccountSummary => ({
  spent_this_month: 0,
  received_this_month: 0,
  entries_this_month: 0,
  lifetime_spent: 0,
  lifetime_received: 0,
  entries_total: 0,
  ...overrides,
});

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 1,
  type: 'bank',
  name: 'HDFC Savings',
  color: '#2563EB',
  ...overrides,
});

describe('getAccountHeadline', () => {
  it('leads a normal account with what it spent this month', () => {
    // The audit's account rows all read ₹0 after ₹40,091 of tracked spending.
    const headline = getAccountHeadline(
      account({ summary: summary({ spent_this_month: 19004, entries_total: 42 }) })
    );
    expect(headline).toEqual({ label: 'Spent this month', amount: 19004, placeholder: undefined });
  });

  it('leads a credit card with what is owed, never the limit', () => {
    // ₹2,00,000 is the limit the audit saw formatted exactly like a balance.
    const headline = getAccountHeadline(
      account({
        type: 'credit_card',
        credit_limit: 200000,
        summary: summary({ outstanding: 23500, entries_total: 12 }),
      })
    );
    expect(headline).toEqual({ label: 'Outstanding', amount: 23500 });
    expect(headline.amount).not.toBe(200000);
  });

  it('leads a wallet with what it holds once it has a balance', () => {
    // A meal wallet nobody spent from this month read "Spent this month ₹0"
    // while holding ₹33,184.
    const headline = getAccountHeadline(
      account({
        type: 'wallet',
        balance_tracked: true,
        summary: summary({ running_balance: 33184.16, entries_total: 5 }),
      })
    );
    expect(headline).toEqual({ label: 'Balance', amount: 33184.16 });
  });

  it('counts a balance the user gave as one, even when it opened at ₹0', () => {
    expect(hasOpeningBalance(account({ type: 'wallet', balance: 0, balance_tracked: true }))).toBe(true);
  });

  it('says so plainly when an account has never been used', () => {
    const headline = getAccountHeadline(account({ summary: summary() }));
    expect(headline.placeholder).toBe('No spend yet');
  });

  it('reports zero rather than guessing when the summary is missing', () => {
    // Create and update responses return the bare account.
    expect(getAccountHeadline(account())).toEqual({
      label: 'Spent this month',
      amount: 0,
      placeholder: 'No spend yet',
    });
  });
});

describe('getCreditUsage', () => {
  it('renders the limit only as a denominator', () => {
    const usage = getCreditUsage(
      account({
        type: 'credit_card',
        credit_limit: 200000,
        summary: summary({ outstanding: 23500, credit_utilisation: 11.75 }),
      })
    );
    expect(usage).not.toBeNull();
    expect(usage?.label).toBe('₹23,500 of ₹2,00,000 used');
    expect(usage?.percent).toBeCloseTo(11.75);
  });

  it('exists only for credit cards that have a limit', () => {
    expect(getCreditUsage(account({ summary: summary({ spent_this_month: 500 }) }))).toBeNull();
    expect(
      getCreditUsage(account({ type: 'credit_card', summary: summary({ outstanding: 500 }) }))
    ).toBeNull();
  });

  it('reports over-limit honestly rather than capping at 100%', () => {
    const usage = getCreditUsage(
      account({
        type: 'credit_card',
        credit_limit: 10000,
        summary: summary({ outstanding: 12000, credit_utilisation: 120 }),
      })
    );
    expect(usage?.percent).toBe(120);
  });
});

describe('getRunningBalance', () => {
  it('is shown only when the backend derived one from an opening balance', () => {
    expect(getRunningBalance(account({ summary: summary({ running_balance: 68000 }) }))).toBe(68000);
    expect(getRunningBalance(account({ summary: summary() }))).toBeNull();
    expect(getRunningBalance(account())).toBeNull();
  });
});

describe('activity flags', () => {
  it('separates "never used" from "no opening balance"', () => {
    // The "No balance" chip used to fire on any account whose typed balance was
    // 0 — including accounts with months of transactions behind them.
    const used = account({ summary: summary({ entries_total: 42 }) });
    expect(hasLedgerActivity(used)).toBe(true);
    expect(hasOpeningBalance(used)).toBe(false);

    const fresh = account({ balance: 5000, summary: summary() });
    expect(hasLedgerActivity(fresh)).toBe(false);
    expect(hasOpeningBalance(fresh)).toBe(true);
  });
});

describe('getLastActivityLabel', () => {
  const isoDaysAgo = (days: number) => {
    const day = new Date();
    day.setDate(day.getDate() - days);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate()
    ).padStart(2, '0')}`;
  };

  it('reads as a caption, not a date stamp', () => {
    expect(getLastActivityLabel(account({ summary: summary({ last_activity_date: isoDaysAgo(0) }) }))).toBe(
      'Today'
    );
    expect(getLastActivityLabel(account({ summary: summary({ last_activity_date: isoDaysAgo(1) }) }))).toBe(
      'Yesterday'
    );
    expect(getLastActivityLabel(account({ summary: summary({ last_activity_date: isoDaysAgo(4) }) }))).toBe(
      '4 days ago'
    );
  });

  it('is null for an account nothing has touched, so the line is dropped', () => {
    expect(getLastActivityLabel(account({ summary: summary() }))).toBeNull();
    expect(getLastActivityLabel(account())).toBeNull();
  });
});
