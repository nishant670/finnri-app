import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { inviteTokenFromReferrer, takeInstallReferrerInvite } from '@/lib/install-referrer-invite';

const mockGetInstallReferrerAsync = jest.fn<Promise<string>, []>();
jest.mock('expo-application', () => ({
  getInstallReferrerAsync: () => mockGetInstallReferrerAsync(),
}));

const TOKEN = 'Ab3_dE-f9GhIjK0lMnOpQr';

describe('reading a group invite out of the Play install referrer', () => {
  it('finds the invite among other referrer fields', () => {
    expect(inviteTokenFromReferrer(`invite=${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromReferrer(`utm_source=web&invite=${TOKEN}&utm_medium=invite`)).toBe(TOKEN);
    // Play may hand the value back still encoded.
    expect(inviteTokenFromReferrer(encodeURIComponent(`invite=${TOKEN}`).replace('%3D', '='))).toBe(
      TOKEN
    );
  });

  it('ignores organic installs and anything that is not a token', () => {
    expect(inviteTokenFromReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(inviteTokenFromReferrer('')).toBeNull();
    expect(inviteTokenFromReferrer(null)).toBeNull();
    expect(inviteTokenFromReferrer('invite=../../auth')).toBeNull();
    expect(inviteTokenFromReferrer('invite=%E0%A4%A')).toBeNull();
  });
});

describe('the first launch after an install', () => {
  const originalOS = Platform.OS;

  beforeEach(async () => {
    await AsyncStorage.clear();
    mockGetInstallReferrerAsync.mockReset();
    Platform.OS = 'android';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('acts on a referred invite once', async () => {
    mockGetInstallReferrerAsync.mockResolvedValue(`invite=${TOKEN}`);
    await expect(takeInstallReferrerInvite()).resolves.toBe(TOKEN);
    await expect(takeInstallReferrerInvite()).resolves.toBeNull();
    expect(mockGetInstallReferrerAsync).toHaveBeenCalledTimes(1);
  });

  it('tries again next launch when the referrer could not be read', async () => {
    mockGetInstallReferrerAsync.mockRejectedValueOnce(new Error('service unavailable'));
    await expect(takeInstallReferrerInvite()).resolves.toBeNull();
    mockGetInstallReferrerAsync.mockResolvedValueOnce(`invite=${TOKEN}`);
    await expect(takeInstallReferrerInvite()).resolves.toBe(TOKEN);
  });

  it('never asks on iOS, which has no install referrer', async () => {
    Platform.OS = 'ios';
    await expect(takeInstallReferrerInvite()).resolves.toBeNull();
    expect(mockGetInstallReferrerAsync).not.toHaveBeenCalled();
  });
});
