import { useColorScheme as useRNColorScheme } from 'react-native';

import { resolveThemeMode } from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';

export function useColorScheme() {
  const systemColorScheme = useRNColorScheme();
  const appearance = useAppMoodStore((state) => state.appearance);
  useAppMoodStore((state) => state.themeColor);
  useAppMoodStore((state) => state.iconStyle);

  return resolveThemeMode(systemColorScheme === 'unspecified' ? null : systemColorScheme, { appearance });
}
