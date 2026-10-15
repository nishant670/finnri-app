import { fireEvent, render } from '@testing-library/react-native';

import { TransactionReceiptField } from '@/components/transactions/TransactionReceiptField';

const setup = async (
  overrides: Partial<React.ComponentProps<typeof TransactionReceiptField>> = {}
) => {
  const onPick = jest.fn();
  const onRemove = jest.fn();
  const screen = await render(
    <TransactionReceiptField
      attachment={null}
      error={null}
      withSectionLabel
      onPick={onPick}
      onRemove={onRemove}
      {...overrides}
    />
  );
  return { screen, onPick, onRemove };
};

describe('TransactionReceiptField', () => {
  it('offers to attach when nothing is attached', async () => {
    const { screen, onPick } = await setup();
    expect(screen.getByText('Attach a photo or PDF')).toBeTruthy();
    expect(screen.queryByLabelText('Remove receipt')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Attach a receipt'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('shows the section label only when asked to', async () => {
    expect((await setup()).screen.getByText('Receipt')).toBeTruthy();
    expect((await setup({ withSectionLabel: false })).screen.queryByText('Receipt')).toBeNull();
  });

  it('names a freshly picked local file and says it uploads on save', async () => {
    const { screen } = await setup({
      attachment: 'file:///cache/DocumentPicker/bill%20one.jpg?x=1',
    });
    expect(screen.getByText('bill one.jpg')).toBeTruthy();
    expect(screen.getByText('Uploads when you save')).toBeTruthy();
    expect(screen.getByLabelText('Change receipt')).toBeTruthy();
  });

  it('says an already uploaded file is saved', async () => {
    const { screen } = await setup({ attachment: 'https://api.example.com/uploads/abc.pdf' });
    expect(screen.getByText('abc.pdf')).toBeTruthy();
    expect(screen.getByText('Saved to this transaction')).toBeTruthy();
  });

  it('removes through its own control', async () => {
    const { screen, onRemove } = await setup({ attachment: 'file:///cache/bill.jpg' });
    await fireEvent.press(screen.getByLabelText('Remove receipt'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders the error beneath the row', async () => {
    const { screen } = await setup({ error: 'That file could not be read.' });
    expect(screen.getByText('That file could not be read.')).toBeTruthy();
  });
});
