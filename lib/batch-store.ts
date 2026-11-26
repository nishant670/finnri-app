import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ParseBatch } from '@/lib/parse';
import type { UnconfirmedSave } from '@/lib/tray-save';
import type { DayItem } from '@/lib/voice-batch';

/**
 * What passes between Home and the spoken-day tray (`app/batch.tsx`, P103),
 * and what survives Android stopping Finnri while the tray is open.
 *
 * Hand-offs are read once — reading removes them — like `bill-batch-store`,
 * so a revisited screen never replays an old answer.
 */

export type DayBatchIntake = {
  batch: ParseBatch;
  inputSource: 'voice' | 'text';
};

let intake: DayBatchIntake | null = null;
let savedToast: DaySavedToast | null = null;

export const putDayBatch = (value: DayBatchIntake) => {
  intake = value;
};
export const takeDayBatch = (): DayBatchIntake | null => {
  const value = intake;
  intake = null;
  return value;
};

/**
 * "7 saved · ₹1,430 out" for Home's toast, with the ids Undo deletes (P115).
 * `undoIds` is empty when Undo can't take everything back (a split or a
 * subscription was made), and Home then shows the toast without Undo.
 */
export type DaySavedToast = { message: string; undoIds: number[] };

export const putDaySavedToast = (value: DaySavedToast) => {
  savedToast = value;
};
export const takeDaySavedToast = (): DaySavedToast | null => {
  const value = savedToast;
  savedToast = null;
  return value;
};

/* ---- The tray on disk ---------------------------------------------------- */

const STORAGE_KEY = 'finnri.dayBatch.v1';
/** A tray older than this is a forgotten one, not an interrupted one. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
/**
 * A tray holding a save that was never confirmed is kept longer: without it, the
 * person could add the same money again.
 */
const UNCONFIRMED_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const staleAfter = (stored: { unconfirmed?: unknown[] } | null) =>
  stored?.unconfirmed?.length ? UNCONFIRMED_STALE_AFTER_MS : STALE_AFTER_MS;

export type StoredDayBatch = {
  batchId: string;
  batch: ParseBatch;
  inputSource: 'voice' | 'text';
  items: DayItem[];
  /** The signed-in user's uuid. Another user is never shown this tray. */
  owner?: string;
  /** Requests sent but not seen to finish; see `lib/tray-save.ts`. */
  unconfirmed?: UnconfirmedSave[];
  savedAt: number;
};

export const saveDayBatch = async (value: Omit<StoredDayBatch, 'savedAt'>) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
    return true;
  } catch {
    // Only a save about to be sent depends on this (`lib/tray-save.ts`).
    return false;
  }
};

export const clearDayBatch = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
};

/**
 * The tray as it was, or null. Rows that were saving come back ready: their
 * save may not have landed, and `unconfirmed` holds what was sent for them.
 */
export const loadDayBatch = async (
  now = Date.now(),
  owner?: string
): Promise<StoredDayBatch | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDayBatch;
    // Left on disk, for the person it belongs to.
    if (stored?.owner && owner && stored.owner !== owner) return null;
    const pending = stored?.items?.filter((item) => item.status !== 'saved') ?? [];
    if (pending.length === 0 || now - stored.savedAt > staleAfter(stored)) {
      await clearDayBatch();
      return null;
    }
    return {
      ...stored,
      items: pending.map((item) => (item.status === 'saving' ? { ...item, status: 'ready' as const } : item)),
    };
  } catch {
    return null;
  }
};
