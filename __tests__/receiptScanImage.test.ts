import {
  prepareReceiptScanImage,
  RECEIPT_SCAN_MAX_BYTES,
  ReceiptPhotoTooLargeError,
} from '@/lib/uploads';
import { describeReceiptScanFailure, ParseApiError } from '@/lib/parse';

const mockLoadAsync = jest.fn();
jest.mock('expo-image', () => ({
  Image: { loadAsync: (...args: unknown[]) => mockLoadAsync(...args) },
}));

const fileSystem = require('expo-file-system') as {
  __setFileSize: (uri: string, size: number) => void;
  __deletedFiles: string[];
  __resetFiles: () => void;
};

const manipulator = require('expo-image-manipulator') as {
  __manipulatorState: {
    source: { width: number; height: number };
    resizes: { width?: number | null; height?: number | null }[];
    saveOptions: { compress?: number; format?: string } | null;
    failNext: boolean;
  };
  __resetManipulator: () => void;
};

/** A 50-megapixel phone camera frame, about 14 MB as a JPEG. */
const CAMERA_PHOTO = 'file:///cache/camera.jpg';
const SHRUNK = 'file:///cache/manipulated.jpg';

beforeEach(() => {
  jest.clearAllMocks();
  fileSystem.__resetFiles();
  manipulator.__resetManipulator();
  fileSystem.__setFileSize(CAMERA_PHOTO, 14 * 1024 * 1024);
  fileSystem.__setFileSize(SHRUNK, 600 * 1024);
});

describe('prepareReceiptScanImage', () => {
  it('decodes a huge photo already scaled down, then caps the long edge at 2048', async () => {
    // The bounded loader may stop just above the cap on the long edge.
    mockLoadAsync.mockResolvedValue({ width: 2048, height: 2731 });

    const prepared = await prepareReceiptScanImage(CAMERA_PHOTO);

    expect(mockLoadAsync).toHaveBeenCalledWith(CAMERA_PHOTO, { maxWidth: 2048, maxHeight: 2048 });
    expect(manipulator.__manipulatorState.resizes).toEqual([{ height: 2048 }]);
    expect(manipulator.__manipulatorState.saveOptions).toEqual({ compress: 0.8, format: 'jpeg' });
    expect(prepared.temporary).toBe(true);
    expect(prepared.file.uri).toBe(SHRUNK);
  });

  it('falls back to the two-pass decode when the bounded loader fails', async () => {
    mockLoadAsync.mockRejectedValue(new Error('no loader'));
    manipulator.__manipulatorState.source = { width: 8160, height: 6144 };

    const prepared = await prepareReceiptScanImage(CAMERA_PHOTO);

    expect(manipulator.__manipulatorState.resizes).toEqual([{ width: 2048 }]);
    expect(prepared.file.uri).toBe(SHRUNK);
  });

  it('refuses on the phone a photo it cannot shrink, instead of sending 14 MB to be refused', async () => {
    mockLoadAsync.mockRejectedValue(new Error('out of memory'));
    manipulator.__manipulatorState.failNext = true;

    await expect(prepareReceiptScanImage(CAMERA_PHOTO)).rejects.toBeInstanceOf(
      ReceiptPhotoTooLargeError
    );
  });

  it('still sends a small original when it cannot be decoded here', async () => {
    const small = 'file:///cache/screenshot.png';
    fileSystem.__setFileSize(small, 900 * 1024);
    mockLoadAsync.mockRejectedValue(new Error('unsupported'));
    manipulator.__manipulatorState.failNext = true;

    const prepared = await prepareReceiptScanImage(small);

    expect(prepared).toEqual({ file: expect.objectContaining({ uri: small }), temporary: false });
  });

  it('does not send a shrunk copy that is still over the limit', async () => {
    mockLoadAsync.mockResolvedValue({ width: 2048, height: 1536 });
    fileSystem.__setFileSize(SHRUNK, RECEIPT_SCAN_MAX_BYTES + 1);

    await expect(prepareReceiptScanImage(CAMERA_PHOTO)).rejects.toBeInstanceOf(
      ReceiptPhotoTooLargeError
    );
    expect(fileSystem.__deletedFiles).toContain(SHRUNK);
  });
});

describe('describeReceiptScanFailure', () => {
  it('says a failed read cost nothing when the server says so', () => {
    const failure = describeReceiptScanFailure(
      new ParseApiError({ error: 'receipt_unreadable', credits_charged: 0 }, 422, 'fallback')
    );
    expect(failure.title).toBe('Finnri could not find a total');
    expect(failure.message).toMatch(/No credits were used\.$/);
  });

  it('says nothing about credits when the server did not', () => {
    const failure = describeReceiptScanFailure(
      new ParseApiError({ error: 'insufficient_ai_credits' }, 402, 'fallback')
    );
    expect(failure.message).not.toMatch(/No credits were used/);
  });

  it('explains a photo refused on the phone, and that nothing was sent', () => {
    const failure = describeReceiptScanFailure(new ReceiptPhotoTooLargeError());
    expect(failure.title).toBe('That photo is too large');
    expect(failure.message).toMatch(/Nothing was sent and no credits were used/);
    expect(failure.message).not.toMatch(/crop/i);
  });
});
