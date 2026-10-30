import { useCallback, useRef, useState } from 'react';

import { GIFT_PASS_NOTIFICATION_TYPE, latestUnreadGift } from '@/lib/gift-pass';
import {
  fetchNotifications,
  markAllNotificationsRead,
  type AppNotification,
} from '@/lib/notifications';

type Options = {
  token: string | null | undefined;
  /** Guests can't hold a pass, so they are never asked. */
  enabled: boolean;
  /** False while something else has the screen — the entry sheet, say. The next check tries again. */
  canInterrupt: () => boolean;
  /** Runs as the pop-up opens: the balance behind it has just changed. */
  onAnnounce?: () => void;
};

/**
 * Finds a gifted pass the person hasn't seen and holds it for the pop-up.
 *
 * The unread notification is the signal, so a gift announces itself once
 * wherever it is first noticed — Home coming into view, the app returning to
 * the foreground, or its push arriving while the app is open — and closing the
 * pop-up marks it read. Every unread gift is cleared on close: two gifts back to
 * back are one piece of news.
 */
export function useGiftPassAnnouncement({ token, enabled, canInterrupt, onAnnounce }: Options) {
  const [gift, setGift] = useState<AppNotification | null>(null);
  const showingRef = useRef(false);
  const shownIdsRef = useRef(new Set<number>());

  const check = useCallback(async () => {
    if (!token || !enabled || showingRef.current) return;
    try {
      const { notifications } = await fetchNotifications(token, 'unread');
      const next = latestUnreadGift(notifications);
      if (!next || shownIdsRef.current.has(next.id) || showingRef.current || !canInterrupt()) return;
      shownIdsRef.current.add(next.id);
      showingRef.current = true;
      setGift(next);
      onAnnounce?.();
    } catch {
      // The gift is still in Notifications and on Billing; the pop-up is a nicety.
    }
  }, [canInterrupt, enabled, onAnnounce, token]);

  const close = useCallback(async () => {
    showingRef.current = false;
    setGift(null);
    if (!token) return;
    try {
      await markAllNotificationsRead(token, GIFT_PASS_NOTIFICATION_TYPE);
    } catch {
      // Left unread, it shows once more next time; that's the safe way to fail.
    }
  }, [token]);

  return { gift, check, close };
}
