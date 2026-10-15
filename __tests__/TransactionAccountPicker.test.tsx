import { fireEvent, render } from '@testing-library/react-native';

import { TransactionAccountPicker } from '@/components/transactions/TransactionAccountPicker';
import type { Account, AccountSuggestion } from '@/lib/accounts';

const accounts = [
  { id: 1, type: 'upi', name: 'Salary UPI', provider: 'HDFC' },
  { id: 2, type: 'upi', name: 'Spare UPI' },
] as unknown as Account[];
const suggestion = { name: 'UPI' } as unknown as AccountSuggestion;

const setup = async (
  overrides: Partial<React.ComponentProps<typeof TransactionAccountPicker>> = {}
) => {
  const handlers = {
    onClose: jest.fn(),
    onSelect: jest.fn(),
    onSetupSuggestedAccount: jest.fn(),
    onAutoCreateSuggestedAccount: jest.fn(),
    onManageAccounts: jest.fn(),
  };
  const screen = await render(
    <TransactionAccountPicker
      visible
      accounts={accounts}
      selectedAccountId={1}
      mode="UPI"
      suggestion={null}
      isAutoCreating={false}
      autoCreateError={null}
      {...handlers}
      {...overrides}
    />
  );
  return { screen, ...handlers };
};

describe('TransactionAccountPicker', () => {
  it('lists accounts with their provider, falling back to the type', async () => {
    const { screen } = await setup();
    expect(screen.getByText('Salary UPI')).toBeTruthy();
    expect(screen.getByText('HDFC')).toBeTruthy();
    expect(screen.getByText('upi')).toBeTruthy();
  });

  it('reports the tapped account', async () => {
    const { screen, onSelect } = await setup();
    await fireEvent.press(screen.getByText('Spare UPI'));
    expect(onSelect).toHaveBeenCalledWith(accounts[1]);
  });

  it('closes before handing off to account management', async () => {
    const order: string[] = [];
    const { screen, onClose, onManageAccounts } = await setup();
    onClose.mockImplementation(() => order.push('close'));
    onManageAccounts.mockImplementation(() => order.push('manage'));
    await fireEvent.press(screen.getByText('Add or manage payment accounts'));
    expect(order).toEqual(['close', 'manage']);
    expect(onManageAccounts).toHaveBeenCalledWith();
  });

  it('omits the manage row when there is no handler', async () => {
    const { screen } = await setup({ onManageAccounts: undefined });
    expect(screen.queryByText('Add or manage payment accounts')).toBeNull();
  });

  describe('with no matching account', () => {
    it('names the mode and offers to set one up, closing first', async () => {
      const { screen, onClose, onSetupSuggestedAccount } = await setup({
        accounts: [],
        suggestion,
      });
      expect(screen.getByText('No UPI account found.')).toBeTruthy();
      await fireEvent.press(screen.getByText('Set up account'));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSetupSuggestedAccount).toHaveBeenCalledWith(suggestion);
    });

    it('falls back to "matching" when no mode is chosen', async () => {
      const { screen } = await setup({ accounts: [], mode: '' });
      expect(screen.getByText('No matching account found.')).toBeTruthy();
      expect(screen.queryByText('Set up account')).toBeNull();
    });

    it('creates an account without closing, and shows progress and errors', async () => {
      const { screen, onClose, onAutoCreateSuggestedAccount } = await setup({
        accounts: [],
        suggestion,
        autoCreateError: 'Could not create it.',
      });
      await fireEvent.press(screen.getByText('Create one for me'));
      expect(onAutoCreateSuggestedAccount).toHaveBeenCalledWith(suggestion);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('Could not create it.')).toBeTruthy();
      expect(
        (await setup({ accounts: [], suggestion, isAutoCreating: true })).screen.getByText(
          'Creating…'
        )
      ).toBeTruthy();
    });

    it('passes the suggestion on when managing accounts', async () => {
      const { screen, onManageAccounts } = await setup({ accounts: [], suggestion });
      await fireEvent.press(screen.getByText('Manage accounts'));
      expect(onManageAccounts).toHaveBeenCalledWith(suggestion);
    });
  });
});
