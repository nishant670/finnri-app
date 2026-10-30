import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { resolveThemeMode } from '@/constants/theme';
import { useAppMoodStore } from '@/hooks/use-app-mood-store';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const appearance = useAppMoodStore((state) => state.appearance);
  useAppMoodStore((state) => state.themeColor);
  useAppMoodStore((state) => state.iconStyle);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return resolveThemeMode(colorScheme === 'unspecified' ? null : colorScheme, { appearance });
  }

  return resolveThemeMode('light', { appearance });
}
