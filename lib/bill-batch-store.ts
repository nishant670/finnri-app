import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BillItem } from '@/lib/bill-batch';
import type { UnconfirmedSave } from '@/lib/tray-save';

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
/**
 * A tray holding a save that was never confirmed is kept longer: without it, the
 * person could add the same money again.
 */
const UNCONFIRMED_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const staleAfter = (stored: { unconfirmed?: unknown[] } | null) =>
  stored?.unconfirmed?.length ? UNCONFIRMED_STALE_AFTER_MS : STALE_AFTER_MS;

export type StoredBillBatch = {
  batchId: string;
  phase: 'pick' | 'tray';
  origin: BillPhotoOrigin;
  items: BillItem[];
  /** The signed-in user's uuid. Another user is never shown this tray. */
  owner?: string;
  /** Requests sent but not seen to finish; see `lib/tray-save.ts`. */
  unconfirmed?: UnconfirmedSave[];
  savedAt: number;
};

export const saveBillBatch = async (batch: Omit<StoredBillBatch, 'savedAt'>) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...batch, savedAt: Date.now() }));
    return true;
  } catch {
    // Only a save about to be sent depends on this (`lib/tray-save.ts`).
    return false;
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
 * read, offered again rather than assumed saved; `unconfirmed` holds what was
 * sent for them.
 */
export const loadBillBatch = async (
  now = Date.now(),
  owner?: string
): Promise<StoredBillBatch | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredBillBatch;
    // Left on disk, for the person it belongs to.
    if (stored?.owner && owner && stored.owner !== owner) return null;
    if (!stored?.items?.length || now - stored.savedAt > staleAfter(stored)) {
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
