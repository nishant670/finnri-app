import { getThemeTokens } from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeTokens() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColor = useAppMoodStore((state) => state.themeColor);
  const appearance = useAppMoodStore((state) => state.appearance);
  const iconStyle = useAppMoodStore((state) => state.iconStyle);

  return getThemeTokens(colorScheme, { themeColor, appearance, iconStyle });
}
