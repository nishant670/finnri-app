import AsyncStorage from '@react-native-async-storage/async-storage';

import { getGuestSecret, resetGuestSecretCache } from '@/lib/device';

const mockRandomBytes = jest.fn();
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: (count: number) => mockRandomBytes(count),
}));

describe('the guest secret', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetGuestSecretCache();
    mockRandomBytes.mockReset();
    mockRandomBytes.mockImplementation(async (count: number) =>
      Uint8Array.from({ length: count }, (_, index) => (index * 7 + 3) % 256),
    );
  });

  it('is 32 random bytes as hex, from the system source', async () => {
    const secret = await getGuestSecret();
    expect(mockRandomBytes).toHaveBeenCalledWith(32);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is made once and then read back', async () => {
    const first = await getGuestSecret();
    resetGuestSecretCache();
    const second = await getGuestSecret();
    expect(second).toBe(first);
    expect(mockRandomBytes).toHaveBeenCalledTimes(1);
  });

  it('gives concurrent callers the same secret', async () => {
    let call = 0;
    mockRandomBytes.mockImplementation(async (count: number) => {
      call += 1;
      return Uint8Array.from({ length: count }, () => call);
    });
    const [a, b, c] = await Promise.all([getGuestSecret(), getGuestSecret(), getGuestSecret()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mockRandomBytes).toHaveBeenCalledTimes(1);
  });

  it('can be asked again after the random source fails', async () => {
    mockRandomBytes.mockRejectedValueOnce(new Error('no entropy'));
    await expect(getGuestSecret()).rejects.toThrow('no entropy');
    await expect(getGuestSecret()).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
