import { fireEvent, render } from '@testing-library/react-native';

import { VoiceInputCard } from '@/components/home/VoiceInputCard';
import { ReceiptSourceSheet } from '@/components/transactions/ReceiptSourceSheet';
import { TransactionFormModal } from '@/components/transactions/TransactionFormModal';

const renderSheet = (props: Partial<React.ComponentProps<typeof TransactionFormModal>> = {}) =>
  render(
    <TransactionFormModal
      visible
      onClose={jest.fn()}
      onSave={jest.fn().mockResolvedValue(undefined)}
      mode="manual"
      {...props}
    />
  );

describe('Scan a bill on the add sheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks the parent to start a scan, which then asks camera or gallery', async () => {
    const onRequestReceiptScan = jest.fn();
    const { findByTestId, getByText } = await renderSheet({ onRequestReceiptScan });

    expect(getByText('Scan a bill instead')).toBeTruthy();
    await fireEvent.press(await findByTestId('scan-receipt'));

    expect(onRequestReceiptScan).toHaveBeenCalledTimes(1);
  });

  it('is not offered when editing or reviewing a draft', async () => {
    const edit = await renderSheet({ onRequestReceiptScan: jest.fn(), isEdit: true });
    expect(edit.queryByTestId('scan-receipt')).toBeNull();
    await edit.unmount();

    const draft = await renderSheet({ onRequestReceiptScan: jest.fn(), mode: 'audio' });
    expect(draft.queryByTestId('scan-receipt')).toBeNull();
  });

  it('has a real drag handle at the top', async () => {
    const { findByTestId } = await renderSheet();
    expect(await findByTestId('sheet-drag-handle')).toBeTruthy();
  });
});

describe('Scan a bill on Home', () => {
  const captureProps = {
    onMicPress: jest.fn(),
    isRecording: false,
    hasRecording: false,
    inputText: '',
    onChangeText: jest.fn(),
    onProcess: jest.fn(),
    onClear: jest.fn(),
  };

  it('sits beside "Type instead"', async () => {
    const onScanBill = jest.fn();
    const screen = await render(<VoiceInputCard {...captureProps} onScanBill={onScanBill} />);

    expect(screen.getByText('Type instead')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('scan-bill-home'));
    expect(onScanBill).toHaveBeenCalledTimes(1);
  });

  it('is not offered where the screen cannot scan', async () => {
    const screen = await render(<VoiceInputCard {...captureProps} />);
    expect(screen.queryByTestId('scan-bill-home')).toBeNull();
  });
});

describe('Where the bill photo comes from', () => {
  it('offers the camera and the gallery', async () => {
    const onChoose = jest.fn();
    const screen = await render(<ReceiptSourceSheet visible onChoose={onChoose} onClose={jest.fn()} />);

    await fireEvent.press(screen.getByTestId('receipt-source-camera'));
    await fireEvent.press(screen.getByTestId('receipt-source-library'));

    expect(onChoose.mock.calls).toEqual([['camera'], ['library']]);
    expect(screen.getByText(/uses AI credits only when it finds a total/)).toBeTruthy();
  });

  it('closes without choosing', async () => {
    const onClose = jest.fn();
    const onChoose = jest.fn();
    const screen = await render(<ReceiptSourceSheet visible onChoose={onChoose} onClose={onClose} />);

    await fireEvent.press(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
