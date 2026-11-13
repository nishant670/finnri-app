import * as ImagePicker from 'expo-image-picker';

/**
 * Where a bill photo comes from. "Scan a bill" offers both: the camera for the
 * bill in hand, the gallery for a photo or payment screenshot already taken.
 */
export type ReceiptPhotoSource = 'camera' | 'library';

export type ReceiptPhotoPick =
  | { status: 'picked'; uri: string }
  | { status: 'cancelled' }
  /** The camera permission was refused. `canAskAgain` false means only Settings can grant it. */
  | { status: 'camera-denied'; canAskAgain: boolean }
  | { status: 'failed' };

/**
 * Full quality on purpose: the photo is shrunk and re-encoded once, in
 * `prepareReceiptScanImage`, and a JPEG compressed twice loses the fine print
 * the reader needs. The gallery opens Android's system photo picker, which
 * needs no storage permission.
 */
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 1,
  exif: false,
  allowsEditing: false,
  allowsMultipleSelection: false,
};

const toPick = (result: ImagePicker.ImagePickerResult): ReceiptPhotoPick => {
  if (result.canceled) return { status: 'cancelled' };
  const uri = result.assets?.[0]?.uri;
  return uri ? { status: 'picked', uri } : { status: 'failed' };
};

export const pickReceiptPhoto = async (source: ReceiptPhotoSource): Promise<ReceiptPhotoPick> => {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { status: 'camera-denied', canAskAgain: permission.canAskAgain };
      }
      return toPick(await ImagePicker.launchCameraAsync(PICK_OPTIONS));
    }
    return toPick(await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS));
  } catch {
    return { status: 'failed' };
  }
};

export type ReceiptPhotosPick =
  | { status: 'picked'; uris: string[] }
  | { status: 'cancelled' }
  | { status: 'camera-denied'; canAskAgain: boolean }
  | { status: 'failed' };

/**
 * Several bills at once (P95). The gallery opens Android's photo picker with
 * multi-select, capped at `limit`; the camera still takes one photo per open,
 * and the bills screen offers "Take another" for the next.
 */
export const pickReceiptPhotos = async (
  source: ReceiptPhotoSource,
  limit: number
): Promise<ReceiptPhotosPick> => {
  if (source === 'camera' || limit <= 1) {
    const pick = await pickReceiptPhoto(source);
    return pick.status === 'picked' ? { status: 'picked', uris: [pick.uri] } : pick;
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      ...PICK_OPTIONS,
      allowsMultipleSelection: true,
      selectionLimit: limit,
      orderedSelection: true,
    });
    if (result.canceled) return { status: 'cancelled' };
    const uris = (result.assets ?? [])
      .map((asset) => asset.uri)
      .filter(Boolean)
      .slice(0, limit);
    return uris.length > 0 ? { status: 'picked', uris } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
};

/**
 * A photo taken while Android stopped Finnri to free memory for the camera.
 *
 * The camera app is heavy, and on a phone short of memory the system can end
 * Finnri's process while it is open. The photo is not lost: the picker keeps
 * it, and this hands it back once on the next launch. The image picker is
 * only used for bills, so a pending photo is always a bill to read.
 */
export const takePendingReceiptPhoto = async (): Promise<string | null> => {
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (!pending || !('canceled' in pending) || pending.canceled) return null;
    return pending.assets?.[0]?.uri ?? null;
  } catch {
    return null;
  }
};
