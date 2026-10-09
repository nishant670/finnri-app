import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SplitActivitySection } from '@/components/split/SplitActivitySection';
import { SplitFriendFormModal } from '@/components/split/SplitFriendFormModal';
import { SplitFriendsSection } from '@/components/split/SplitFriendsSection';
import { SplitGroupInviteModal } from '@/components/split/SplitGroupInviteModal';
import { SplitGroupsSection } from '@/components/split/SplitGroupsSection';
import { SplitHeader } from '@/components/split/SplitHeader';
import { SplitOverallBalance } from '@/components/split/SplitOverallBalance';
import { SplitSettlementModal } from '@/components/split/SplitSettlementModal';
import type { SplitGroupSummary } from '@/components/split/split-types';
import type { SplitFriend } from '@/lib/splits';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/lib/haptics', () => ({ haptics: { select: jest.fn() } }));

const friends = [
  { id: 1, name: 'Asha' },
  { id: 2, name: 'Ravi' },
] as SplitFriend[];

describe('SplitHeader', () => {
  const setup = async (over: Partial<React.ComponentProps<typeof SplitHeader>> = {}) => {
    const onToggleSearch = jest.fn();
    const onCreate = jest.fn();
    const screen = await render(
      <SplitHeader
        loading={false}
        searchVisible={false}
        activeSection="groups"
        onToggleSearch={onToggleSearch}
        onCreate={onCreate}
        {...over}
      />
    );
    return { screen, onToggleSearch, onCreate };
  };

  it('toggles search and labels it for its state', async () => {
    const { screen, onToggleSearch } = await setup();
    await fireEvent.press(screen.getByLabelText('Search splits'));
    expect(onToggleSearch).toHaveBeenCalledTimes(1);
    expect(
      (await setup({ searchVisible: true })).screen.getByLabelText('Hide split search')
    ).toBeTruthy();
  });

  it('labels the create button for the section', async () => {
    expect(
      (await setup({ activeSection: 'friends' })).screen.getByLabelText('Add split friend')
    ).toBeTruthy();
    expect(
      (await setup({ activeSection: 'activity' })).screen.getByLabelText('Create split group')
    ).toBeTruthy();
    const groups = await setup({ activeSection: 'groups' });
    await fireEvent.press(groups.screen.getByLabelText('Create split friend or group'));
    expect(groups.onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('SplitOverallBalance', () => {
  it('shows the overall figure and opens the filter', async () => {
    const onOpenFilter = jest.fn();
    const screen = await render(
      <SplitOverallBalance value={0} color="#000" hasActivity onOpenFilter={onOpenFilter} />
    );
    expect(screen.getByText('Overall, settled up')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Filter split balances'));
    expect(onOpenFilter).toHaveBeenCalledTimes(1);
  });
});

describe('SplitGroupsSection', () => {
  const group = (id: number) => ({ group: { id, name: `G${id}` } }) as unknown as SplitGroupSummary;
  const setup = async (over: Partial<React.ComponentProps<typeof SplitGroupsSection>> = {}) => {
    const h = { onShowSettled: jest.fn(), onNewGroup: jest.fn() };
    const screen = await render(
      <SplitGroupsSection
        groups={[group(1), group(2)]}
        showNonGroupSummary={false}
        hiddenSettledCount={0}
        normalizedSearch=""
        renderGroupCard={(s) => <Text key={s.group.id}>{`card ${s.group.name}`}</Text>}
        renderNonGroupRow={(index) => <Text>{`non-group at ${index}`}</Text>}
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('renders a card per group and puts the non-group row after them', async () => {
    const { screen } = await setup({ showNonGroupSummary: true });
    expect(screen.getByText('card G1')).toBeTruthy();
    expect(screen.getByText('card G2')).toBeTruthy();
    expect(screen.getByText('non-group at 2')).toBeTruthy();
  });

  it('invites the user to create a first group when there are none', async () => {
    const { screen, onNewGroup } = await setup({ groups: [] });
    expect(screen.getByText('Create your first group')).toBeTruthy();
    await fireEvent.press(screen.getByText('New group'));
    expect(onNewGroup).toHaveBeenCalledTimes(1);
  });

  it('explains an empty search instead, with no create action', async () => {
    const { screen } = await setup({ groups: [], normalizedSearch: 'zzz' });
    expect(screen.getByText('No matching groups')).toBeTruthy();
    expect(screen.queryByText('New group')).toBeNull();
  });

  it('still shows the list when only the non-group row is visible', async () => {
    const { screen } = await setup({ groups: [], showNonGroupSummary: true });
    expect(screen.getByText('non-group at 0')).toBeTruthy();
    expect(screen.queryByText('Create your first group')).toBeNull();
  });
});

describe('SplitFriendsSection', () => {
  const setup = (over: Partial<React.ComponentProps<typeof SplitFriendsSection>> = {}) => {
    const onAddFriend = jest.fn();
    return render(
      <SplitFriendsSection
        visibleFriends={friends}
        hasAnyFriends
        normalizedSearch=""
        renderFriendRow={(f) => <Text key={f.id}>{`row ${f.name}`}</Text>}
        onAddFriend={onAddFriend}
        {...over}
      />
    ).then((screen) => ({ screen, onAddFriend }));
  };

  it('renders a row per visible friend', async () => {
    const { screen } = await setup();
    expect(screen.getByText('row Asha')).toBeTruthy();
    expect(screen.getByText('row Ravi')).toBeTruthy();
  });

  it('invites adding the first friend, and offers the action', async () => {
    const { screen, onAddFriend } = await setup({ visibleFriends: [], hasAnyFriends: false });
    expect(screen.getByText('Add friends to split bills')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add friend'));
    expect(onAddFriend).toHaveBeenCalledTimes(1);
  });

  it('says nothing matched when a search or filter hides every friend', async () => {
    const { screen } = await setup({ visibleFriends: [], normalizedSearch: 'zz' });
    expect(screen.getByText('No matching friends')).toBeTruthy();
    expect(screen.queryByText('Add friend')).toBeNull();
  });
});

describe('SplitActivitySection', () => {
  const rows = [{ id: 'a' }, { id: 'b' }] as never;
  it('lists activity under its heading', async () => {
    const screen = await render(
      <SplitActivitySection
        activity={rows}
        normalizedSearch=""
        renderActivityRow={(item) => (
          <Text key={(item as { id: string }).id}>{`act ${(item as { id: string }).id}`}</Text>
        )}
      />
    );
    expect(screen.getByText('Recent activity')).toBeTruthy();
    expect(screen.getByText('act a')).toBeTruthy();
    expect(screen.getByText('act b')).toBeTruthy();
  });

  it('words the empty state for no activity versus no match', async () => {
    const none = await render(
      <SplitActivitySection activity={[]} normalizedSearch="" renderActivityRow={() => null} />
    );
    expect(none.getByText('No activity yet')).toBeTruthy();
    const miss = await render(
      <SplitActivitySection activity={[]} normalizedSearch="x" renderActivityRow={() => null} />
    );
    expect(miss.getByText('No matching activity')).toBeTruthy();
  });
});

describe('SplitFriendFormModal', () => {
  const setup = async (over: Partial<React.ComponentProps<typeof SplitFriendFormModal>> = {}) => {
    const h = {
      onChangeName: jest.fn(),
      onChangePhone: jest.fn(),
      onChangeEmail: jest.fn(),
      onSave: jest.fn(),
      onClose: jest.fn(),
    };
    const screen = await render(
      <SplitFriendFormModal
        visible
        isEditing={false}
        errorMessage={null}
        saving={false}
        name="Asha"
        phone=""
        email=""
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('titles and labels itself for adding or editing', async () => {
    const add = await setup();
    expect(add.screen.getByText('Add Friend')).toBeTruthy();
    expect(add.screen.getByText('Save friend')).toBeTruthy();
    const edit = await setup({ isEditing: true });
    expect(edit.screen.getByText('Edit Friend')).toBeTruthy();
    expect(edit.screen.getByText('Update friend')).toBeTruthy();
  });

  it('reports field edits and saves', async () => {
    const { screen, onChangeName, onSave } = await setup();
    await fireEvent.changeText(screen.getByDisplayValue('Asha'), 'Asha K');
    expect(onChangeName).toHaveBeenCalledWith('Asha K');
    await fireEvent.press(screen.getByText('Save friend'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('explains what the contact details are for', async () => {
    const { screen } = await setup();
    expect(screen.getByText(/Nothing is sent to these/)).toBeTruthy();
  });

  it('shows an error message when given one', async () => {
    const { screen } = await setup({ errorMessage: 'Name is required' });
    expect(screen.getByText('Name is required')).toBeTruthy();
  });
});

describe('SplitGroupInviteModal', () => {
  it('says the share sheet opens next, edits the address and sends', async () => {
    const h = {
      onChangeEmail: jest.fn(),
      onChangePhone: jest.fn(),
      onSend: jest.fn(),
      onClose: jest.fn(),
    };
    const screen = await render(
      <SplitGroupInviteModal
        visible
        errorMessage={null}
        saving={false}
        email="a@x.com"
        phone=""
        {...h}
      />
    );
    expect(screen.getByText('Invite a specific person')).toBeTruthy();
    expect(screen.getByText(/Finnri does not send emails or texts/)).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('a@x.com'), 'b@x.com');
    expect(h.onChangeEmail).toHaveBeenCalledWith('b@x.com');
    await fireEvent.press(screen.getByText('Share invite link'));
    expect(h.onSend).toHaveBeenCalledTimes(1);
  });
});

describe('SplitSettlementModal', () => {
  const setup = async (over: Partial<React.ComponentProps<typeof SplitSettlementModal>> = {}) => {
    const h = {
      onChangeFriend: jest.fn(),
      onChangeDirection: jest.fn(),
      onChangePaymentMode: jest.fn(),
      onChangeAmount: jest.fn(),
      onChangeDate: jest.fn(),
      onChangeNotes: jest.fn(),
      onSave: jest.fn(),
      onClose: jest.fn(),
    };
    const screen = await render(
      <SplitSettlementModal
        visible
        saving={false}
        friends={friends}
        friendId={null}
        direction="friend_paid_user"
        amount="50"
        date="2026-10-07"
        notes=""
        paymentMode={null}
        errorMessage={null}
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('picks the friend and the direction', async () => {
    const { screen, onChangeFriend, onChangeDirection } = await setup();
    await fireEvent.press(screen.getByText('Ravi'));
    expect(onChangeFriend).toHaveBeenCalledWith(2);
    await fireEvent.press(screen.getByText('You paid'));
    expect(onChangeDirection).toHaveBeenCalledWith('user_paid_friend');
    await fireEvent.press(screen.getByText('Friend paid'));
    expect(onChangeDirection).toHaveBeenCalledWith('friend_paid_user');
  });

  it('asks how it was paid, and shows why it cannot save', async () => {
    const { screen, onChangePaymentMode } = await setup({
      errorMessage: 'Choose how it was paid, so the other person can check it.',
    });
    expect(screen.getByText('How was it paid?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Bank transfer'));
    expect(onChangePaymentMode).toHaveBeenCalledWith('bank_transfer');
    expect(
      screen.getByText('Choose how it was paid, so the other person can check it.')
    ).toBeTruthy();
  });

  it('edits the amount and saves', async () => {
    const { screen, onChangeAmount, onSave } = await setup();
    await fireEvent.changeText(screen.getByDisplayValue('50'), '75');
    expect(onChangeAmount).toHaveBeenCalledWith('75');
    await fireEvent.press(screen.getByText('Save settlement'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
