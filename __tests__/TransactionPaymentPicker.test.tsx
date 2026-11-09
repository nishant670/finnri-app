import { fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  TransactionPaymentPicker,
  buildPaymentRows,
  searchPaymentAccounts,
  usualPaymentAccounts,
} from '@/components/transactions/TransactionPaymentPicker';
import type { Account, AccountSuggestion } from '@/lib/accounts';
import { TransactionFormModal, paymentRowValue } from '@/components/transactions/TransactionFormModal';
import { lastPaymentFor, rememberLastPayment, resetLastPaymentForTests } from '@/lib/last-payment';

const accounts = [
  { id: 1, type: 'cash', name: 'Cash Account' },
  { id: 2, type: 'upi', name: 'Salary UPI', provider: 'HDFC' },
  { id: 3, type: 'upi', name: 'Spare UPI' },
  { id: 4, type: 'credit_card', name: 'Axis Card' },
] as unknown as Account[];
const modes = ['Cash', 'Bank Account', 'UPI', 'Credit Card'] as const;

const setup = async (
  overrides: Partial<React.ComponentProps<typeof TransactionPaymentPicker>> = {}
) => {
  const handlers = { onClose: jest.fn(), onSelect: jest.fn(), onManageAccounts: jest.fn() };
  const screen = await render(
    <TransactionPaymentPicker
      visible
      title="Paid with"
      modes={modes}
      accounts={accounts}
      selectedMode="UPI"
      selectedAccountId={2}
      showAccounts
      {...handlers}
      {...overrides}
    />
  );
  return { screen, ...handlers };
};

