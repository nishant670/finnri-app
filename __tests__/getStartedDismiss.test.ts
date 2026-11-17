import AsyncStorage from '@react-native-async-storage/async-storage';

import { dismissGetStarted, isGetStartedDismissed } from '@/lib/get-started';

describe('Get started dismissal', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is remembered once closed', async () => {
    expect(await isGetStartedDismissed()).toBe(false);
    await dismissGetStarted();
    expect(await isGetStartedDismissed()).toBe(true);
  });

  it('reads as not dismissed when storage fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('blocked'));
    expect(await isGetStartedDismissed()).toBe(false);
  });
});
