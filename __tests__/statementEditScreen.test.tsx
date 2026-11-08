import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import StatementDetailScreen from '@/app/statements/[id]';
import * as accounts from '@/lib/accounts';
import type { Account } from '@/lib/accounts';
import * as statements from '@/lib/statements';
import type { CardStatement } from '@/lib/statements';

let mockParams: { id: string; edit?: string } = { id: '42' };
let mockFocus: () => void = () => undefined;
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useLocalSearchParams: () => mockParams,
    // Run the focus callback once, like a screen coming into view.
    useFocusEffect: (callback: () => void) => {
      mockFocus = callback;
      useEffect(callback, [callback]);
    },
  };
});
jest.mock('@/hooks/use-auth-store', () => ({
  useAuthStore: () => ({ token: 'test-token' }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const card: Account = {
  id: 7,
  type: 'credit_card',
  name: 'Regalia',
  color: '#000000',
  credit_limit: 100000,
  due_day: 5,
  statement_day: 15,
};

const statement: CardStatement = {
  id: 42,
  account_id: 7,
  cycle_start: '2026-10-16',
  cycle_end: '2026-11-15',
  statement_date: '2026-11-15',
  due_date: '2026-12-05',
  total_due: 5000,
  minimum_due: 250,
  paid_amount: 0,
  remaining_due: 5000,
  currency: 'INR',
  status: 'unpaid',
  is_overdue: false,
  days_to_due: 20,
  source: 'manual',
  payments: [],
};

describe('Editing a statement', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.requireMock('expo-router').router.back.mockClear();
    mockParams = { id: '42' };
    jest.spyOn(statements, 'fetchStatement').mockResolvedValue(statement);
    jest.spyOn(accounts, 'fetchAccounts').mockResolvedValue([card]);
  });

  it('corrects the bill in place, with the figures it already had', async () => {
    const update = jest
      .spyOn(statements, 'updateCardStatement')
      .mockResolvedValue({ ...statement, total_due: 5000 });
    const screen = await render(<StatementDetailScreen />);

    await fireEvent.press(await screen.findByLabelText('Edit statement'));
    expect(await screen.findByText('Edit statement')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith(
      'test-token',
      42,
      expect.objectContaining({ statement_date: '2026-11-15', due_date: '2026-12-05', total_due: 5000 })
    );
    // No suggestion came back, so nothing is asked.
    expect(screen.queryByText('Did the billing date move?')).toBeNull();
  });

  it('asks whether the bank moved the date, and moves only the statement day when accepted', async () => {
    jest.spyOn(statements, 'updateCardStatement').mockResolvedValue({
      ...statement,
      statement_date: '2026-11-20',
      statement_day_suggestion: { current_day: 15, observed_day: 20 },
    });
    const updateAccount = jest.spyOn(accounts, 'updateAccount').mockResolvedValue({ ...card, statement_day: 20 });
    const screen = await render(<StatementDetailScreen />);

    await fireEvent.press(await screen.findByLabelText('Edit statement'));
    await fireEvent.press(await screen.findByText('Save changes'));

    expect(await screen.findByText('Did the billing date move?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Bill on the 20th'));

    await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
    const [, accountId, payload] = updateAccount.mock.calls[0];
    expect(accountId).toBe(7);
    expect(payload.statement_day).toBe(20);
    expect(payload.due_day).toBe(5);
  });

  it('leaves the card alone when it was just this once', async () => {
    jest.spyOn(statements, 'updateCardStatement').mockResolvedValue({
      ...statement,
      statement_date: '2026-11-20',
      statement_day_suggestion: { current_day: 15, observed_day: 20 },
    });
    const updateAccount = jest.spyOn(accounts, 'updateAccount');
    const screen = await render(<StatementDetailScreen />);

    await fireEvent.press(await screen.findByLabelText('Edit statement'));
    await fireEvent.press(await screen.findByText('Save changes'));
    await fireEvent.press(await screen.findByText('Just this once'));

    await waitFor(() => expect(screen.queryByText('Did the billing date move?')).toBeNull());
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it('shows the server’s reason when the corrected date belongs to another bill', async () => {
    jest
      .spyOn(statements, 'updateCardStatement')
      .mockRejectedValue(new statements.StatementApiError('This card already has a statement on that date.', 409, 'statement_date_taken'));
    const screen = await render(<StatementDetailScreen />);

    await fireEvent.press(await screen.findByLabelText('Edit statement'));
    await fireEvent.press(await screen.findByText('Save changes'));

    expect(await screen.findByText('This card already has a statement on that date.')).toBeTruthy();
  });

  it('deletes the bill and goes back, keeping imported rows unless asked', async () => {
    const remove = jest.spyOn(statements, 'deleteStatement').mockResolvedValue(undefined);
    const { findByTestId, getByText } = await render(<StatementDetailScreen />);

    await fireEvent.press(await findByTestId('statement-delete'));
    await fireEvent.press(getByText('Delete'));

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith('test-token', 42, { removeImported: false })
    );
    expect(jest.requireMock('expo-router').router.back).toHaveBeenCalled();
  });

  it('opens the form straight away when sent to correct the date', async () => {
    mockParams = { id: '42', edit: '1' };
    const { findByText } = await render(<StatementDetailScreen />);

    expect(await findByText('Save changes')).toBeTruthy();
  });

  it('goes back when the bill has been deleted elsewhere', async () => {
    const fetchOne = jest.spyOn(statements, 'fetchStatement');
    const { findByTestId } = await render(<StatementDetailScreen />);
    await findByTestId('statement-delete');
    fetchOne.mockRejectedValue(new statements.StatementApiError('gone', 404));

    await act(async () => mockFocus());

    await waitFor(() =>
      expect(jest.requireMock('expo-router').router.back).toHaveBeenCalled()
    );
  });

  it('says in the confirmation that the imported rows are going', async () => {
    jest
      .spyOn(statements, 'fetchStatement')
      .mockResolvedValue({ ...statement, imported_count: 3 });
    const { findByTestId, findByText } = await render(<StatementDetailScreen />);

    await fireEvent.press(await findByTestId('statement-delete'));
    expect(await findByText(/Transactions added from this statement stay/)).toBeTruthy();
    await fireEvent.press(await findByTestId('statement-remove-imported'));
    expect(await findByText(/The 3 transactions added from this statement will be removed too/)).toBeTruthy();
  });

  it('offers to remove the rows this statement imported', async () => {
    jest
      .spyOn(statements, 'fetchStatement')
      .mockResolvedValue({ ...statement, imported_count: 3 });
    const remove = jest.spyOn(statements, 'deleteStatement').mockResolvedValue(undefined);
    const { findByTestId, getByText } = await render(<StatementDetailScreen />);

    await fireEvent.press(await findByTestId('statement-remove-imported'));
    await fireEvent.press(await findByTestId('statement-delete'));
    await fireEvent.press(getByText('Delete'));

    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith('test-token', 42, { removeImported: true })
    );
  });
});
