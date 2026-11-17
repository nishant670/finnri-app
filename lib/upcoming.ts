import type { Account } from '@/lib/accounts';
import { normalizeAccountType } from '@/lib/accounts';
import type { Subscription } from '@/lib/subscriptions';
import type { RefundableEntry } from '@/lib/refundables';

/**
 * What money leaves the account next, from every source that knows a date.
 *
 * Subscriptions carry `next_due_date` and credit cards carry `due_day`, and
 * before this the two were only ever readable on separate screens — a renewal
 * on Subscriptions, a card statement on Accounts — so nobody could answer
 * "what is due this week" without visiting both and doing the merge by hand.
 */
export type UpcomingDueKind = 'subscription' | 'card' | 'refund';

export type UpcomingDueState = 'overdue' | 'today' | 'soon' | 'scheduled';

export type UpcomingDue = {
  key: string;
  kind: UpcomingDueKind;
  /** The subscription or account id, for routing to the thing itself. */
  sourceID: number;
  title: string;
  subtitle: string;
  /** Null when the source knows a date but not a figure — an unused card. */
  amount: number | null;
  /** YYYY-MM-DD, local. */
  dueDate: string;
  /** Negative when the date has already passed. */
  daysUntil: number;
  state: UpcomingDueState;
  /**
   * Money coming in rather than going out: recurring income (a salary). It is
   * listed so its day is visible, but never added to what is due.
   */
  incoming?: boolean;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const toApiDate = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const parseApiDate = (value?: string | null) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const daysBetween = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);

const stateFor = (daysUntil: number): UpcomingDueState => {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil === 0) return 'today';
  if (daysUntil <= 7) return 'soon';
  return 'scheduled';
};

/**
 * The next time a card falls due on `dueDay`, from `today` forward.
 *
 * A card billed on the 31st has no 31st in September, and `new Date(y, 8, 31)`
 * silently rolls into October — so the day is clamped to the month it lands in
 * rather than allowed to overflow into the next one.
 */
export const nextCardDueDate = (dueDay: number, today: Date): Date | null => {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;

  const clampedFor = (year: number, month: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(dueDay, lastDay));
  };

  const base = startOfDay(today);
  const thisMonth = clampedFor(base.getFullYear(), base.getMonth());
  if (thisMonth >= base) return thisMonth;
  return clampedFor(base.getFullYear(), base.getMonth() + 1);
};

export type BuildUpcomingDuesOptions = {
  subscriptions: Subscription[];
  accounts: Account[];
  refundables?: RefundableEntry[];
  today?: Date;
  /** How far ahead to look. Anything already overdue is listed regardless. */
  horizonDays?: number;
};

export const buildUpcomingDues = ({
  subscriptions,
  accounts,
  refundables = [],
  today = new Date(),
  horizonDays = 30,
}: BuildUpcomingDuesOptions): UpcomingDue[] => {
  const base = startOfDay(today);
  const dues: UpcomingDue[] = [];

  for (const subscription of subscriptions) {
    // Paused and cancelled subscriptions still carry a date the backend never
    // cleared. Listing them would put money in this total that is not leaving.
    if (subscription.status !== 'active') continue;
    const dueDate = parseApiDate(subscription.next_due_date);
    if (!dueDate) continue;

    const daysUntil = daysBetween(base, dueDate);
    if (daysUntil > horizonDays) continue;

    const amount = Number(subscription.amount ?? 0);
    const incoming = subscription.kind === 'income';
    dues.push({
      ...(incoming ? { incoming: true } : {}),
      key: `subscription-${subscription.id}`,
      kind: 'subscription',
      sourceID: subscription.id,
      title: subscription.name?.trim() || subscription.merchant?.trim() || 'Subscription',
      subtitle: incoming
        ? 'Expected in'
        : subscription.merchant?.trim() || subscription.category?.trim() || 'Recurring',
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      dueDate: toApiDate(dueDate),
      daysUntil,
      state: stateFor(daysUntil),
    });
  }

  for (const account of accounts) {
    if (normalizeAccountType(account.type) !== 'credit_card') continue;
    const dueDate = nextCardDueDate(Number(account.due_day), base);
    if (!dueDate) continue;

    const daysUntil = daysBetween(base, dueDate);
    if (daysUntil > horizonDays) continue;

    // `outstanding` is what the ledger says is owed. `credit_limit` is money
    // the user does not have and must never appear as an amount due.
    const outstanding = Number(account.summary?.outstanding ?? 0);
    dues.push({
      key: `card-${account.id}`,
      kind: 'card',
      sourceID: account.id,
      title: account.name,
      subtitle: 'Card payment',
      amount: Number.isFinite(outstanding) && outstanding > 0 ? outstanding : null,
      dueDate: toApiDate(dueDate),
      daysUntil,
      state: stateFor(daysUntil),
    });
  }

  for (const entry of refundables) {
    if (entry.refund_status !== 'pending') continue;
    const dueDate = parseApiDate(entry.refund_expected_on);
    if (!dueDate) continue;
    const daysUntil = daysBetween(base, dueDate);
    if (daysUntil > horizonDays) continue;
    const amount = Number(entry.refundable_amount);
    dues.push({
      key: `refund-${entry.id}`,
      kind: 'refund',
      sourceID: Number(entry.id),
      title: entry.title?.trim() || entry.merchant?.trim() || 'Expected refund',
      subtitle: 'Expected back',
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      dueDate: toApiDate(dueDate),
      daysUntil,
      state: stateFor(daysUntil),
    });
  }

  return dues.sort((a, b) =>
    a.daysUntil === b.daysUntil ? a.title.localeCompare(b.title) : a.daysUntil - b.daysUntil
  );
};

/** What the panel header states — only figures it can back. */
export const totalUpcomingAmount = (dues: UpcomingDue[]) =>
  dues.reduce((sum, due) => sum + (isIncomingDue(due) ? 0 : (due.amount ?? 0)), 0);

/** Money going out that is past its date. Late income is not owed money. */
export const isLateDue = (due: UpcomingDue) => due.state === 'overdue' && !due.incoming;

/** Money expected in — a refund or recurring income — not money going out. */
export const isIncomingDue = (due: UpcomingDue) => due.kind === 'refund' || due.incoming === true;

/**
 * The status words for a due: "Due today" going out; for money coming in,
 * "Expected back · Due today" on a refund and "Expected today" on income —
 * and a late salary is "3 days late", not "overdue", which reads as owed.
 */
export const dueStatusLabel = (due: UpcomingDue) => {
  if (due.kind === 'refund') return `Expected back · ${formatDueLabel(due)}`;
  if (!due.incoming) return formatDueLabel(due);
  if (due.daysUntil === 0) return 'Expected today';
  if (due.daysUntil === 1) return 'Expected tomorrow';
  if (due.daysUntil === -1) return '1 day late';
  if (due.daysUntil < 0) return `${Math.abs(due.daysUntil)} days late`;
  return formatDueLabel(due).replace(/^Due/, 'Expected');
};

export const formatDueLabel = (due: UpcomingDue) => {
  if (due.daysUntil === 0) return 'Due today';
  if (due.daysUntil === 1) return 'Due tomorrow';
  if (due.daysUntil === -1) return '1 day overdue';
  if (due.daysUntil < 0) return `${Math.abs(due.daysUntil)} days overdue`;
  if (due.daysUntil <= 7) return `Due in ${due.daysUntil} days`;
  const parsed = parseApiDate(due.dueDate);
  return parsed
    ? `Due ${parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : `Due in ${due.daysUntil} days`;
};
