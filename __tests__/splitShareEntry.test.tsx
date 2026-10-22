import { fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  TransactionFormModal,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import type { Account } from '@/lib/accounts';
import type { SplitFriend, SplitGroup } from '@/lib/splits';

const cashAccount: Account = {
  id: 1,
  type: 'cash',
  name: 'Cash',
  color: '#2ECC71',
  is_default: true,
};

const friends: SplitFriend[] = [
  { id: 11, name: 'Biwi' },
  { id: 12, name: 'Usha Rani' },
] as SplitFriend[];

const bubuDudu = {
  id: 5,
  name: 'Bubu Dudu',
  members: [
    { id: 1, friend_id: 11, friend: friends[0] },
    { id: 2, friend_id: 12, friend: friends[1] },
  ],
} as unknown as SplitGroup;

const splitForm = (overrides: Partial<EntryForm> = {}): Partial<EntryForm> => ({
  title: 'Dinner',
  amount: '',
  type: 'Expense',
  mode: 'Cash',
  category: 'Food & Drinks',
  date: '11 July 2026',
  time: '1:30 PM',
  notes: '',
  tag: 'General',
  currency: 'INR',
  accountId: 1,
  account: 'Cash',
  merchant: '',
  attachment: null,
  splitEnabled: true,
  splitGroupId: null,
  splitGroupName: '',
  splitParticipants: [
    { friendId: 11, friendName: '', shareAmount: '', direction: 'friend_owes_user' },
    { friendId: 12, friendName: '', shareAmount: '', direction: 'friend_owes_user' },
  ],
  ...overrides,
});

const renderSplitForm = async (overrides: Partial<EntryForm> = {}) => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = await render(
    <TransactionFormModal
      visible
      isEdit
      initialData={splitForm(overrides)}
      onSave={onSave}
      onClose={jest.fn()}
      mode="manual"
      accounts={[cashAccount]}
      splitFriends={friends}
      splitGroups={[bubuDudu]}
    />
  );
  return { ...screen, onSave };
};

describe('entering split shares', () => {
  // The field used to round-trip every keystroke through the total: with no
  // amount yet, the percentage came back as 0 and the input emptied itself.
  it('keeps a percentage typed before the amount is known', async () => {
    const screen = await renderSplitForm();

    await fireEvent.press(screen.getByLabelText('Percentage'));
    const [firstShare] = screen.getAllByPlaceholderText('0%');
    await fireEvent.changeText(firstShare, '40');

    await waitFor(() => expect(screen.getAllByPlaceholderText('0%')[0].props.value).toBe('40'));
  });

  it('turns the percentage into money once the amount arrives', async () => {
    const screen = await renderSplitForm();

    await fireEvent.press(screen.getByLabelText('Percentage'));
    await fireEvent.changeText(screen.getAllByPlaceholderText('0%')[0], '40');
    await fireEvent.changeText(screen.getAllByPlaceholderText('0%')[1], '25');
    await fireEvent.changeText(screen.getByTestId('entry-amount-input'), '1000');
    await fireEvent.press(screen.getByTestId('entry-save-button'));

    await waitFor(() => expect(screen.onSave).toHaveBeenCalledTimes(1));
    expect(screen.onSave.mock.calls[0][0].splitParticipants).toEqual([
      expect.objectContaining({ friendId: 11, shareAmount: '400.00' }),
      expect.objectContaining({ friendId: 12, shareAmount: '250.00' }),
    ]);
  });

  // Two people plus the payer is three ways.
  it('splits equally before an amount exists, in percentages', async () => {
    const screen = await renderSplitForm();

    await fireEvent.press(screen.getByText('Equally'));

    await waitFor(() => expect(screen.getAllByText('33.33%')).toHaveLength(2));
  });

  it('splits equally in money when the amount is known, and shows your share (P7, P8)', async () => {
    const screen = await renderSplitForm({ amount: '900' });

    await fireEvent.press(screen.getByText('Equally'));

    await waitFor(() => expect(screen.getAllByText('₹300')).toHaveLength(3));
    expect(screen.getByText(/split 3 ways · nothing left to assign/)).toBeTruthy();
  });

  it('keeps an equal split even when the total changes', async () => {
    const screen = await renderSplitForm({ amount: '900' });

    await fireEvent.press(screen.getByText('Equally'));
    await fireEvent.changeText(screen.getByTestId('entry-amount-input'), '1200');

    await waitFor(() => expect(screen.getAllByText('₹400')).toHaveLength(3));
  });

  it('saves the share the equal split produced', async () => {
    const screen = await renderSplitForm({ amount: '900' });

    await fireEvent.press(screen.getByText('Equally'));
    await fireEvent.press(screen.getByTestId('entry-save-button'));

    await waitFor(() => expect(screen.onSave).toHaveBeenCalledTimes(1));
    expect(screen.onSave.mock.calls[0][0].splitParticipants).toEqual([
      expect.objectContaining({ friendId: 11, shareAmount: '300.00' }),
      expect.objectContaining({ friendId: 12, shareAmount: '300.00' }),
    ]);
  });

  it('says when the shares add up to more than the total', async () => {
    const screen = await renderSplitForm({ amount: '1000' });

    await fireEvent.changeText(screen.getAllByPlaceholderText('₹0')[0], '700');
    await fireEvent.changeText(screen.getAllByPlaceholderText('₹0')[1], '500');

    await waitFor(() => expect(screen.getByText(/more than the total/)).toBeTruthy());
    expect(screen.getByTestId('split-your-share').props.children).toBe('₹0');
  });

  it('splits a chosen group equally across its members', async () => {
    const screen = await renderSplitForm({ amount: '1200', splitParticipants: [] });

    await fireEvent.press(screen.getByText('Bubu Dudu'));
    await fireEvent.press(screen.getByText('Split equally'));

    await waitFor(() => {
      const shares = screen.getAllByPlaceholderText('₹0');
      expect(shares).toHaveLength(2);
      expect(shares[0].props.value).toBe('400.00');
      expect(shares[1].props.value).toBe('400.00');
    });
  });

  // An amount typed by hand is the whole instruction; a leftover percentage
  // would overwrite it the next time the total moved.
  it('lets an amount typed by hand survive a change to the total', async () => {
    const screen = await renderSplitForm({ amount: '1000' });

    await fireEvent.changeText(screen.getAllByPlaceholderText('₹0')[0], '250');
    await fireEvent.changeText(screen.getByTestId('entry-amount-input'), '2000');

    await waitFor(() =>
      expect(screen.getAllByPlaceholderText('₹0')[0].props.value).toBe('250')
    );
  });
});
