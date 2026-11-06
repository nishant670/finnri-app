import { DefaultAppMood, resolveThemeMode } from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';

/**
 * P39: Light · Dark · Match phone. A tester with a dark phone opened the app
 * to a light onboarding, because the only dark switch was buried in App mood.
 */

describe('resolveThemeMode', () => {
  it('follows the phone on Match phone, which is where a new install starts', () => {
    expect(DefaultAppMood.appearance).toBe('system');
    expect(resolveThemeMode('dark')).toBe('dark');
    expect(resolveThemeMode('light')).toBe('light');
  });

  it('falls back to light when the phone reports nothing', () => {
    expect(resolveThemeMode(null, { appearance: 'system' })).toBe('light');
  });

  it('ignores the phone once the user picked Light or Dark', () => {
    expect(resolveThemeMode('dark', { appearance: 'light' })).toBe('light');
    expect(resolveThemeMode('light', { appearance: 'dark' })).toBe('dark');
  });
});

describe('the stored nightMode switch', () => {
  const migrate = useAppMoodStore.persist.getOptions().migrate!;

  it('keeps an explicit dark choice', async () => {
    const state = await migrate({ themeColor: 'mint', nightMode: true, iconStyle: 'minimal' }, 0);
    expect(state).toEqual({ themeColor: 'mint', appearance: 'dark', iconStyle: 'minimal' });
  });

  it('moves the untouched default to Match phone', async () => {
    const state = await migrate({ themeColor: 'finnri', nightMode: false, iconStyle: 'whimsical' }, 0);
    expect(state).toMatchObject({ appearance: 'system' });
    expect(state).not.toHaveProperty('nightMode');
  });
});
