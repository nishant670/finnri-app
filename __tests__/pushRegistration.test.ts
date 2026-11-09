import { Platform } from 'react-native';

import { registerForPushNotifications } from '@/lib/push-notifications';

const mockChannel = jest.fn().mockResolvedValue(null);
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockToken = jest.fn();

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: (...args: unknown[]) => mockChannel(...args),
  getPermissionsAsync: () => mockGetPermissions(),
  requestPermissionsAsync: () => mockRequestPermissions(),
  getExpoPushTokenAsync: (...args: unknown[]) => mockToken(...args),
}));

// Exactly what expo-constants gives a release build: there is no `isDevice`.
// Gating on it stopped every phone from registering, and a mock that supplied
// it hid that.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { appOwnership: null, easConfig: { projectId: 'project' } },
}));

describe('registerForPushNotifications', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
    fetchMock.mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockToken.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates the categories, asks, and registers the phone', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });

    await expect(registerForPushNotifications('session')).resolves.toBe('ExponentPushToken[abc]');

    expect(mockChannel.mock.calls.map(([id]) => id)).toEqual(['autopay', 'reminders', 'splits', 'updates']);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/push-devices'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('stops without a token when permission is refused', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await expect(registerForPushNotifications('session')).resolves.toBeNull();

    expect(mockChannel).toHaveBeenCalled();
    expect(mockToken).not.toHaveBeenCalled();
  });
});
