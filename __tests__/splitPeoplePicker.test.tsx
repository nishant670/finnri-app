import { fireEvent, render } from '@testing-library/react-native';
import * as Contacts from 'expo-contacts/legacy';

import { FriendDetailModal } from '@/components/split/modals/FriendDetailModal';
import { PeoplePickerModal, type PeoplePickerTarget } from '@/components/split/modals/PeoplePickerModal';
import type { DeviceContactOption, FriendDetailSummary, SplitGroupSummary } from '@/components/split/split-types';
import { contactMatchesFriend } from '@/components/split/split-utils';
import type { SplitBill, SplitFriend } from '@/lib/splits';

/**
 * Device feedback, 27 Oct: "Friends on Finnri" sat under the whole phone book
 * and listed every saved friend; Add friend on Friends had no contacts; and
 * "Non-group expenses" looked like a group that could only start a new bill.
 */

const biwi = { id: 7, name: 'Biwi', phone: '9871801518', linked_user_id: 42 } as SplitFriend;
const usha = { id: 8, name: 'Usha Rani', email: 'usha@example.com' } as SplitFriend;

const contacts: DeviceContactOption[] = [
  // Biwi again, as the phone book writes her number.
  { id: 'c1', name: 'Biwi (phone)', phone: '+91 98718 01518' },
  { id: 'c2', name: 'Waseem Ahmad', phone: '+91 98683 18527' },
];

const groupTarget: PeoplePickerTarget = {
  kind: 'group',
  summary: { group: { id: 1, name: 'Test' } } as unknown as SplitGroupSummary,
};

const renderPicker = (over: Partial<React.ComponentProps<typeof PeoplePickerModal>> = {}) => {
  const h = {
    onChangeSearchQuery: jest.fn(),
    onToggleFriend: jest.fn(),
    onToggleContact: jest.fn(),
    onRequestContactsAccess: jest.fn(),
    onCreateFriend: jest.fn(),
    onClose: jest.fn(),
    onSave: jest.fn(),
  };
  return render(
    <PeoplePickerModal
      target={groupTarget}
      friends={[biwi, usha]}
      contacts={contacts}
      contactsPermissionStatus={Contacts.PermissionStatus.GRANTED}
      contactsAccessPrivileges="all"
      contactsLoading={false}
      searchQuery=""
      selectedFriendIds={[]}
      selectedContactIds={[]}
      saving={false}
      {...h}
      {...over}
    />
  ).then((screen) => ({ screen, ...h }));
};

describe('contactMatchesFriend', () => {
  it('matches a +91 phone-book number to a friend saved without the country code', () => {
    expect(contactMatchesFriend(contacts[0], biwi)).toBe(true);
    expect(contactMatchesFriend(contacts[1], biwi)).toBe(false);
  });
});

describe('PeoplePickerModal', () => {
  it('lists your friends above your contacts, and only linked ones as on Finnri', async () => {
    const { screen } = await renderPicker();
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Your friends')).toBeGreaterThan(-1);
    expect(tree.indexOf('Your friends')).toBeLessThan(tree.indexOf('From your contacts'));
    expect(screen.queryByText('Friends on Finnri')).toBeNull();
    expect(screen.getAllByText('On Finnri')).toHaveLength(1);
  });

  it('lists a contact who is already a friend once, as the friend', async () => {
    const { screen } = await renderPicker();
    expect(screen.getByText('Biwi')).toBeTruthy();
    expect(screen.queryByText('Biwi (phone)')).toBeNull();
    expect(screen.getByText('Waseem Ahmad')).toBeTruthy();
  });

  it('only holds a tapped contact, and shows it as a chip that lets it go', async () => {
    const { screen, onToggleContact } = await renderPicker({ selectedContactIds: ['c2'] });
    await fireEvent.press(screen.getByLabelText('Remove Waseem Ahmad'));
    expect(onToggleContact).toHaveBeenCalledWith(contacts[1]);
  });

  it('adds friends from contacts alone, with nothing to save until one is picked', async () => {
    const { screen, onSave } = await renderPicker({ target: { kind: 'friends' } });
    expect(screen.getByText('Add friends')).toBeTruthy();
    expect(screen.queryByText('Your friends')).toBeNull();
    expect(screen.getByText('1 contact is already your friend.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add the chosen friends'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('the friend page', () => {
  const ungrouped = {
    id: 31,
    title: 'Movie tickets',
    date: '2026-10-20',
    total_amount: 666,
    group_id: null,
    participants: [{ friend_id: 7, share_amount: 333, direction: 'friend_owes_user' }],
  } as unknown as SplitBill;

  const summary: FriendDetailSummary = {
    friend: biwi,
    balance: null,
    groups: [],
    bills: [ungrouped],
    netBalance: 333,
  };

  it('lists expenses split outside a group, and opens one', async () => {
    const onOpenExpense = jest.fn();
    const screen = await render(
      <FriendDetailModal
        summary={summary}
        friendById={new Map([[biwi.id, biwi]])}
        currentUserName="Me"
        onClose={jest.fn()}
        onAddExpense={jest.fn()}
        onSettleUp={jest.fn()}
        onOpenGroup={jest.fn()}
        onOpenExpense={onOpenExpense}
        onOpenOptions={jest.fn()}
      />
    );
    expect(screen.getByText('Without a group')).toBeTruthy();
    expect(screen.queryByText('Nothing shared yet')).toBeNull();
    await fireEvent.press(screen.getByText('Movie tickets'));
    expect(onOpenExpense).toHaveBeenCalledWith(ungrouped);
  });

  it('offers no buttons that do nothing', async () => {
    const screen = await render(
      <FriendDetailModal
        summary={summary}
        friendById={new Map([[biwi.id, biwi]])}
        currentUserName="Me"
        onClose={jest.fn()}
        onAddExpense={jest.fn()}
        onSettleUp={jest.fn()}
        onOpenGroup={jest.fn()}
        onOpenExpense={jest.fn()}
        onOpenOptions={jest.fn()}
      />
    );
    for (const label of ['Remind...', 'Charts', 'Convert']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByLabelText('Search friend activity')).toBeNull();
  });
});
