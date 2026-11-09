import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { rememberRegisteredPushToken } from './push-device';
import { API_BASE_URL } from './transactions';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * One row each in the phone's notification settings, so someone can silence
 * budget alerts and keep their settle-up requests. The API picks the id for
 * each push (`pushChannelFor` in push_delivery.go); keep the two lists in step.
 */
const ANDROID_CHANNELS = [
  { id: 'autopay', name: 'Autopay reviews' },
  { id: 'reminders', name: 'Bills and reminders' },
  { id: 'splits', name: 'Splits' },
  { id: 'updates', name: 'Budgets and updates' },
];

export const registerForPushNotifications = async (authToken: string) => {
  if (Platform.OS === 'web' || !Constants.isDevice) return null;
  if (Platform.OS === 'android') {
    // Before the permission request: Android 13 only shows its prompt once the
    // app has a channel.
    await Promise.all(
      ANDROID_CHANNELS.map(({ id, name }) =>
        Notifications.setNotificationChannelAsync(id, {
          name,
          importance: Notifications.AndroidImportance.HIGH,
        })
      )
    );
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return null;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  const response = await fetch(`${API_BASE_URL}/v1/push-devices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  if (!response.ok) return null;
  rememberRegisteredPushToken(token);
  return token;
};

/** `can_ask` shows Android's prompt; after two refusals only Settings can change it. */
export type PushPermission = 'granted' | 'can_ask' | 'blocked';

export const readPushPermission = async (): Promise<PushPermission> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  return current.canAskAgain ? 'can_ask' : 'blocked';
};

export const askPushPermission = async () => {
  await Notifications.requestPermissionsAsync();
};

/** The tap that launched the app, which a listener attached later can miss. */
export const takeLaunchPushResponse = () => {
  const response = Notifications.getLastNotificationResponse();
  if (response) Notifications.clearLastNotificationResponse();
  return response;
};
