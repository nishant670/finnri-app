import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DefaultAppMood,
  setRuntimeAppMood,
  type AppearanceMode,
  type AppMoodSettings,
  type IconStyle,
  type ThemeMoodId,
} from '@/constants/theme';
import { syncNativeTheme } from '@/lib/native-theme';

type AppMoodState = AppMoodSettings & {
  setThemeColor: (themeColor: ThemeMoodId) => void;
  setAppearance: (appearance: AppearanceMode) => void;
  setIconStyle: (iconStyle: IconStyle) => void;
  resetMood: () => void;
};

export const useAppMoodStore = create<AppMoodState>()(
  persist(
    (set, get) => ({
      ...DefaultAppMood,
      setThemeColor: (themeColor) => {
        setRuntimeAppMood({ themeColor });
        set({ themeColor });
        syncNativeTheme(get());
      },
      setAppearance: (appearance) => {
        setRuntimeAppMood({ appearance });
        set({ appearance });
        syncNativeTheme(get());
      },
      setIconStyle: (iconStyle) => {
        setRuntimeAppMood({ iconStyle });
        set({ iconStyle });
      },
      resetMood: () => {
        setRuntimeAppMood(DefaultAppMood);
        set(DefaultAppMood);
        syncNativeTheme(DefaultAppMood);
      },
    }),
    {
      name: 'app-mood-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      /**
       * Version 0 stored a `nightMode` boolean. `true` was always a choice, so
       * it becomes Dark. `false` was the default nearly everyone kept without
       * ever opening App mood, so it becomes Match phone rather than Light —
       * otherwise an update would leave every existing install exactly as
       * blind to the phone's dark mode as before.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<AppMoodSettings> & { nightMode?: boolean };
        if (version < 1) {
          const { nightMode, ...rest } = state;
          return { ...rest, appearance: nightMode ? 'dark' : 'system' } as AppMoodState;
        }
        return state as AppMoodState;
      },
      partialize: ({ themeColor, appearance, iconStyle }) => ({
        themeColor,
        appearance,
        iconStyle,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setRuntimeAppMood({
          themeColor: state.themeColor,
          appearance: state.appearance,
          iconStyle: state.iconStyle,
        });
        // Every launch, so a widget placed before this build learns the mood
        // without waiting for the next change. Nothing stored means the
        // default, which is what the widget draws on its own.
        syncNativeTheme(state);
      },
    }
  )
);
