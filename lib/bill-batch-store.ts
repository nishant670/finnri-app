import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BillItem } from '@/lib/bill-batch';

/**
 * What passes between Home and the bills screen, and what survives Android
 * stopping Finnri while the camera is open.
 *
 * Kept in memory and taken once — reading removes it — like
 * `lib/statement-intake.ts`, so a revisited screen never replays an old hand-off.
 */

export type BillPhotoOrigin = 'camera' | 'library';

type PhotoIntake = { uris: string[]; origin: BillPhotoOrigin };

let photoIntake: PhotoIntake | null = null;
let singleBill: string | null = null;
let savedToast: string | null = null;

/** Photos Home picked, for the bills screen to open with. */
export const putBillPhotos = (intake: PhotoIntake) => {
  photoIntake = intake;
};
export const takeBillPhotos = (): PhotoIntake | null => {
  const intake = photoIntake;
  photoIntake = null;
  return intake;
};

/**
 * One bill is read by Home's own scan, unchanged (the review sheet, wallet
 * balance, refunds). The bills screen hands that photo back and closes.
 */
export const putSingleBill = (uri: string) => {
  singleBill = uri;
};
export const takeSingleBill = (): string | null => {
  const uri = singleBill;
  singleBill = null;
  return uri;
};

/** "2 bills saved · ₹2,020", shown by Home's save toast once the tray closes. */
export const putBillsSavedToast = (message: string) => {
  savedToast = message;
};
export const takeBillsSavedToast = (): string | null => {
  const message = savedToast;
  savedToast = null;
  return message;
};

/* ---- The tray on disk ---------------------------------------------------- */

const STORAGE_KEY = 'finnri.billBatch.v1';
/** A tray older than this is a forgotten one, not an interrupted one. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type StoredBillBatch = {
  batchId: string;
  phase: 'pick' | 'tray';
  origin: BillPhotoOrigin;
  items: BillItem[];
  savedAt: number;
};

export const saveBillBatch = async (batch: Omit<StoredBillBatch, 'savedAt'>) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...batch, savedAt: Date.now() }));
  } catch {
    // Keeping the tray is a convenience; failing to keep it is not an error.
  }
};

export const clearBillBatch = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
};

/**
 * The tray as it was, or null. A read that was in flight when Finnri stopped
 * comes back as failed with Retry: it may already have been charged, so it is
 * never re-sent without the person asking. Bills that were saving come back as
 * read — the save is idempotent per bill only within one run, so they are
 * offered again rather than assumed saved.
 */
export const loadBillBatch = async (now = Date.now()): Promise<StoredBillBatch | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredBillBatch;
    if (!stored?.items?.length || now - stored.savedAt > STALE_AFTER_MS) {
      await clearBillBatch();
      return null;
    }
    const pending = stored.items.filter((item) => item.status !== 'saved');
    if (pending.length === 0) {
      await clearBillBatch();
      return null;
    }
    return {
      ...stored,
      items: pending.map((item): BillItem => {
        if (item.status === 'reading') {
          return {
            ...item,
            status: 'failed',
            failure: {
              title: 'Reading stopped',
              message: 'Finnri was closed while reading. Tap Retry.',
              free: false,
              retryable: true,
            },
          };
        }
        if (item.status === 'saving') return { ...item, status: 'read' };
        return item;
      }),
    };
  } catch {
    return null;
  }
};
