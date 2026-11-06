import type { AppNotification } from './notifications';

/**
 * The notification the API writes when an admin gifts someone a pass
 * (`notifyGiftedPass` in finnri-api). Its body already says which pass, until
 * when, and with how many credits, so the pop-up shows it as written.
 */
export const GIFT_PASS_NOTIFICATION_TYPE = 'billing.pass.gifted';

/** The newest gift the person has not seen yet, from a newest-first list. */
export const latestUnreadGift = (notifications: AppNotification[]): AppNotification | null =>
  notifications.find(
    (notification) => notification.type === GIFT_PASS_NOTIFICATION_TYPE && !notification.read_at
  ) ?? null;
