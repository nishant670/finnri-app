import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'finnri_device_id';
// The pre-rename key. An install that already has one keeps its id rather than
// registering as a second device: read it once, copy it forward, drop it.
const LEGACY_DEVICE_ID_KEY = 'ez_money_device_id';

export const getDeviceId = async () => {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    const legacyId = await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY);
    if (legacyId) {
      await AsyncStorage.setItem(DEVICE_ID_KEY, legacyId);
      await AsyncStorage.removeItem(LEGACY_DEVICE_ID_KEY);
      return legacyId;
    }
  }
  if (!id) {
    id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

const GUEST_SECRET_KEY = 'finnri_guest_secret';

let pendingGuestSecret: Promise<string> | null = null;

const readOrCreateGuestSecret = async () => {
  const stored = await AsyncStorage.getItem(GUEST_SECRET_KEY);
  if (stored) return stored;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const secret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await AsyncStorage.setItem(GUEST_SECRET_KEY, secret);
  return secret;
};

/**
 * What a guest on this install proves itself with.
 *
 * The device id above used to be the whole of a guest's identity: the server
 * handed a session to whoever sent it. It is made with `Math.random`, never
 * changes, and was stored by the server as it stands — so anyone who came by
 * it could open that guest's records at any later time. It stays, because
 * credits are counted against it, but it no longer opens anything by itself.
 *
 * This is 32 bytes from the system's random source. The server keeps only a
 * hash of it. A guest created by an older version of the app is claimed by the
 * first secret sent alongside its device id, which is why both always travel
 * together.
 *
 * One promise is shared by concurrent callers. Two sign-in attempts at once
 * would otherwise each find nothing stored and each write a different secret,
 * and the server would claim the guest with whichever arrived first.
 */
export const getGuestSecret = () => {
  if (!pendingGuestSecret) {
    pendingGuestSecret = readOrCreateGuestSecret().catch((error) => {
      pendingGuestSecret = null;
      throw error;
    });
  }
  return pendingGuestSecret;
};

/** Test seam: forget the in-memory secret so the next call reads storage again. */
export const resetGuestSecretCache = () => {
  pendingGuestSecret = null;
};
