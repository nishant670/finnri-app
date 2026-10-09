import { fireEvent, render } from '@testing-library/react-native';

import { TransactionModePicker } from '@/components/transactions/TransactionModePicker';

const setup = async (visible = true) => {
  const onClose = jest.fn();
  const onSelect = jest.fn();
  const screen = await render(
    <TransactionModePicker
      visible={visible}
      options={['Cash', 'UPI', 'Bank Account']}
      selected="UPI"
      onClose={onClose}
      onSelect={onSelect}
    />
  );
  return { screen, onClose, onSelect };
};

describe('TransactionModePicker', () => {
  it('lists every option under its heading', async () => {
    const { screen } = await setup();
    expect(screen.getByText('Select Payment Method')).toBeTruthy();
    for (const label of ['Cash', 'UPI', 'Bank Account']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('reports the tapped mode', async () => {
    const { screen, onSelect } = await setup();
    await fireEvent.press(screen.getByText('Cash'));
    expect(onSelect).toHaveBeenCalledWith('Cash');
  });

  it('renders nothing while hidden', async () => {
    const { screen } = await setup(false);
    expect(screen.queryByText('Select Payment Method')).toBeNull();
  });
});
