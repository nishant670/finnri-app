import { getMoodColors, ThemeMoods, type ThemeMoodId } from '@/constants/theme';
import { nativeTheme } from '@/lib/native-theme';

/**
 * The home-screen widget stayed Finnri orange and followed the phone's dark
 * mode while the app was in Sky and Light: native only knew the XML palette.
 */

describe('nativeTheme', () => {
  it('carries the chosen mood, not Finnri', () => {
    const { day, night } = nativeTheme({ themeColor: 'sky', appearance: 'system' });
    expect(day.accent).toBe(ThemeMoods.sky.accent);
    expect(day.onAccent).toBe(ThemeMoods.sky.onAccent);
    expect(day.card).toBe(getMoodColors('sky').light.card);
    expect(night.card).toBe(getMoodColors('sky').dark.card);
  });

  it('leaves Match phone to the phone, with a light and a dark half', () => {
    const { day, night } = nativeTheme({ themeColor: 'finnri', appearance: 'system' });
    expect(day.background).toBe(getMoodColors('finnri').light.background);
    expect(night.background).toBe(getMoodColors('finnri').dark.background);
  });

  it('ignores the phone once the user picked Light or Dark', () => {
    const light = nativeTheme({ themeColor: 'mint', appearance: 'light' });
    expect(light.night).toEqual(light.day);
    expect(light.day.text).toBe(getMoodColors('mint').light.text);

    const dark = nativeTheme({ themeColor: 'mint', appearance: 'dark' });
    expect(dark.day).toEqual(dark.night);
    expect(dark.day.text).toBe(getMoodColors('mint').dark.text);
  });

  it('sends only six-digit hex, which Android parses the same way CSS does', () => {
    for (const themeColor of Object.keys(ThemeMoods) as ThemeMoodId[]) {
      for (const appearance of ['light', 'dark'] as const) {
        const { day } = nativeTheme({ themeColor, appearance });
        for (const value of Object.values(day)) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });
});
