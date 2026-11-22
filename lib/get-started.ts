import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Get started" can be closed from its compact row on Home. Kept on this device
 * only: it is a set-up nudge, and losing the choice on a reinstall costs one
 * more tap, not data.
 */
const GET_STARTED_DISMISSED_KEY = 'finnri_get_started_dismissed';

export const dismissGetStarted = async () => {
  try {
    await AsyncStorage.setItem(GET_STARTED_DISMISSED_KEY, '1');
  } catch {
    // A secondary card must never make Home fail to open.
  }
};

export const isGetStartedDismissed = async () => {
  try {
    return (await AsyncStorage.getItem(GET_STARTED_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
};
