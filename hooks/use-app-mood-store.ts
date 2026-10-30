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

type AppMoodState = AppMoodSettings & {
  setThemeColor: (themeColor: ThemeMoodId) => void;
  setAppearance: (appearance: AppearanceMode) => void;
  setIconStyle: (iconStyle: IconStyle) => void;
  resetMood: () => void;
};

export const useAppMoodStore = create<AppMoodState>()(
  persist(
    (set) => ({
      ...DefaultAppMood,
      setThemeColor: (themeColor) => {
        setRuntimeAppMood({ themeColor });
        set({ themeColor });
      },
      setAppearance: (appearance) => {
        setRuntimeAppMood({ appearance });
        set({ appearance });
      },
      setIconStyle: (iconStyle) => {
        setRuntimeAppMood({ iconStyle });
        set({ iconStyle });
      },
      resetMood: () => {
        setRuntimeAppMood(DefaultAppMood);
        set(DefaultAppMood);
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
      },
    }
  )
);