describe('Paid with picker (P6)', () => {
  it('puts each account under its method, with a heading only where there are several', () => {
    const rows = buildPaymentRows({
      modes,
      accounts,
      selectedMode: 'UPI',
      selectedAccountId: 3,
      showAccounts: true,
    });
    expect(rows.map((row) => row.key)).toEqual([
      'mode:Cash',
      'mode:Bank Account',
      'header:UPI',
      'account:UPI:2',
      'account:UPI:3',
      'mode:Credit Card',
    ]);
    expect(rows.find((row) => row.kind === 'option' && row.selected)?.key).toBe('account:UPI:3');
  });

  it('picks a method and its account in one tap', async () => {
    const { screen, onSelect } = await setup();
    await fireEvent.press(screen.getByText('Spare UPI'));
    expect(onSelect).toHaveBeenCalledWith('UPI', expect.objectContaining({ id: 3 }));

    await fireEvent.press(screen.getByTestId('payment-mode-Bank Account'));
    expect(onSelect).toHaveBeenLastCalledWith('Bank Account', null);
    expect(screen.getByText('No account added')).toBeTruthy();
  });

  it('lists methods only when a friend paid', async () => {
    const { screen } = await setup({ showAccounts: false });
    expect(screen.queryByText('Salary UPI')).toBeNull();
    expect(screen.queryByText('Add or manage accounts')).toBeNull();
    expect(screen.getByText('UPI')).toBeTruthy();
  });

  it('offers to set up an account for a method that has none', async () => {
    const onSetupSuggestedAccount = jest.fn();
    const suggestion = { name: 'Bank' } as unknown as AccountSuggestion;
    const { screen } = await setup({
      selectedMode: 'Bank Account',
      selectedAccountId: null,
      suggestion,
      onSetupSuggestedAccount,
    });
    // The offer sits under the chosen method's row, not in a floating stack.
    expect(screen.getByTestId('payment-setup-panel')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set up'));
    expect(onSetupSuggestedAccount).toHaveBeenCalledWith(suggestion);
  });

  it('ends the list with a row for managing accounts', async () => {
    const onManageAccounts = jest.fn();
    const { screen } = await setup({ onManageAccounts });
    await fireEvent.press(screen.getByTestId('payment-manage-accounts'));
    expect(onManageAccounts).toHaveBeenCalled();
  });

  it('shows the account after the method on the form row', () => {
    expect(paymentRowValue('UPI', 'Salary UPI', true)).toBe('UPI · Salary UPI');
    expect(paymentRowValue('Cash', 'Cash Account', true)).toBe('Cash');
    expect(paymentRowValue('UPI', 'Salary UPI', false)).toBe('UPI');
  });
});

describe('Paid with for someone with many accounts (R16)', () => {
  const used = (entries_this_month: number, last_activity_date = '2026-11-01') => ({
    summary: { entries_this_month, last_activity_date, entries_total: entries_this_month + 1 },
  });
  const many = [
    { id: 1, type: 'cash', name: 'Cash', ...used(2) },
    { id: 2, type: 'upi', name: 'HDFC UPI', ...used(9) },
    { id: 3, type: 'bank', name: 'HDFC Savings', last4: '1111' },
    { id: 4, type: 'credit_card', name: 'SBI BPCL', last4: '4321', ...used(5) },
    { id: 5, type: 'credit_card', name: 'Axis Ace', last4: '2207', provider: 'Axis Bank' },
    { id: 6, type: 'credit_card', name: 'OneCard', last4: '0091', ...used(1) },
  ] as unknown as Account[];

  it('keeps the plain list below six accounts', async () => {
    const { screen } = await setup({ accounts: many.slice(0, 5) });
    expect(screen.queryByText('Your usual')).toBeNull();
    expect(screen.queryByLabelText('Search your accounts')).toBeNull();
  });

  it('ranks the usual accounts by use, and always includes the chosen one', () => {
    const ids = (selectedAccountId: number | null) =>
      usualPaymentAccounts({ modes, accounts: many, selectedAccountId }).map((c) => c.account.id);
    expect(ids(null)).toEqual([2, 4, 1]);
    expect(ids(4)).toEqual([2, 4, 1]);
    // Never used, but chosen: takes the last place rather than being hidden.
    expect(ids(5)).toEqual([2, 4, 5]);
  });

  it('leaves out accounts never used unless they are the default', () => {
    const fresh = [
      { id: 1, type: 'upi', name: 'New UPI' },
      { id: 2, type: 'bank', name: 'Main', is_default: true },
    ] as unknown as Account[];
    expect(
      usualPaymentAccounts({ modes, accounts: fresh, selectedAccountId: null }).map((c) => c.account.id)
    ).toEqual([2]);
  });

  it('folds a method with several accounts behind its count and picks from inside', async () => {
    const { screen, onSelect } = await setup({ accounts: many, selectedMode: 'Cash', selectedAccountId: 1 });
    expect(screen.getByText('3 cards')).toBeTruthy();
    expect(screen.queryByTestId('payment-account-5')).toBeNull();

    await fireEvent.press(screen.getByTestId('payment-group-Credit Card'));
    await fireEvent.press(screen.getByTestId('payment-account-5'));
    expect(onSelect).toHaveBeenCalledWith('Credit Card', expect.objectContaining({ id: 5 }));
  });

  it('opens one method at a time', async () => {
    const twoUpi = [...many, { id: 7, type: 'upi', name: 'Spare UPI' }] as unknown as Account[];
    const { screen } = await setup({ accounts: twoUpi, selectedMode: 'Cash', selectedAccountId: 1 });
    await fireEvent.press(screen.getByTestId('payment-group-Credit Card'));
    await fireEvent.press(screen.getByTestId('payment-group-UPI'));
    expect(screen.queryByTestId('payment-account-5')).toBeNull();
    expect(screen.getByTestId('payment-account-7')).toBeTruthy();
  });

  it('picks a usual account in one tap and selects a single-account method directly', async () => {
    const { screen, onSelect } = await setup({ accounts: many, selectedMode: 'Cash', selectedAccountId: 1 });
    await fireEvent.press(screen.getByTestId('payment-usual-4'));
    expect(onSelect).toHaveBeenLastCalledWith('Credit Card', expect.objectContaining({ id: 4 }));
    await fireEvent.press(screen.getByTestId('payment-mode-Bank Account'));
    expect(onSelect).toHaveBeenLastCalledWith('Bank Account', expect.objectContaining({ id: 3 }));
  });

  it('searches by name, bank, last digits and method', async () => {
    const found = (query: string) =>
      searchPaymentAccounts(modes, many, query).map((c) => c.account.id);
    expect(found('sbi')).toEqual([4]);
    expect(found('axis bank')).toEqual([5]);
    expect(found('0091')).toEqual([6]);
    expect(found('credit')).toEqual([4, 5, 6]);
    expect(found('  ')).toEqual([]);

    const { screen, onSelect } = await setup({ accounts: many, selectedMode: 'Cash', selectedAccountId: 1 });
    await fireEvent.changeText(screen.getByLabelText('Search your accounts'), 'one');
    expect(screen.queryByText('Your usual')).toBeNull();
    await fireEvent.press(screen.getByTestId('payment-result-6'));
    expect(onSelect).toHaveBeenCalledWith('Credit Card', expect.objectContaining({ id: 6 }));

    await fireEvent.changeText(screen.getByLabelText('Search your accounts'), 'zzz');
    expect(screen.getByText('No account matches "zzz".')).toBeTruthy();
  });

  it('stays a list of methods when a friend paid, however many accounts there are', async () => {
    const { screen } = await setup({ accounts: many, showAccounts: false });
    expect(screen.queryByText('Your usual')).toBeNull();
  });

  it('still ends with managing accounts, and still offers setup for an empty method', async () => {
    const onManageAccounts = jest.fn();
    const noBank = [
      ...many.filter((a) => a.id !== 3),
      { id: 8, type: 'upi', name: 'Third UPI' },
    ] as unknown as Account[];
    const { screen } = await setup({
      accounts: noBank,
      selectedMode: 'Bank Account',
      selectedAccountId: null,
      suggestion: { name: 'Bank' } as unknown as AccountSuggestion,
      onSetupSuggestedAccount: jest.fn(),
      onManageAccounts,
    });
    expect(screen.getByTestId('payment-setup-panel')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('payment-manage-accounts'));
    expect(onManageAccounts).toHaveBeenCalled();
  });
});

describe('Last payment used (P9)', () => {
  beforeEach(() => resetLastPaymentForTests());

  it('remembers expense and income methods apart', () => {
    rememberLastPayment('Expense', { mode: 'UPI', accountId: 2 });
    rememberLastPayment('Income', { mode: 'Bank Account', accountId: null });
    expect(lastPaymentFor('Expense')).toEqual({ mode: 'UPI', accountId: 2 });
    expect(lastPaymentFor('Income')).toEqual({ mode: 'Bank Account', accountId: null });
  });
});

describe('A blank entry starts on the last method (P9)', () => {
  beforeEach(() => resetLastPaymentForTests());

  const upi = { id: 2, type: 'upi', name: 'HDFC UPI', color: '#00D2B4' } as Account;
  const cash = { id: 1, type: 'cash', name: 'Cash', color: '#2ECC71', is_default: true } as Account;

  it('opens on it, says so, and remembers what the next save used', async () => {
    rememberLastPayment('Expense', { mode: 'UPI', accountId: 2 });
    const onSave = jest.fn().mockResolvedValue(undefined);
    const screen = await render(
      <TransactionFormModal
        visible
        onClose={jest.fn()}
        onSave={onSave}
        mode="manual"
        startOnLastPayment
        accounts={[cash, upi]}
        initialData={{ title: 'Tea', amount: '20', type: 'Expense', mode: 'Cash', accountId: null }}
      />
    );

    expect(await screen.findByLabelText('Paid with UPI · HDFC UPI')).toBeTruthy();
    expect(screen.getByText(/· last used/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('entry-account-picker'));
    await fireEvent.press(screen.getByTestId('payment-mode-Cash'));
    expect(screen.queryByText(/· last used/)).toBeNull();

    await fireEvent.press(screen.getByTestId('entry-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(lastPaymentFor('Expense')).toEqual({ mode: 'Cash', accountId: 1 });
  });

  it('leaves prompts and edits on their own method', async () => {
    rememberLastPayment('Expense', { mode: 'UPI', accountId: 2 });
    const screen = await render(
      <TransactionFormModal
        visible
        onClose={jest.fn()}
        onSave={jest.fn()}
        mode="manual"
        accounts={[cash, upi]}
        initialData={{ title: 'Tea', amount: '20', type: 'Expense', mode: 'Cash', accountId: 1 }}
      />
    );
    expect(await screen.findByLabelText('Paid with Cash')).toBeTruthy();
    expect(screen.queryByText(/· last used/)).toBeNull();
  });
});
