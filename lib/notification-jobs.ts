import type { AppNotification } from './notifications';

/**
 * Types that ask the user to do something (P45, board R10-Notif-Proposals,
 * following R10-Kinds). Everything else is an update: worth knowing, with
 * nothing to do.
 */
const NEEDS_YOU_TYPES = new Set([
  'account.needs_setup',
  'card_statement.statement_expected',
  'card_statement.itemize_pending',
  'card_statement.due_soon',
  'card_statement.due_today',
  'card_statement.overdue',
  'subscription.due',
  'subscription.overdue',
  'subscription.cancel',
  'subscription.autopay',
  'refund.due',
  'split.settlement.recorded',
  'split.group_invite.received',
]);

export const needsYou = (notification: AppNotification) => NEEDS_YOU_TYPES.has(notification.type);

/**
 * One row per job (P46): every reminder about the same thing, newest first.
 * "SBI simply save bill" reminded three times is one row that says so, and
 * accounts to finish or settle-ups to answer stack under one heading.
 */
export type NotificationJob = {
  key: string;
  /** Newest first; `items[0]` is the one the row shows. */
  items: AppNotification[];
  /** For a stack that is several things, not one thing reminded often. */
  stackTitle: string | null;
};

const familyOf = (type: string) => type.split('.')[0];

/** What makes two notifications the same job. */
const jobKey = (notification: AppNotification) => {
  switch (notification.type) {
    case 'account.needs_setup':
      return 'account.needs_setup';
    case 'split.settlement.recorded':
      return 'split.settlement.recorded';
    case 'subscription.autopay':
      // Each autopay charge has its own Confirm / Fix it.
      return `autopay:${notification.id}`;
    default:
      return notification.action_url
        ? `${familyOf(notification.type)}:${notification.action_url}`
        : `id:${notification.id}`;
  }
};

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (count: number) => NUMBER_WORDS[count] ?? String(count);

const stackTitleFor = (key: string, count: number): string | null => {
  if (count < 2) return null;
  if (key === 'account.needs_setup') return `Finish setting up ${count} accounts`;
  if (key === 'split.settlement.recorded') return `${countWord(count)} settle-ups are waiting for your OK`;
  return null;
};

const byNewest = (a: AppNotification, b: AppNotification) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

/**
 * The screen's two sections (P45): what needs you, as one row per job, and
 * updates, newest first. Anything the server marked resolved — the bill paid,
 * the settle-up answered — is gone from both (P49).
 */
export const buildNotificationSections = (notifications: AppNotification[]) => {
  const live = notifications.filter((notification) => !notification.resolved_at).sort(byNewest);
  const jobs = new Map<string, AppNotification[]>();
  const updates: AppNotification[] = [];
  live.forEach((notification) => {
    if (!needsYou(notification)) {
      updates.push(notification);
      return;
    }
    const key = jobKey(notification);
    jobs.set(key, [...(jobs.get(key) ?? []), notification]);
  });
  const needs: NotificationJob[] = [...jobs.entries()].map(([key, items]) => ({
    key,
    items,
    stackTitle: stackTitleFor(key, items.length),
  }));
  return { needs, updates };
};

/** A reminder's amount as a number, or null (P48). */
export const notificationAmount = (notification: AppNotification): number | null => {
  const value = Number(notification.amount);
  return notification.amount != null && Number.isFinite(value) && value > 0 ? value : null;
};
