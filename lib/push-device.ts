import { API_BASE_URL } from './transactions';

/**
 * This phone's push token and how to stop it, kept apart from
 * `push-notifications.ts` so that screens can import it directly: that file
 * loads `expo-notifications` at import time, which Expo Go can't do.
 */
let registeredPushToken: string | null = null;

export const rememberRegisteredPushToken = (pushToken: string) => {
  registeredPushToken = pushToken;
};

const UNREGISTER_TIMEOUT_MS = 3000;

/**
 * Stops this phone receiving the signed-in person's pushes. Run before the
 * session ends, while the auth token still works.
 *
 * Without it the phone stays attached to the account after logout, and whoever
 * uses it next sees that person's bills and settlements on the lock screen.
 * Best effort and short: being offline must not trap anyone in the account.
 */
export const unregisterPushDevice = async (authToken: string): Promise<void> => {
  const pushToken = registeredPushToken;
  if (!pushToken) return;
  registeredPushToken = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNREGISTER_TIMEOUT_MS);
  try {
    await fetch(`${API_BASE_URL}/v1/push-devices`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pushToken }),
      signal: controller.signal,
    });
  } catch {
    // The next sign-in on this phone moves the token to that account anyway.
  } finally {
    clearTimeout(timeout);
  }
};
