import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstallReferrerAsync } from 'expo-application';
import { Platform } from 'react-native';

/**
 * A split-group invite carried through a Play Store install.
 *
 * Somebody without the app who opens a group link lands on the web invite
 * page, taps "Get Finnri on Google Play", installs — and used to open an app
 * that had no idea why it was installed, so they had to find the link again.
 * The web page now puts the invite in the Play link's `referrer` parameter
 * (`invite=<token>`), which Google Play hands back to the app once, on its
 * first run, through the install referrer API.
 */

const CHECKED_KEY = 'finnri_install_referrer_checked';

/** The splash waits on this, so a slow Play service must not hold the launch. */
const REFERRER_TIMEOUT_MS = 1500;

/** The shape the API issues invite tokens in: unpadded base64url. */
const INVITE_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * The invite token in an install referrer string, if there is one. The value
 * arrives URL-encoded as Play received it, e.g. `invite=abc&utm_source=web`.
 */
export function inviteTokenFromReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  for (const pair of referrer.split('&')) {
    const [rawKey, ...rest] = pair.split('=');
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' ')).trim();
      value = decodeURIComponent(rest.join('=').replace(/\+/g, ' ')).trim();
    } catch {
      continue;
    }
    if (key === 'invite' && INVITE_TOKEN.test(value)) return value;
  }
  return null;
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('install referrer timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

/**
 * The invite this install was made for, read once per install.
 *
 * Only Android has an install referrer. A read that fails (a sideloaded or
 * Preview build, Play services busy) is not recorded as done, so the next
 * signed-out launch tries again; a read that succeeds is, whatever it held,
 * so a referrer is acted on at most once.
 */
export async function takeInstallReferrerInvite(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    if (await AsyncStorage.getItem(CHECKED_KEY)) return null;
    const referrer = await withTimeout(getInstallReferrerAsync(), REFERRER_TIMEOUT_MS);
    await AsyncStorage.setItem(CHECKED_KEY, '1');
    return inviteTokenFromReferrer(referrer);
  } catch {
    // Launching normally is always the right fallback.
    return null;
  }
}
