import { fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';

import { CreateGroupModal } from '@/components/split/modals/CreateGroupModal';
import { SplitFriendRow } from '@/components/split/rows/SplitFriendRow';
import { activityYourSide } from '@/lib/split-screen-model';
import { remindFriend, remindMessage } from '@/lib/split-remind';
import { newMemberPayload, type SplitActivityItem, type SplitFriend } from '@/lib/splits';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const biwi = { id: 1, name: 'Biwi' } as SplitFriend;
const asha = { id: 2, name: 'Asha Rao' } as SplitFriend;

describe('People rows on Balances (P23–P25)', () => {
  const renderRow = (netBalance: number) => {
    const handlers = { onRemind: jest.fn(), onSettle: jest.fn() };
    return render(
      <SplitFriendRow
        friend={biwi}
        netBalance={netBalance}
        groupCount={2}
        entranceIndex={0}
        isOpen={false}
        onOpenChange={jest.fn()}
        onEdit={jest.fn()}
        onArchive={jest.fn()}
        onOpen={jest.fn()}
        onLongPress={jest.fn()}
        {...handlers}
      />
    ).then((screen) => ({ screen, ...handlers }));
  };

  it('offers Remind and Settle up while the friend owes you', async () => {
    const { screen, onRemind, onSettle } = await renderRow(10999);
    expect(screen.getByText('In 2 groups')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remind Biwi'));
    await fireEvent.press(screen.getByLabelText('Settle up with Biwi'));
    expect(onRemind).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  it('only offers Settle up when you owe them, and nothing when settled', async () => {
    const owing = await renderRow(-500);
    expect(owing.screen.queryByLabelText('Remind Biwi')).toBeNull();
    expect(owing.screen.getByLabelText('Settle up with Biwi')).toBeTruthy();
    const settled = await renderRow(0);
    expect(settled.screen.queryByLabelText('Settle up with Biwi')).toBeNull();
  });

  it('writes the reminder with the amount and shares it', async () => {
    expect(remindMessage('Asha Rao', 10999)).toBe(
      "Hi Asha, a quick reminder: you owe me ₹10,999 for our shared expenses. I'm keeping track in Finnri."
    );
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await remindFriend('Asha Rao', 500);
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('₹500') });
  });
});

describe('Your side of an activity row (P26)', () => {
  const bill = (participants: SplitActivityItem['participants']) =>
    ({ id: 'b', type: 'bill', record_id: 1, title: 'Dinner', date: '', created_at: '', amount: 1240, participants }) as SplitActivityItem;

  it('says what you lent or owe on an expense', () => {
    expect(
      activityYourSide(bill([{ friend_id: 1, share_amount: 620, direction: 'friend_owes_user' }]))
    ).toMatchObject({ label: 'you lent ₹620', tone: 'positive' });
    expect(
      activityYourSide(bill([{ friend_id: 1, share_amount: 300, direction: 'user_owes_friend' }]))
    ).toMatchObject({ label: 'you owe ₹300', tone: 'negative' });
  });

  it('says which way a settlement went', () => {
    const settlement = {
      id: 's',
      type: 'settlement',
      record_id: 2,
      title: 'Biwi paid you',
      date: '',
      created_at: '',
      amount: 500,
      direction: 'friend_paid_user',
    } as SplitActivityItem;
    expect(activityYourSide(settlement)?.label).toBe('you got ₹500');
  });
});

describe('Add members by name (P28)', () => {
  const renderSheet = (over: Partial<React.ComponentProps<typeof CreateGroupModal>> = {}) => {
    const handlers = { onToggleFriend: jest.fn(), onAddNewMember: jest.fn(), onRemoveNewMember: jest.fn() };
    return render(
      <CreateGroupModal
        visible
        saving={false}
        title="Create a group"
        doneLabel="Create group"
        groupName=""
        groupKind="trip"
        photoUri={null}
        photoBusy={false}
        onPickPhoto={jest.fn()}
        onRemovePhoto={jest.fn()}
        balanceAlertEnabled={false}
        balanceAlertAmount=""
        friends={[biwi, asha]}
        selectedFriendIds={[]}
        newMemberNames={[]}
        onChangeName={jest.fn()}
        onChangeKind={jest.fn()}
        onToggleBalanceAlert={jest.fn()}
        onChangeBalanceAlertAmount={jest.fn()}
        onClose={jest.fn()}
        onDone={jest.fn()}
        {...handlers}
        {...over}
      />
    ).then((screen) => ({ screen, ...handlers }));
  };

  it('adds a typed name as a new member, and a known name as that friend', async () => {
    const { screen, onAddNewMember, onToggleFriend } = await renderSheet();
    await fireEvent.changeText(screen.getByLabelText('Member name or phone'), 'Riya');
    await fireEvent.press(screen.getByTestId('group-member-add'));
    expect(onAddNewMember).toHaveBeenCalledWith('Riya');

    await fireEvent.changeText(screen.getByLabelText('Member name or phone'), 'biwi');
    await fireEvent.press(screen.getByTestId('group-member-add'));
    expect(onToggleFriend).toHaveBeenCalledWith(1);
    expect(screen.getByText('New names are saved as friends too.')).toBeTruthy();
  });

  it('keeps a typed phone number as the friend’s phone', () => {
    expect(newMemberPayload(' +91 98765 43210 ')).toEqual({
      name: '+91 98765 43210',
      phone: '+919876543210',
    });
    expect(newMemberPayload('Riya')).toEqual({ name: 'Riya' });
  });
});
