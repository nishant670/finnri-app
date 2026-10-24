import appConfig from '../app.json';
import { requestMicAccess } from '@/lib/microphone-access';

const answer = (status: 'granted' | 'denied' | 'undetermined', canAskAgain = true) =>
  jest.fn().mockResolvedValue({ status, canAskAgain });

describe('requestMicAccess', () => {
  it('records straight away when the microphone is already allowed', async () => {
    const request = answer('granted');
    await expect(requestMicAccess({ get: answer('granted'), request })).resolves.toBe('granted');
    expect(request).not.toHaveBeenCalled();
  });

  it('shows the system prompt again after a single refusal', async () => {
    const request = answer('granted');
    await expect(
      requestMicAccess({ get: answer('denied', true), request })
    ).resolves.toBe('granted');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal given just now as denied, not blocked', async () => {
    // The person has just tapped "Don't allow"; offering Settings on top of
    // that answer would be pushy. The next tap decides.
    await expect(
      requestMicAccess({ get: answer('undetermined'), request: answer('denied', false) })
    ).resolves.toBe('denied');
  });

  it('sends a microphone the system will not ask for again to Settings', async () => {
    const request = answer('denied', false);
    await expect(
      requestMicAccess({ get: answer('denied', false), request })
    ).resolves.toBe('blocked');
    // A request that cannot show a prompt comes back refused instantly.
    expect(request).not.toHaveBeenCalled();
  });
});

describe('app.json', () => {
  type PluginEntry = string | [string, Record<string, unknown>];
  const expo = (appConfig as { expo: { plugins: PluginEntry[]; android: { blockedPermissions?: string[]; permissions?: string[] } } }).expo;

  it('never strips the microphone from the Android build', () => {
    // `microphonePermission: false` on expo-image-picker adds RECORD_AUDIO to
    // the blocked list, which removes it from the manifest: no system prompt,
    // and no Microphone switch in the app's Settings. Voice capture needs it.
    for (const plugin of expo.plugins) {
      if (Array.isArray(plugin)) {
        expect([plugin[0], plugin[1].microphonePermission]).not.toEqual([plugin[0], false]);
      }
    }
    expect(expo.android.blockedPermissions ?? []).not.toContain('android.permission.RECORD_AUDIO');
    expect(expo.android.permissions).toContain('android.permission.RECORD_AUDIO');
  });
});
