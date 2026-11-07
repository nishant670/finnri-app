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

/**
 * The reminders that are the same job at different stages: a bill coming up,
 * due today and overdue is one bill to pay. Anything else about the same
 * thing (a card's statement to add, a subscription's cancel-by) is a job of
 * its own.
 */
const STAGE_OF_SAME_JOB: Record<string, string> = {
  'subscription.due': 'subscription.payment',
  'subscription.overdue': 'subscription.payment',
  'card_statement.due_soon': 'card_statement.payment',
  'card_statement.due_today': 'card_statement.payment',
  'card_statement.overdue': 'card_statement.payment',
};

/**
 * Links that do not name one thing. Reminders from before subscription links
 * named their subscription all point at "/subscriptions", so they must not be
 * stacked as if they were about one payment.
 */
const GENERIC_LINKS = new Set(['/subscriptions', '/notifications']);

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
    default: {
      const url = notification.action_url;
      if (!url || GENERIC_LINKS.has(url)) return `id:${notification.id}`;
      return `${STAGE_OF_SAME_JOB[notification.type] ?? notification.type}:${url}`;
    }
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
