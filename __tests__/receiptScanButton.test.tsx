import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import { TransactionFormModal } from '@/components/transactions/TransactionFormModal';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

const picker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;

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

describe('Scan bill on the add sheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('picks an image and hands it to the parent', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/bill.jpg', name: 'bill.jpg', lastModified: 0 }],
    } as DocumentPicker.DocumentPickerResult);
    const onScanReceipt = jest.fn();
    const { findByTestId } = await renderSheet({ onScanReceipt });

    await fireEvent.press(await findByTestId('scan-receipt'));

    await waitFor(() => expect(onScanReceipt).toHaveBeenCalledWith('file:///cache/bill.jpg'));
    expect(picker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/*' })
    );
  });

  it('does nothing when the picker is cancelled', async () => {
    picker.getDocumentAsync.mockResolvedValue({
      canceled: true,
      assets: null,
    } as DocumentPicker.DocumentPickerResult);
    const onScanReceipt = jest.fn();
    const { findByTestId } = await renderSheet({ onScanReceipt });

    await fireEvent.press(await findByTestId('scan-receipt'));

    await waitFor(() => expect(picker.getDocumentAsync).toHaveBeenCalled());
    expect(onScanReceipt).not.toHaveBeenCalled();
  });

  it('is not offered when editing or reviewing a draft', async () => {
    const edit = await renderSheet({ onScanReceipt: jest.fn(), isEdit: true });
    expect(edit.queryByTestId('scan-receipt')).toBeNull();
    await edit.unmount();

    const draft = await renderSheet({ onScanReceipt: jest.fn(), mode: 'audio' });
    expect(draft.queryByTestId('scan-receipt')).toBeNull();
  });
});
