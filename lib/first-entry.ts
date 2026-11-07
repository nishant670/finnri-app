import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the first-entry offer on Home (P70) was put away with "Say it
 * instead". Once put away it stays away; it also goes on its own the moment
 * any entry exists.
 */
const STORAGE_KEY = 'finnri_first_entry_dismissed_v1';

export const isFirstEntryDismissed = async () => {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch {
    // Unknown is treated as put away: offering a sentence nobody wanted is
    // worse than missing the offer.
    return true;
  }
};

export const dismissFirstEntry = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Best effort; the in-memory state already hid it.
  }
};
