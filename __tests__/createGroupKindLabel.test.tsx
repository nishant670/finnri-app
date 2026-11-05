import { fireEvent, render } from '@testing-library/react-native';

import { CreateGroupModal } from '@/components/split/modals/CreateGroupModal';
import type { GroupKind } from '@/lib/split-preferences';

const setup = async (groupKind: GroupKind, kindLabel = '') => {
  const onChangeKindLabel = jest.fn();
  const onPickKindIcon = jest.fn();
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
      friends={[]}
      selectedFriendIds={[]}
      onChangeName={jest.fn()}
      onChangeKind={jest.fn()}
      onChangeKindLabel={onChangeKindLabel}
      onPickKindIcon={onPickKindIcon}
      onToggleFriend={jest.fn()}
      onClose={jest.fn()}
      onDone={jest.fn()}
    />
  );
  return { screen, onChangeKindLabel, onPickKindIcon };
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

  it('no longer shows the Balance alert that did nothing', async () => {
    const { screen } = await setup('other');
    expect(screen.queryByText('Balance alert')).toBeNull();
    expect(screen.queryByText('Finnri plan')).toBeNull();
  });
});
