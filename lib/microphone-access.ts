import type { PermissionResponse } from 'expo-audio';

/**
 * Where the microphone stands for a capture that is about to start.
 *
 * - `granted`: record.
 * - `denied`: the system asked just now and the answer was no. Tapping the mic
 *   again asks again while the system still lets it.
 * - `blocked`: the system will not ask any more — two refusals on Android 11+,
 *   or "Don't allow" on iOS — so the only way back is Settings, and saying so
 *   is the whole of the help this can give.
 */
export type MicAccess = 'granted' | 'denied' | 'blocked';

type PermissionCalls = {
  get: () => Promise<Pick<PermissionResponse, 'status' | 'canAskAgain'>>;
  request: () => Promise<Pick<PermissionResponse, 'status' | 'canAskAgain'>>;
};

/**
 * Asks when asking can still show the system prompt, and only then. A request
 * the system will not show comes back refused instantly, which is how the old
 * flow looked broken: every tap printed "turn it on in Settings" and nothing
 * else happened.
 */
export async function requestMicAccess({ get, request }: PermissionCalls): Promise<MicAccess> {
  const current = await get();
  if (current.status === 'granted') return 'granted';
  if (!current.canAskAgain) return 'blocked';
  const answer = await request();
  return answer.status === 'granted' ? 'granted' : 'denied';
}
