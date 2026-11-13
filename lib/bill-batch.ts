import type { AiReviewMetadata, EntryForm } from '@/components/transactions/TransactionFormModal';
import type { BillingStatus } from '@/lib/billing';
import { formatMoney } from '@/lib/money';
import { ParseApiError, type ParseDraft } from '@/lib/parse';
import { parseDateLabel } from '@/lib/transactions';

/**
 * Several bills scanned in one go (canvas Round 20, P95–P102).
 *
 * Each bill is read by the ordinary bill reader, at its usual price, and an
 * unreadable bill is still free. What this module adds is the tray: the list of
 * bills between picking the photos and saving them. Everything here is pure, so
 * the screen in `app/bills.tsx` stays about layout and motion.
 */

/**
 * How many bills one scan takes. The user set five on 2026-11-13, to be raised
 * in a later release; the API caps a batch at the same number
 * (`receiptBatchMaxBills` in finnri-api `internal/http/receipt_batch.go`).
 */
export const MAX_BILLS_PER_BATCH = 5;

/** Bills read at the same time. Two keeps results arriving without a queue of spinners. */
export const BILL_READ_CONCURRENCY = 2;

export type BillStatus = 'waiting' | 'reading' | 'read' | 'failed' | 'saving' | 'saved';

export type BillFailure = {
  title: string;
  message: string;
  /** The read cost nothing (every unreadable bill, and our own errors). */
  free: boolean;
  /** Retrying can help. A refused batch or an empty balance cannot be retried here. */
  retryable: boolean;
};

export type BillDuplicate = {
  /** Where the match is: already in the ledger, or another bill in this scan. */
  kind: 'ledger' | 'batch';
  label: string;
};

export type BillItem = {
  key: string;
  uri: string;
  /** Ticked: read it, and save it. Unticking costs nothing and keeps the photo. */
  included: boolean;
  status: BillStatus;
  draft?: ParseDraft;
  form?: EntryForm;
  aiReview?: AiReviewMetadata | null;
  failure?: BillFailure;
  duplicate?: BillDuplicate | null;
  /** Credits this bill's read used. */
  creditsCharged?: number;
  saveError?: string;
};

let keySeed = 0;

