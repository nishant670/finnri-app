import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

import { formatDayMonth } from './datetime';
import { monthFromActionURL } from './monthly-review';
import {
  accountIdFromActionURL,
  isBillingActionURL,
  isRecurringActionURL,
  type AppNotification,
} from './notifications';

type GlyphName = keyof typeof MaterialCommunityIcons.glyphMap;

export type NotificationKind = {
  icon: GlyphName;
  /** The glyph colour on a light tile; `categoryTile` derives the dark pair. */
  color: string;
  bgColor: string;
  /** The next step, naming the screen the notification opens. */
  action: string | null;
};

/**
 * The tile hues R10-Kinds gives each family. Red means something is late,
 * amber that it is close; the rest say what kind of thing it is.
 */
const HUES = {
  account: { color: '#1E6FB8', bgColor: '#E3F2FD' },
  statement: { color: '#6A4BBC', bgColor: '#EDE7F6' },
  soon: { color: '#B45309', bgColor: '#FFF4E0' },
  late: { color: '#C43D52', bgColor: '#FDECEE' },
  done: { color: '#16825D', bgColor: '#E8F5E9' },
  review: { color: '#C2185B', bgColor: '#FCE4EC' },
  split: { color: '#00897B', bgColor: '#E0F2F1' },
  neutral: { color: '#64748B', bgColor: '#F1F5F9' },
} as const;

/**
 * One entry per notification type the API writes (R10-Kinds). The old screen
 * picked an icon by substring, so most types fell through to the bell.
 */
const KINDS: Record<string, NotificationKind> = {
  'account.needs_setup': { icon: 'bank-outline', ...HUES.account, action: 'Add details' },
  'card_statement.statement_expected': {
    icon: 'receipt-text-outline',
    ...HUES.statement,
    action: 'Add the bill amount',
  },
  'card_statement.itemize_pending': { icon: 'receipt-text-outline', ...HUES.statement, action: 'Open card' },
  'card_statement.due_soon': { icon: 'calendar-blank-outline', ...HUES.soon, action: 'Open card' },
  'card_statement.due_today': { icon: 'calendar-blank-outline', ...HUES.soon, action: 'Open card' },
  'card_statement.overdue': { icon: 'calendar-alert', ...HUES.late, action: 'Open card' },
  'subscription.due': { icon: 'calendar-blank-outline', ...HUES.soon, action: 'Open Recurring' },
  'subscription.overdue': { icon: 'calendar-alert', ...HUES.late, action: 'Open Recurring' },
  'subscription.cancel': { icon: 'calendar-blank-outline', ...HUES.soon, action: 'Open Recurring' },
  // Confirm and Fix it are the actions; the row itself opens nothing.
  'subscription.autopay': { icon: 'calendar-check-outline', ...HUES.done, action: null },
  'budget.warning': { icon: 'chart-pie-outline', ...HUES.soon, action: 'Open budget' },
  'budget.exceeded': { icon: 'chart-pie-outline', ...HUES.late, action: 'Open budget' },
  'refund.due': { icon: 'arrow-u-left-top', ...HUES.done, action: 'Open entry' },
  'card.annual_fee': { icon: 'credit-card-outline', ...HUES.statement, action: 'Open card' },
  'recurring.completed': { icon: 'flag-outline', ...HUES.done, action: 'Open Recurring' },
  monthly_review: { icon: 'chart-bar', ...HUES.review, action: 'Read the review' },
  'split.group_invite.received': { icon: 'account-group-outline', ...HUES.split, action: 'View invite' },
  'split.group_invite.accepted': { icon: 'account-group-outline', ...HUES.split, action: 'Open Splits' },
  'split.settlement.recorded': { icon: 'hand-coin-outline', ...HUES.split, action: 'Review in Splits' },
  'split.settlement.confirmed': { icon: 'check', ...HUES.done, action: 'Open Splits' },
  'split.settlement.denied': { icon: 'close-circle-outline', ...HUES.late, action: 'Open Splits' },
  'billing.pass.gifted': { icon: 'gift-outline', ...HUES.done, action: 'See your pass' },
};

