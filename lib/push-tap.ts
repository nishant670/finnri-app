import type { Href } from 'expo-router';

import { notificationDestination } from './notification-kinds';

/**
 * Where tapping a push goes: the same screen as tapping that notification in
 * the app's list, or the list when it has no screen of its own.
 */
export const pushTapDestination = (data: unknown): Href => {
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return (
    notificationDestination({
      type: typeof payload.type === 'string' ? payload.type : '',
      action_url: typeof payload.action_url === 'string' ? payload.action_url : undefined,
    }) ?? '/notifications'
  );
};

type OpenDestination = (destination: Href) => void;

let appIsOpen = false;
let heldDestination: Href | null = null;
let lastHandledTap: string | null = null;

/**
 * Whether this tap is new. The same tap can arrive twice on a cold start, as a
 * listener event and as the "last response" read at launch.
 */
export const isNewPushTap = (notificationId: string | undefined): boolean => {
  if (!notificationId) return true;
  if (notificationId === lastHandledTap) return false;
  lastHandledTap = notificationId;
  return true;
};

/**
 * Opens a tapped push, or waits if the app hasn't finished launching. A tap
 * that starts the app arrives under the splash, and navigating then would be
 * overwritten by the launch route, or worse, skip the PIN screen.
 */
export const openPushDestination = (destination: Href, open: OpenDestination) => {
  if (appIsOpen) {
    open(destination);
    return;
  }
  heldDestination = destination;
};

/**
 * Call once the person is past the splash and any PIN screen. Without `open`,
 * a held tap is dropped.
 */
export const markAppOpen = (open?: OpenDestination) => {
  appIsOpen = true;
  const destination = heldDestination;
  heldDestination = null;
  if (destination) open?.(destination);
};
