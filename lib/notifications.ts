import { API_BASE_URL } from './transactions';

export type AppNotification = {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  action_url?: string;
  read_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationListResponse = {
  notifications: AppNotification[];
  unread_count: number;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const emptyNotifications: NotificationListResponse = {
  notifications: [],
  unread_count: 0,
  page: 1,
  page_size: 25,
  total: 0,
  total_pages: 0,
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

const parseNotificationPayload = (payload: unknown): NotificationListResponse => {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    notifications: Array.isArray(record.notifications)
      ? (record.notifications as AppNotification[])
      : [],
    unread_count: Number(record.unread_count ?? 0),
    page: Number(record.page ?? 1),
    page_size: Number(record.page_size ?? 25),
    total: Number(record.total ?? 0),
    total_pages: Number(record.total_pages ?? 0),
  };
};

export const fetchNotifications = async (
  token?: string | null,
  status: 'all' | 'unread' | 'read' = 'all'
): Promise<NotificationListResponse> => {
  if (!token) {
    return emptyNotifications;
  }

  const response = await fetch(`${API_BASE_URL}/v1/notifications?status=${status}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Unable to load notifications right now.');
  }
  return parseNotificationPayload(await response.json());
};

/**
 * `typePrefix` narrows the count to one family — `split.` being the one the
 * Splits screen asks for.
 *
 * That screen needed a way to say "something in here wants you" without
 * claiming it every time the user themselves added an expense. Its activity
 * feed records everything, so a dot driven by activity would light on the first
 * launch and never go out again. Unread notifications are only ever written
 * *about* the reader by somebody else, and they clear when read — which is the
 * signal the dot was actually reaching for.
 */
export const fetchUnreadNotificationCount = async (
  token?: string | null,
  typePrefix?: string
): Promise<number> => {
  if (!token) {
    return 0;
  }
  const query = typePrefix ? `?type_prefix=${encodeURIComponent(typePrefix)}` : '';
  const response = await fetch(`${API_BASE_URL}/v1/notifications/unread-count${query}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    return 0;
  }
  const payload = await response.json();
  return Number(payload?.unread_count ?? 0);
};

/** The prefix every split-related notification type starts with. */
export const SPLIT_NOTIFICATION_PREFIX = 'split.';

export const fetchUnreadBudgetNotificationIds = async (
  token?: string | null
): Promise<Set<number>> => {
  const payload = await fetchNotifications(token, 'unread');
  return new Set(
    payload.notifications
      .filter((notification) => notification.type.startsWith('budget.'))
      .map((notification) => notification.id)
  );
};

export const fetchNewUnreadBudgetNotification = async (
  token: string,
  previousIds: Set<number>
): Promise<AppNotification | null> => {
  const payload = await fetchNotifications(token, 'unread');
  return (
    payload.notifications.find(
      (notification) =>
        notification.type.startsWith('budget.') && !previousIds.has(notification.id)
    ) ?? null
  );
};

export const markNotificationRead = async (token: string, id: number) => {
  const response = await fetch(`${API_BASE_URL}/v1/notifications/${id}/read`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Unable to mark notification as read.');
  }
  return (await response.json()) as AppNotification;
};

/**
 * `typePrefix` narrows what gets cleared, so one screen can mark its own
 * notifications seen without dismissing an unrelated budget alert the user has
 * never opened.
 */
export const markAllNotificationsRead = async (token: string, typePrefix?: string) => {
  const query = typePrefix ? `?type_prefix=${encodeURIComponent(typePrefix)}` : '';
  const response = await fetch(`${API_BASE_URL}/v1/notifications/read-all${query}`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new Error('Unable to mark notifications as read.');
  }
};
