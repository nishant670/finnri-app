import { fireEvent, render } from '@testing-library/react-native';

import { CreateGroupModal } from '@/components/split/modals/CreateGroupModal';
import type { GroupKind } from '@/lib/split-preferences';

const setup = async (groupKind: GroupKind, kindLabel = '', balanceAlertEnabled = false) => {
  const onChangeKindLabel = jest.fn();
  const onPickKindIcon = jest.fn();
  const onToggleBalanceAlert = jest.fn();
  const onChangeBalanceAlertAmount = jest.fn();
  const screen = await render(
    <CreateGroupModal
      visible
      saving={false}
      title="Create a group"
      doneLabel="Create group"
      groupName="Dyninno Diwali lunch"
      groupKind={groupKind}
      photoUri={null}
      photoBusy={false}
      onPickPhoto={jest.fn()}
      onRemovePhoto={jest.fn()}
      kindLabel={kindLabel}
      kindIcon="party-popper"
      balanceAlertEnabled={balanceAlertEnabled}
      balanceAlertAmount=""
      friends={[]}
      selectedFriendIds={[]}
      newMemberNames={[]}
      onAddNewMember={jest.fn()}
      onRemoveNewMember={jest.fn()}
      onChangeName={jest.fn()}
      onChangeKind={jest.fn()}
      onChangeKindLabel={onChangeKindLabel}
      onPickKindIcon={onPickKindIcon}
      onToggleBalanceAlert={onToggleBalanceAlert}
      onChangeBalanceAlertAmount={onChangeBalanceAlertAmount}
      onToggleFriend={jest.fn()}
      onClose={jest.fn()}
      onDone={jest.fn()}
    />
  );
  return {
    screen,
    onChangeKindLabel,
    onPickKindIcon,
    onToggleBalanceAlert,
    onChangeBalanceAlertAmount,
  };
};

describe('the Create group sheet', () => {
  it('asks what an Other group is for and offers icons for it', async () => {
    const { screen, onChangeKindLabel, onPickKindIcon } = await setup('other');
    await fireEvent.changeText(screen.getByLabelText('What is this group for'), 'Office');
    expect(onChangeKindLabel).toHaveBeenCalledWith('Office');
    await fireEvent.press(screen.getByLabelText('Icon briefcase'));
    expect(onPickKindIcon).toHaveBeenCalledWith('briefcase-outline');
  });

  it('keeps the label field to Other', async () => {
    const { screen } = await setup('trip');
    expect(screen.queryByLabelText('What is this group for')).toBeNull();
  });

  it('offers the balance alert free, with an amount once it is on', async () => {
    const off = await setup('trip');
    expect(off.screen.getByText('Balance alert')).toBeTruthy();
    expect(off.screen.queryByText('Finnri plan')).toBeNull();
    expect(off.screen.queryByLabelText('Balance alert amount')).toBeNull();

    const on = await setup('trip', '', true);
    await fireEvent.changeText(on.screen.getByLabelText('Balance alert amount'), '5000');
    expect(on.onChangeBalanceAlertAmount).toHaveBeenCalledWith('5000');
  });
});
