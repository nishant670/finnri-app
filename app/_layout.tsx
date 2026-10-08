import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useRouter } from 'expo-router';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import 'react-native-reanimated';

// Must load before any component calls setColorScheme: NativeWind reads the
// compiled darkMode setting from this stylesheet and throws without it.
import '../global.css';

import { FinnriSplashScreen } from '@/components/SplashScreen';
import { TransactionDeleteProvider } from '@/components/transactions/TransactionDeleteProvider';
import { AppDialogProvider } from '@/components/ui/AppDialogProvider';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { installApiSessionGuard } from '@/lib/api-session';
import { initCrashReporting } from '@/lib/crash-reporting';
import { monthFromActionURL } from '@/lib/monthly-review';
import { hasCompletedOnboarding } from '@/lib/onboarding';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Before anything else that can throw. A crash during startup is the one this
// app most needs to hear about and the one a late init would miss.
initCrashReporting();

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

/**
 * One frame's grace on top of a transition's own duration. The transition is
 * finished by then and the splash can come down without showing its tail.
 */
const FRAME_MS = 16;

/**
 * Resolves once the persisted auth store has been read off disk. Until it has,
 * `user` is `undefined` — indistinguishable from a signed-out user, which is
 * how a returning user ends up looking at Welcome.
 */