const FALLBACK: NotificationKind = { icon: 'bell-outline', ...HUES.neutral, action: null };

/** The icon, tile and action label for a notification type. */
export function notificationKind(type: string): NotificationKind {
  return KINDS[type] ?? FALLBACK;
}

// The app's own scheme is `finnri://`. `ezmoney://` is the pre-rename scheme,
// still registered in app.json so links minted by an older build keep working;
// both spellings reduce to the same router path here.
const splitInviteTokenFromActionURL = (actionURL?: string) => {
  if (!actionURL) return null;
  const path = actionURL.trim().replace(/^(?:finnri|ezmoney):\/\//, '/');
  return path.match(/^\/invite\/split\/([^/?#]+)$/)?.[1] ?? null;
};

const RECURRING: Href = { pathname: '/(tabs)/money', params: { segment: 'subscriptions' } };

/**
 * Where tapping a notification goes, or `null` when it opens nothing.
 *
 * Two of these were dead taps until R10. Budget alerts carry
 * `action_url: "/notifications"` — the screen the user is already on — so they
 * now open Budgets; recurring reminders carry `/subscriptions`, which had no
 * route, and now open Money › Recurring.
 */
export function notificationDestination(notification: AppNotification): Href | null {
  const url = notification.action_url ?? undefined;

  if (notification.type.startsWith('budget.')) return '/budgets';
  if (url === '/subscriptions' || isRecurringActionURL(url)) return RECURRING;

  const entryId = url?.match(/^\/entry\/(\d+)$/)?.[1];
  if (entryId) return { pathname: '/entry/[id]', params: { id: entryId } };

  const accountId = accountIdFromActionURL(url);
  if (accountId) return { pathname: '/accounts/[id]', params: { id: accountId } };

  // A settlement has no screen of its own. Both sides of the decision belong on
  // Splits: the prompt to confirm or deny sits at the top of it, and the
  // outcome is a row in its activity feed.
  if (/^\/split\/(groups|settlements)\/\d+$/.test(url ?? '')) return '/(tabs)/split';

  const inviteToken = splitInviteTokenFromActionURL(url);
  if (inviteToken) return { pathname: '/invite/split/[token]', params: { token: inviteToken } };

  const reviewMonth = monthFromActionURL(url);
  if (reviewMonth) return { pathname: '/monthly-review', params: { month: reviewMonth } };

  if (isBillingActionURL(url)) return '/billing';

  return null;
}

/** The autopay occurrence a notification is about, for its Confirm / Fix it buttons. */
export function occurrenceIdFromActionURL(actionURL?: string | null): number | null {
  const match = actionURL?.match(/^\/subscription-occurrences\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export type NotificationGroup = 'Today' | 'Last 7 days' | 'Earlier';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Today · Last 7 days · Earlier, by the calendar day a notification arrived. */
export function notificationGroup(createdAt: string, now: Date = new Date()): NotificationGroup {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 'Earlier';
  const days = Math.round((startOfDay(now).getTime() - startOfDay(created).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days < 7) return 'Last 7 days';
  return 'Earlier';
}

/** Notifications in their groups, keeping the server's newest-first order. */
export function groupNotifications(
  notifications: AppNotification[],
  now: Date = new Date()
): { group: NotificationGroup; items: AppNotification[] }[] {
  const order: NotificationGroup[] = ['Today', 'Last 7 days', 'Earlier'];
  const buckets = new Map<NotificationGroup, AppNotification[]>();
  for (const notification of notifications) {
    const group = notificationGroup(notification.created_at, now);
    buckets.set(group, [...(buckets.get(group) ?? []), notification]);
  }
  return order
    .filter((group) => buckets.has(group))
    .map((group) => ({ group, items: buckets.get(group) ?? [] }));
}

/** "3h ago" today, "12 Oct" before that. */
export function notificationTimeLabel(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && notificationGroup(value, now) === 'Today') return `${hours}h ago`;
  return formatDayMonth(date);
}
