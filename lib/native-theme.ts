import { requireOptionalNativeModule } from 'expo';

import { getMoodColors, type AppMoodSettings } from '@/constants/theme';

type ModeColors = ReturnType<typeof getMoodColors>['light'];

/**
 * The colours the two native surfaces draw with — the home-screen widget and
 * the quick-capture sheet. They cannot read `constants/theme.ts`, so the app
 * hands them the resolved mood instead of their copying Finnri's values into
 * XML and never hearing about Mint, Sky or Plum, or about Light and Dark.
 *
 * Every value is six-digit hex: Android writes alpha first, CSS last, so the
 * alphas (captions, the widget's prompt) are applied on the native side.
 */
export type NativePalette = {
  background: string;
  card: string;
  text: string;
  borderStrong: string;
  track: string;
  selectedFill: string;
  accent: string;
  onAccent: string;
  logoFill: string;
  logoInk: string;
};

/** Both halves, picked by the phone's dark mode where the native view is drawn. */
export type NativeTheme = { day: NativePalette; night: NativePalette };

const paletteFor = (colors: ModeColors, mode: 'light' | 'dark'): NativePalette => ({
  background: colors.background,
  card: colors.card,
  text: colors.text,
  borderStrong: colors.borderStrong,
  track: colors.track,
  selectedFill: colors.selectedFill,
  accent: colors.accent,
  onAccent: colors.onAccent,
  // The f mark is ink on a tile of text colour (boards R14-Widget, -Dark).
  logoFill: colors.text,
  logoInk: mode === 'light' ? colors.card : colors.background,
});

/**
 * Match phone sends a light and a dark half and lets Android pick, so the
 * widget still flips with the phone while the app is closed. Light or Dark
 * sends the same half twice: the phone's setting no longer matters.
 */
export function nativeTheme({ themeColor, appearance }: Pick<AppMoodSettings, 'themeColor' | 'appearance'>): NativeTheme {
  const colors = getMoodColors(themeColor);
  const light = paletteFor(colors.light, 'light');
  const dark = paletteFor(colors.dark, 'dark');
  if (appearance === 'light') return { day: light, night: light };
  if (appearance === 'dark') return { day: dark, night: dark };
  return { day: light, night: dark };
}

type FinnriThemeModule = { setTheme: (theme: string) => void };

/** Android only; `null` on iOS, web and Expo Go, where there is nothing to repaint. */
const nativeModule = requireOptionalNativeModule<FinnriThemeModule>('FinnriTheme');

/** Stores the theme for the widget and capture sheet, and redraws placed widgets. */
export function syncNativeTheme(mood: Pick<AppMoodSettings, 'themeColor' | 'appearance'>) {
  nativeModule?.setTheme(JSON.stringify(nativeTheme(mood)));
}
