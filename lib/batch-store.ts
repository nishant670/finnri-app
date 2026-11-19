import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ParseBatch } from '@/lib/parse';
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

export type StoredDayBatch = {
  batchId: string;
  batch: ParseBatch;
  inputSource: 'voice' | 'text';
  items: DayItem[];
  savedAt: number;
};

export const saveDayBatch = async (value: Omit<StoredDayBatch, 'savedAt'>) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    // Keeping the tray is a convenience; failing to keep it is not an error.
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
 * save may not have landed, and saving is idempotent per row within a tray.
 */
export const loadDayBatch = async (now = Date.now()): Promise<StoredDayBatch | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDayBatch;
    const pending = stored?.items?.filter((item) => item.status !== 'saved') ?? [];
    if (pending.length === 0 || now - stored.savedAt > STALE_AFTER_MS) {
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
