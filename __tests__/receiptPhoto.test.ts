import * as ImagePicker from 'expo-image-picker';

import { pickReceiptPhoto, takePendingReceiptPhoto } from '@/lib/receipt-photo';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const photo = (uri: string) =>
  ({ canceled: false, assets: [{ uri, width: 8160, height: 6144 }] }) as ImagePicker.ImagePickerResult;

describe('pickReceiptPhoto', () => {
  beforeEach(() => jest.resetAllMocks());

  it('takes a photo once the camera is allowed', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
    picker.launchCameraAsync.mockResolvedValue(photo('file:///cache/bill.jpg'));

    await expect(pickReceiptPhoto('camera')).resolves.toEqual({
      status: 'picked',
      uri: 'file:///cache/bill.jpg',
    });
    // Full quality: the photo is shrunk once, later, not compressed twice.
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], quality: 1, allowsEditing: false })
    );
  });

  it('reports a refused camera, and whether asking again can work', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    } as never);

    await expect(pickReceiptPhoto('camera')).resolves.toEqual({
      status: 'camera-denied',
      canAskAgain: false,
    });
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('opens the gallery without asking for the camera', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue(photo('file:///cache/screenshot.png'));

    await expect(pickReceiptPhoto('library')).resolves.toEqual({
      status: 'picked',
      uri: 'file:///cache/screenshot.png',
    });
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('treats a dismissed picker as nothing to do', async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickReceiptPhoto('library')).resolves.toEqual({ status: 'cancelled' });
  });

  it('reports a picker that throws instead of throwing', async () => {
    picker.launchImageLibraryAsync.mockRejectedValue(new Error('activity not found'));
    await expect(pickReceiptPhoto('library')).resolves.toEqual({ status: 'failed' });
  });
});

describe('takePendingReceiptPhoto', () => {
  beforeEach(() => jest.resetAllMocks());

  it('hands back a photo taken while Android stopped the app', async () => {
    picker.getPendingResultAsync.mockResolvedValue(photo('file:///cache/late.jpg'));
    await expect(takePendingReceiptPhoto()).resolves.toBe('file:///cache/late.jpg');
  });

  it('returns nothing when there is no photo waiting, or it was an error', async () => {
    picker.getPendingResultAsync.mockResolvedValue(null);
    await expect(takePendingReceiptPhoto()).resolves.toBeNull();
    picker.getPendingResultAsync.mockResolvedValue({ code: 'ERR', message: 'failed' } as never);
    await expect(takePendingReceiptPhoto()).resolves.toBeNull();
  });
});