const waitForAuthHydration = () =>
  new Promise<void>((resolve) => {
    if (useAuthStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });

/**
 * Where a cold start belongs. Only meaningful after hydration.
 */
const resolveInitialRoute = async () => {
  const currentUser = useAuthStore.getState().user;

  if (currentUser) {
    return currentUser.has_pin || currentUser.biometrics_enabled ? '/lock' : '/(tabs)';
  }

  return (await hasCompletedOnboarding()) ? '/auth' : '/onboarding';
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();
  const themeTokens = useThemeTokens();
  const motion = useMotion();
  const [isAppReady, setIsAppReady] = useState(false);
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const { clearAuth, token } = useAuthStore();
  const router = useRouter();
  const navigationTheme = useMemo(
    () => ({
      ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
        primary: themeTokens.colors.accent,
        background: themeTokens.colors.background,
        card: themeTokens.colors.card,
        text: themeTokens.colors.text,
        border: themeTokens.colors.border,
      },
    }),
    [colorScheme, themeTokens.colors]
  );

  useEffect(() => {
    // Simulate asset loading or just wait for the custom splash
    const prepare = async () => {
      try {
        // Artificial delay to show native splash for a moment if needed
        // but SplashScreen.hideAsync() is usually called when fonts are ready.
        setIsAppReady(true);
      } catch (e) {
        console.warn(e);
      }
    };
    prepare();
  }, []);

  /**
   * `(tabs)` is the cold-start route. There is no `app/index.tsx`, and a group
   * is transparent to the router, so `(tabs)/index` owns `/` — Home mounts
   * under the splash on every launch, whoever the user turns out to be.
   *
   * Everything that decides where they actually belong therefore has to finish
   * while the splash is still covering Home, and the splash has to outlive the
   * transition that follows. Hiding it first, then awaiting hydration and the
   * onboarding flag, is what put a second of somebody else's Home in front of
   * a user on their way to Welcome — and the `fade` these screens are
   * registered with made the handover a visible cross-dissolve rather than a
   * cut, which is the part that read as a bug rather than as a slow launch.
   */
  const handleCustomSplashComplete = useCallback(async () => {
    await waitForAuthHydration();
    router.replace(await resolveInitialRoute());

    // `replace` commits on the next frame and the screen's own animation runs
    // after that, both of them behind the splash. `exitDuration` is what the
    // Stack below is configured with, so the two cannot drift apart, and it is
    // 0 under reduced motion — where the navigation is instant and there is
    // nothing to wait for either.
    setTimeout(() => setShowCustomSplash(false), motion.exitDuration('sheet') + FRAME_MS);
  }, [motion, router]);

  useEffect(() => {
    if (isAppReady) {
      // Hide native splash once the app is "ready"
      // (the custom splash will be visible on top)
      SplashScreen.hideAsync();
    }
  }, [isAppReady]);

  useEffect(() => {
    return installApiSessionGuard(() => {
      clearAuth();
      router.replace('/auth');
    });
  }, [clearAuth, router]);

  useEffect(() => {
    setColorScheme(colorScheme);
  }, [colorScheme, setColorScheme]);

  useEffect(() => {
    if (!token || Constants.appOwnership === 'expo') return;

    let responseSubscription: { remove: () => void } | undefined;
    let cancelled = false;
    void Promise.all([import('expo-notifications'), import('@/lib/push-notifications')])
      .then(([Notifications, { registerForPushNotifications }]) => {
        if (cancelled) return;
        void registerForPushNotifications(token).catch(() => undefined);
        responseSubscription = Notifications.addNotificationResponseReceivedListener((event) => {
          // Tapping a push has always landed on the notification list, which is
          // right when there is nothing more specific to open and wrong for the
          // monthly review — the whole point of that notification is the screen
          // behind it. The server sends the destination it already stores on
          // the notification, so the two routes cannot drift apart.
          const actionURL = event?.notification?.request?.content?.data?.action_url;
          const month = typeof actionURL === 'string' ? monthFromActionURL(actionURL) : null;
          if (month) {
            router.push({ pathname: '/monthly-review', params: { month } });
            return;
          }
          router.push('/notifications');
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      responseSubscription?.remove();
    };
  }, [router, token]);

  if (!isAppReady) {
    return null;
  }

  return (
    // The gesture layer the audit found missing entirely. `react-native-gesture-handler`
    // has been a dependency all along — react-navigation pulls it in — but nothing in
    // the app had ever imported it, and on Android its handlers do nothing at all
    // unless a `GestureHandlerRootView` is above them. One root here, so a row on any
    // screen can be swiped without each screen remembering to provide one.
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Expo Router mounts a `SafeAreaProvider` of its own, but it passes
          `initialMetrics` only on web and under test — on a device the value is
          `undefined`, so the provider starts with *no* insets and fills them in
          only once the native view has measured itself.

          `initialWindowMetrics` is read straight off the native module when the
          JS bundle loads, so a provider seeded with it hands out correct insets
          on the very first frame. Nesting is the supported way to override:
          the inner provider wins for its subtree, which is the whole app.

          This is what lets a screen read its insets from JS and lay out right
          the first time, instead of being re-padded natively a beat later —
          see `OnboardingScreenWrapper` for the reflow that cost. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={navigationTheme}>
      {/* Above the delete provider because that provider raises dialogs of its
          own. One host for the whole app is what makes the themed dialog the
          cheap option — see `AppDialogProvider`; every flow that ended on a
          stock Android box ended there because reaching for `Alert.alert` was
          less work than wiring a themed one up by hand. */}
      <AppDialogProvider>
      <TransactionDeleteProvider>
      {showCustomSplash && <FinnriSplashScreen onAnimationComplete={handleCustomSplashComplete} />}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          // A native stack has one duration for both directions, so the two
          // halves of the `sheet` token cannot both apply — and the exit is the
          // half that binds. A push that is slightly quicker than the vocabulary
          // asks for costs nothing; a pop held to entrance length is the lag
          // `EXIT_RATIO` exists to prevent, on the one gesture the user makes
          // most. 240ms is `sheet`'s exit exactly, which is also the number the
          // audit asked for, arrived at from the tokens rather than by hand.
          animationDuration: motion.exitDuration('sheet'),
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: themeTokens.colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            title: 'Modal',
            headerShown: true,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="accounts/manage"
          options={{ presentation: 'modal', title: 'Account', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="accounts/[id]" />
        <Stack.Screen name="statements/index" />
        <Stack.Screen name="statements/review" />
        <Stack.Screen name="statements/[id]" />
        <Stack.Screen name="emi-plans/[id]" />
        <Stack.Screen name="auth" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="transactions/index" />
        <Stack.Screen name="lock" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="security" />
        <Stack.Screen name="change-pin" />
        <Stack.Screen name="invite/split/[token]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="insight-detail" />
        <Stack.Screen name="recurring-review" />
        <Stack.Screen name="weekly-review" />
        <Stack.Screen name="monthly-review" />
        <Stack.Screen name="budgets" />
        <Stack.Screen name="subscriptions" />
        <Stack.Screen name="billing" />
        <Stack.Screen name="purchase-history" />
        <Stack.Screen name="ai-usage" />
        <Stack.Screen name="ask" />
        <Stack.Screen name="tools" />
        <Stack.Screen name="about-finnri" />
        <Stack.Screen name="help-support" />
        <Stack.Screen name="feedback" />
        <Stack.Screen name="upcoming" />
        {/* The one screen in the app that does not slide, and C9 is the reason.
            Its icon and amount are drawn on top of where the tapped row's were
            and released towards where they belong, and two elements can only
            read as one object if the screens behind them are not also sliding
            past each other — a push turns the travel into two things moving in
            different directions at once.

            Under reduced motion there is no travel to coordinate, so the screen
            goes back to the push every other screen uses. That is the degrade
            the task asks for: the plain push, not a half-played transition. */}
        <Stack.Screen
          name="entry/[id]"
          options={{ animation: motion.reduced ? 'slide_from_right' : 'fade' }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </TransactionDeleteProvider>
      </AppDialogProvider>
      </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