/** An id the API accepts in X-Finnri-Batch: 8–64 letters, digits or hyphens. */
export const createBatchId = (now = Date.now(), random = Math.random()) =>
  `bills-${now.toString(36)}-${Math.floor(random * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;

export const billItemsFromUris = (uris: string[]): BillItem[] =>
  uris.map((uri) => {
    keySeed += 1;
    return { key: `bill-${Date.now().toString(36)}-${keySeed}`, uri, included: true, status: 'waiting' };
  });

/** Room left for more photos in this scan. */
export const roomForMoreBills = (items: BillItem[]) =>
  Math.max(0, MAX_BILLS_PER_BATCH - items.length);

/**
 * Credits that can be spent right now: the balance, or today's allowance if
 * that is smaller. Null while billing has not loaded — never a reason to block.
 */
export const spendableCredits = (status: Pick<BillingStatus, 'credits'> | null): number | null => {
  if (!status) return null;
  const total = status.credits.total_credits_remaining ?? 0;
  const dailyLimit = status.credits.daily_limit ?? 0;
  const daily = status.credits.daily_credits_remaining ?? 0;
  return dailyLimit > 0 ? Math.min(total, daily) : total;
};

/** How many of `count` bills the person can afford (P102). */
export const affordableBills = (spendable: number | null, price: number, count: number) => {
  if (spendable == null || price <= 0) return count;
  return Math.max(0, Math.min(count, Math.floor(spendable / price)));
};

/**
 * Untick bills past what the credits cover, keeping the first ones ticked.
 * Returns the same array when nothing has to change.
 */
export const tickAffordable = (items: BillItem[], affordable: number): BillItem[] => {
  let ticked = 0;
  let changed = false;
  const next = items.map((item) => {
    if (!item.included) return item;
    ticked += 1;
    if (ticked <= affordable) return item;
    changed = true;
    return { ...item, included: false };
  });
  return changed ? next : items;
};

/** The waiting bills to start reading now, so at most `concurrency` are in flight. */
export const nextBillsToRead = (items: BillItem[], concurrency = BILL_READ_CONCURRENCY) => {
  const inFlight = items.filter((item) => item.status === 'reading').length;
  const room = Math.max(0, concurrency - inFlight);
  return items
    .filter((item) => item.included && item.status === 'waiting')
    .slice(0, room)
    .map((item) => item.key);
};

export const billAmount = (item: Pick<BillItem, 'form'>) => {
  const amount = Number((item.form?.amount ?? '').replace(/,/g, '').trim());
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

/** Ticked, read and not yet saved: what Save will save. */
export const isPendingSave = (item: BillItem) => item.included && item.status === 'read';

/** Why a read bill can't be saved as it stands, or null when it can. */
export const billNeedsAttention = (item: BillItem): string | null => {
  if (!isPendingSave(item)) return null;
  if (billAmount(item) <= 0) return 'No total on this bill. Tap to add it.';
  if (!item.form?.title.trim()) return 'Add a name for this bill.';
  return null;
};

const NEEDS_CHECK_LABELS: Record<string, string> = {
  amount: 'Amount unclear, check it',
  date: 'Date unclear, check it',
  merchant: 'Shop unclear, check it',
  category: 'Category is a guess',
  mode: 'Payment method is a guess',
};

/** The one thing worth a second look on a read bill, as a short chip label. */
export const billCheckLabel = (item: BillItem): string | null => {
  const flagged = item.aiReview?.needsConfirmation ?? {};
  for (const field of ['amount', 'date', 'merchant'] as const) {
    if (flagged[field]) return NEEDS_CHECK_LABELS[field];
  }
  return null;
};

export type BatchSummary = {
  /** Bills Save would save. */
  toSave: number;
  /** Their total, in rupees. */
  total: number;
  /** Bills read so far (whatever happened next). */
  read: number;
  /** Ticked bills being read or waiting to be. */
  reading: number;
  /** Ticked bills in all, the denominator for "1 of 4 read". */
  ticked: number;
  failed: number;
  saved: number;
  creditsUsed: number;
  /** Read bills that stop Save until they are fixed or removed. */
  needingAttention: number;
};

export const batchSummary = (items: BillItem[]): BatchSummary => {
  const summary: BatchSummary = {
    toSave: 0,
    total: 0,
    read: 0,
    reading: 0,
    ticked: 0,
    failed: 0,
    saved: 0,
    creditsUsed: 0,
    needingAttention: 0,
  };
  for (const item of items) {
    summary.creditsUsed += item.creditsCharged ?? 0;
    if (item.status === 'saved') summary.saved += 1;
    if (!item.included) continue;
    summary.ticked += 1;
    if (item.status === 'waiting' || item.status === 'reading') summary.reading += 1;
    if (item.status === 'failed') summary.failed += 1;
    if (item.status === 'read' || item.status === 'saving' || item.status === 'saved') {
      summary.read += 1;
    }
    if (isPendingSave(item)) {
      summary.toSave += 1;
      summary.total += billAmount(item);
      if (billNeedsAttention(item)) summary.needingAttention += 1;
    }
  }
  summary.read += summary.failed;
  return summary;
};

const sameDay = (a?: string, b?: string) => {
  const left = a ? parseDateLabel(a) : null;
  const right = b ? parseDateLabel(b) : null;
  return !!left && !!right && left.toDateString() === right.toDateString();
};

/**
 * Two bills in this scan for the same amount on the same day are most likely
 * one payment photographed twice — the paper bill and the UPI screenshot. The
 * later one is flagged and unticked (P99); a match against the ledger is
 * checked separately, by `findLikelyDuplicate`.
 */
export const flagBatchDuplicates = (items: BillItem[]): BillItem[] => {
  let changed = false;
  const next = items.map((item, index) => {
    if (item.status !== 'read' || item.duplicate) return item;
    const amount = Math.round(billAmount(item));
    if (amount <= 0) return item;
    const earlier = items
      .slice(0, index)
      .find(
        (other) =>
          other.status === 'read' &&
          Math.round(billAmount(other)) === amount &&
          sameDay(other.form?.date, item.form?.date)
      );
    if (!earlier) return item;
    changed = true;
    return {
      ...item,
      included: false,
      duplicate: { kind: 'batch' as const, label: `Same as ${earlier.form?.title || 'another bill'} above` },
    };
  });
  return changed ? next : items;
};

/** The chip for a match against the ledger: "Already logged at 1:12 pm". */
export const ledgerDuplicateLabel = (match: {
  dateLabel?: string | null;
  timeLabel?: string | null;
}) => {
  if (match.timeLabel) return `Already logged at ${match.timeLabel}`;
  if (match.dateLabel) return `Already logged on ${match.dateLabel}`;
  return 'Already logged';
};

/**
 * "One total" (P100): the ticked bills as a single transaction.
 *
 * The bigger bill decides everything the bills could disagree on — category,
 * payment, date, account and the photo kept as the receipt — because it is
 * most of the money. The breakdown goes into the note, so nothing is lost.
 */
export const mergeBillsIntoOne = (items: BillItem[]): EntryForm | null => {
  const bills = items.filter((item) => isPendingSave(item) && item.form);
  if (bills.length === 0) return null;
  const lead = [...bills].sort((a, b) => billAmount(b) - billAmount(a))[0];
  const form = lead.form as EntryForm;
  const total = bills.reduce((sum, item) => sum + billAmount(item), 0);
  const names = bills.map((item) => item.form?.title.trim() || 'Bill');
  const title =
    names.length <= 2 ? names.join(' + ') : `${names[0]} + ${names.length - 1} more`;
  const breakdown = bills
    .map((item, index) => `${names[index]} ${formatMoney(billAmount(item), { sign: 'never' })}`)
    .join(', ');
  return {
    ...form,
    title,
    merchant: bills.length === 1 ? form.merchant : '',
    amount: String(Math.round(total * 100) / 100),
    notes: form.notes.trim() ? `${breakdown}\n${form.notes.trim()}` : breakdown,
    // A split or a recurring payment belongs to one bill, not to the sum.
    splitEnabled: false,
    splitParticipants: [],
    subscriptionEnabled: false,
  };
};

/**
 * What a row says when its read fails. Short, because it sits in a list row,
 * and always clear about the cost: an unreadable bill is free (the server says
 * `credits_charged: 0`), and a read refused before it started never charged.
 */
export const billFailureFor = (error: unknown): BillFailure => {
  if (!(error instanceof ParseApiError)) {
    return {
      title: "Couldn't reach Finnri",
      message: 'Check your connection, then Retry.',
      free: true,
      retryable: true,
    };
  }
  const free = error.creditsCharged === 0 || error.status === 402 || error.status === 429;
  switch (error.code) {
    case 'receipt_unreadable':
      return {
        title: "Couldn't read this one",
        message: 'No total found. No credits used.',
        free: true,
        retryable: true,
      };
    case 'unsupported_receipt_image':
    case 'receipt_image_too_large':
      return {
        title: "This photo can't be read",
        message: 'Try a different photo of the bill. No credits used.',
        free: true,
        retryable: false,
      };
    case 'insufficient_ai_credits':
    case 'daily_ai_limit_reached':
      return {
        title: 'Not enough credits',
        message: 'This bill was not read. No credits used.',
        free: true,
        retryable: false,
      };
    case 'receipt_batch_full':
      return {
        title: 'This scan is full',
        message: 'Start a new scan for this bill.',
        free: true,
        retryable: false,
      };
    case 'ai_parse_cooldown_active':
      return {
        title: 'Too many unreadable photos',
        message: 'Wait a few minutes, then Retry.',
        free: true,
        retryable: true,
      };
    default:
      return {
        title: "Couldn't read this one",
        message: free ? 'Something went wrong. No credits used.' : 'Something went wrong. Retry.',
        free,
        retryable: true,
      };
  }
};

/** "13 Nov" from the form's date label, for rows where space is short. */
export const shortBillDate = (label?: string | null) => {
  const date = label ? parseDateLabel(label) : null;
  return date ? date.toLocaleString('en-GB', { day: 'numeric', month: 'short' }) : (label ?? '');
};
