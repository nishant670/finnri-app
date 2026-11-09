import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { reportHandledError } from '@/lib/crash-reporting';

const canReceivePush = Platform.OS !== 'web' && Constants.isDevice && Constants.appOwnership !== 'expo';

// Loaded only on a build that can receive push: `expo-notifications` can't load
// in Expo Go.
const pushNotifications = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/lib/push-notifications') as typeof import('@/lib/push-notifications');

/**
 * Android asks about notifications once, right after sign-in. Anyone who said
 * no then gets no reminders and no sign of why, so this list, where they'd go
 * looking, offers the way back. Shown only while notifications are off.
 */
export function PushPermissionCard() {
  const { token } = useAuthStore();
  const { colors } = useThemeTokens();
  const [permission, setPermission] = useState<'can_ask' | 'blocked' | null>(null);
  const wasOff = useRef(false);

  const refresh = useCallback(async () => {
    if (!token || !canReceivePush) return;
    try {
      const { readPushPermission, registerForPushNotifications } = pushNotifications();
      const next = await readPushPermission();
      if (next !== 'granted') {
        wasOff.current = true;
        setPermission(next);
        return;
      }
      setPermission(null);
      if (wasOff.current) {
        wasOff.current = false;
        await registerForPushNotifications(token);
      }
    } catch (error) {
      reportHandledError(error, { where: 'PushPermissionCard' });
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  // Back from Android's settings: the screen never lost focus, only the app did.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const turnOn = async () => {
    if (permission === 'blocked') {
      void Linking.openSettings();
      return;
    }
    try {
      await pushNotifications().askPushPermission();
    } catch (error) {
      reportHandledError(error, { where: 'PushPermissionCard' });
    }
    void refresh();
  };

  if (!permission) return null;

  return (
    <View
      testID="push-permission-card"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.tile, { backgroundColor: withAlpha(colors.accent, 0.14) }]}>
        <MaterialCommunityIcons name="bell-off-outline" size={20} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <ThemedText style={styles.title}>Notifications are off</ThemedText>
        <ThemedText tone="muted" style={styles.body}>
          Turn them on to get bill reminders and settle-up requests on your phone.
        </ThemedText>
        <PressableView
          testID="push-permission-turn-on"
          accessibilityRole="button"
          onPress={() => void turnOn()}
          style={[styles.button, { borderColor: colors.borderStrong }]}
          pressedStyle={styles.pressed}>
          <ThemedText style={styles.buttonLabel}>
            {permission === 'blocked' ? 'Open settings' : 'Turn on'}
          </ThemedText>
        </PressableView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  body: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 36,
    marginTop: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 999,
  },
  buttonLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
