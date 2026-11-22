/* eslint-disable import/first -- jest.mock must run before these imports */
import { Dimensions, Platform } from 'react-native';

const mockIsTestLab = jest.fn(() => false);

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  requireOptionalNativeModule: (name: string) =>
    name === 'FinnriUpdates' ? { isTestLabDevice: () => mockIsTestLab() } : null,
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '15',
  applicationId: 'com.finnri.app',
}));

import { installApiSessionGuard } from '@/lib/api-session';
import { clientHeaders, resetClientHeadersForTest, withClientHeaders } from '@/lib/client-info';
import { API_BASE_URL } from '@/lib/transactions';

describe('client headers', () => {
  const originalOS = Platform.OS;
  const originalConstants = Platform.constants;

  beforeEach(() => {
    resetClientHeadersForTest();
    mockIsTestLab.mockReturnValue(false);
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 412, height: 915, scale: 2.6, fontScale: 1 });
    Platform.OS = 'android';
    Object.defineProperty(Platform, 'constants', {
      configurable: true,
      get: () => ({ Release: '15', Model: 'SM-S918B', Manufacturer: 'samsung' }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Platform.OS = originalOS;
    Object.defineProperty(Platform, 'constants', { configurable: true, get: () => originalConstants });
  });

  it('describes the Android build and phone', () => {
    expect(clientHeaders()).toEqual({
      'X-Finnri-Platform': 'android',
      'X-Finnri-App-Version': '1.0.0',
      'X-Finnri-Build': '15',
      'X-Finnri-OS': 'Android 15',
      'X-Finnri-Device': 'Samsung SM-S918B',
      'X-Finnri-Form-Factor': 'phone',
      'X-Finnri-Variant': 'play',
    });
  });

  it('calls a 600dp-wide screen a tablet', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 800, height: 1280, scale: 2, fontScale: 1 });
    expect(clientHeaders()['X-Finnri-Form-Factor']).toBe('tablet');
  });

  it("flags Google Play's test devices", () => {
    mockIsTestLab.mockReturnValue(true);
    expect(clientHeaders()['X-Finnri-Test-Device']).toBe('1');
  });

  it('sends nothing extra on web', () => {
    Platform.OS = 'web';
    expect(clientHeaders()).toEqual({});
    expect(withClientHeaders('https://example.test', { headers: { A: 'b' } })).toEqual({ headers: { A: 'b' } });
  });

  it('keeps what the caller set', () => {
    const init = withClientHeaders(`${API_BASE_URL}/v1/entries`, {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'X-Finnri-Variant': 'debug' },
    });
    const headers = init?.headers as Headers;
    expect(init?.method).toBe('POST');
    expect(headers.get('Authorization')).toBe('Bearer t');
    expect(headers.get('X-Finnri-Variant')).toBe('debug');
    expect(headers.get('X-Finnri-Device')).toBe('Samsung SM-S918B');
  });

  it('adds them to API requests only, sign-in included', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return { status: 200, clone: () => ({ json: async () => ({}) }), json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;
    const uninstall = installApiSessionGuard(jest.fn());

    await fetch(`${API_BASE_URL}/v1/auth/guest`, { method: 'POST', body: '{}' });
    await fetch('https://play.google.com/store/apps/details?id=com.finnri.app');

    expect(calls[0].headers.get('X-Finnri-Platform')).toBe('android');
    expect(calls[1].headers.get('X-Finnri-Platform')).toBeNull();
    uninstall();
  });
});
