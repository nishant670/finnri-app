import { fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  TransactionPaymentPicker,
  buildPaymentRows,
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
    expect(screen.queryByText('Add or manage payment accounts')).toBeNull();
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
    await fireEvent.press(screen.getByText('Set up account'));
    expect(onSetupSuggestedAccount).toHaveBeenCalledWith(suggestion);
  });

  it('shows the account after the method on the form row', () => {
    expect(paymentRowValue('UPI', 'Salary UPI', true)).toBe('UPI · Salary UPI');
    expect(paymentRowValue('Cash', 'Cash Account', true)).toBe('Cash');
    expect(paymentRowValue('UPI', 'Salary UPI', false)).toBe('UPI');
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
