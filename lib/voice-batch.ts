import type { AiReviewMetadata, EntryForm } from '@/components/transactions/TransactionFormModal';
import { accountForParsedDraft, type Account } from '@/lib/accounts';
import { formatTime, parseTimeOfDay } from '@/lib/datetime';
import { applyParsedDraftToForm, buildAiReview, createBlankEntryForm } from '@/lib/home-capture';
import { formatMoney } from '@/lib/money';
import type { ParseBatch, ParseBatchItem, TimeSlot } from '@/lib/parse';
import { resolveSplitDraft } from '@/lib/split-draft';
import type { SplitFriend, SplitGroup } from '@/lib/splits';
import { parseDateLabel } from '@/lib/transactions';

export type TimeOfDay = { hours: number; minutes: number };

/**
 * Speak your day (canvas Round 21, P103–P117, approved 2026-11-20).
 *
 * One spoken or typed prompt can hold up to ten transactions. The API reads
 * them in one call, charged once; this module turns its answer into the tray
 * on `app/batch.tsx` and holds every rule that tray follows: slot times, the
 * "as above" payment, what needs a look, and One total for the day. Pure, so
 * the screen stays about layout and motion.
 */

/**
 * How many transactions one prompt may hold (P116, set 2026-11-20). The API
 * holds the same number (`ai.MaxBatchItems` in finnri-api).
 */
export const MAX_ITEMS_PER_PROMPT = 10;

/** How long one spoken day may run before it sends itself (P104). */
export const MAX_RECORDING_SECONDS = 90;
/** When the timer warns that the end is near (P104). */
export const RECORDING_WARN_SECONDS = 80;

/** The time each part of the day stands for (P108). */
export const SLOT_TIMES: Record<TimeSlot, TimeOfDay> = {
  morning: { hours: 9, minutes: 0 },
  afternoon: { hours: 14, minutes: 0 },
  evening: { hours: 18, minutes: 30 },
  night: { hours: 21, minutes: 30 },
};

export const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

export type DayItemStatus = 'ready' | 'saving' | 'saved';

export type DayItem = {
  key: string;
  /** Ticked: save it. Starts unticked when it is already in the ledger. */
  included: boolean;
  status: DayItemStatus;
  draft: ParseBatchItem;
  form: EntryForm;
  aiReview: AiReviewMetadata | null;
  /** The part of the day this item sits in, after inheriting (P108). */
  slot: TimeSlot | null;
  /** Its payment was said for an earlier item (P109). */
  carried: boolean;
  duplicate?: { label: string } | null;
  saveError?: string;
  /** Id of the saved entry, for Undo (P115). */
  savedId?: number | null;
  /** Saving it also made a split or a subscription, which Undo can't take back. */
  madeExtras?: boolean;
};

/**
 * The tray's rows from a batch answer: each item through the same form code a
 * single draft uses, then given its slot time (P108). An item already said
 * twice is kept twice — repeats in one prompt are real (P113).
 */
export const dayItemsFromBatch = (
  batch: Pick<ParseBatch, 'items' | 'source_text'>,
  {
    accounts,
    smartSorting,
    inputSource,
    splitFriends = [],
    splitGroups = [],
    now = new Date(),
  }: {
    accounts: Account[];
    smartSorting: boolean;
    inputSource: 'voice' | 'text';
    splitFriends?: SplitFriend[];
    splitGroups?: SplitGroup[];
    now?: Date;
  }
): DayItem[] => {
  const items = batch.items.slice(0, MAX_ITEMS_PER_PROMPT);
  const times = slotTimesFor(items, now);
  return items.map((draft, index) => {
    const fallbackText = draft.source_text?.trim() || batch.source_text;
    const splitDraft = resolveSplitDraft(draft, splitFriends, splitGroups);
    const form = applyParsedDraftToForm(createBlankEntryForm(), draft, {
      fallbackText,
      smartSorting,
      splitDraft,
      hintedAccount: accountForParsedDraft(draft, accounts),
    });
    const { slot, time } = times[index];
    if (time) form.time = formTimeFor(time);
    return {
      key: nextDayItemKey(),
      included: true,
      status: 'ready' as const,
      draft,
      form,
      aiReview: buildAiReview(draft, fallbackText, inputSource, splitDraft, smartSorting),
      slot: slot ?? slotForTime(parseTimeOfDay(form.time)),
      carried: !!draft.mode_carried,
      duplicate: null,
    };
  });
};

let keySeed = 0;
export const nextDayItemKey = (now = Date.now()) => {
  keySeed += 1;
  return `day-${now.toString(36)}-${keySeed}`;
};

/** An id for the idempotency keys of one tray's saves. */
export const createDayBatchId = (now = Date.now(), random = Math.random()) =>
  `day-${now.toString(36)}-${Math.floor(random * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * Each item's time (P108). A clock time the person said wins. Otherwise the
 * item's slot — or the slot of the item before it, when it had no cue of its
 * own — gives a fixed time, one minute apart within a slot so the list keeps
 * the order it was said in. A time later than now is pulled back to now for
 * anything dated today. Items before any slot get null: the form keeps its
 * default.
 */
export const slotTimesFor = (
  items: Pick<ParseBatchItem, 'time' | 'time_slot' | 'date'>[],
  now = new Date()
): { slot: TimeSlot | null; time: TimeOfDay | null }[] => {
  let slot: TimeSlot | null = null;
  const usedInSlot: Partial<Record<TimeSlot, number>> = {};
  return items.map((item) => {
    if (item.time_slot) slot = item.time_slot;
    const said = item.time ? parseTimeOfDay(item.time) : null;
    if (said) return { slot, time: said };
    if (!slot) return { slot: null, time: null };
    const offset = usedInSlot[slot] ?? 0;
    usedInSlot[slot] = offset + 1;
    const base = SLOT_TIMES[slot];
    const total = base.hours * 60 + base.minutes + offset;
    let time: TimeOfDay = { hours: Math.floor(total / 60) % 24, minutes: total % 60 };
    const date = item.date ? parseDateLabel(item.date) : null;
    const isToday = !date || sameDay(date, now);
    if (isToday && time.hours * 60 + time.minutes > now.getHours() * 60 + now.getMinutes()) {
      time = { hours: now.getHours(), minutes: now.getMinutes() };
    }
    return { slot, time };
  });
};

/** The form's display string for a time of day ("9:00 AM", or "09:00" on a 24-hour phone). */
export const formTimeFor = (time: TimeOfDay) => {
  const date = new Date(2000, 0, 1, time.hours, time.minutes);
  return formatTime(date) ?? '';
};

/** The short label a time tile shows: "9:00 am". */
export const tileTimeLabel = (form: Pick<EntryForm, 'time'>) => {
  const time = parseTimeOfDay(form.time);
  if (!time) return '';
  const hours = time.hours % 12 === 0 ? 12 : time.hours % 12;
  return `${hours}:${String(time.minutes).padStart(2, '0')} ${time.hours < 12 ? 'am' : 'pm'}`;
};

/** The slot a time falls in, for a row whose time was said, not slotted. */
export const slotForTime = (time: TimeOfDay | null): TimeSlot | null => {
  if (!time) return null;
  const minutes = time.hours * 60 + time.minutes;
  if (minutes < 4 * 60) return 'night';
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  if (minutes < 21 * 60) return 'evening';
  return 'night';
};

export const itemAmount = (item: Pick<DayItem, 'form'>) => {
  const amount = Number((item.form.amount ?? '').replace(/,/g, '').trim());
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export const isIncome = (item: Pick<DayItem, 'form'>) => item.form.type.toLowerCase() === 'income';

/** Ticked and not yet saved: what Save will save. */
export const isPendingSave = (item: DayItem) => item.included && item.status === 'ready';

/**
 * Goes into One total: an expense Save would save, with an amount. One with none
 * stays in the tray, not folded in at ₹0 and gone.
 */
export const foldsIntoTotal = (item: DayItem) => isPendingSave(item) && !isIncome(item) && itemAmount(item) > 0;

/** Nothing left to save: the tray can close. */
export const dayTrayIsFinished = (items: DayItem[]) =>
  !items.some((item) => isPendingSave(item) || item.status === 'saving');

/** Why an item can't be saved as it stands (P113), or null when it can. */
export const itemNeedsAttention = (item: DayItem): string | null => {
  if (!isPendingSave(item)) return null;
  if (itemAmount(item) <= 0) return "Didn't catch the amount. Tap to add it.";
  if (!item.form.title.trim()) return 'Add a name for this one.';
  return null;
};

/** The one thing worth a second look, as a short amber chip (P113). */
export const itemCheckLabel = (item: DayItem): string | null => {
  const flagged = item.aiReview?.needsConfirmation ?? item.draft.needs_confirmation ?? {};
  if (flagged.title || flagged.merchant) return "Didn't catch what this was";
  if (flagged.mode) {
    if (item.form.mode === 'Credit Card' && !item.form.account) return '“Card”: which one? Check it';
    return 'Payment is a guess';
  }
  if (flagged.date) return 'Date unclear, check it';
  if (flagged.category) return 'Category is a guess';
  return null;
};

/** "UPI", "HDFC card", "Cash, as above" (P109). */
export const paidWithLabel = (item: Pick<DayItem, 'form' | 'carried'>) => {
  const form = item.form;
  const base = form.account && form.mode !== 'Cash' ? form.account : form.mode;
  if (!base) return '';
  return item.carried ? `${base}, as above` : base;
};

export type DaySummary = {
  /** Items Save would save. */
  toSave: number;
  /** Money out among them, in rupees. */
  out: number;
  /** Money in among them. */
  in: number;
  saved: number;
  /** Items that stop Save until fixed or removed. */
  needingAttention: number;
};

export const daySummary = (items: DayItem[]): DaySummary => {
  const summary: DaySummary = { toSave: 0, out: 0, in: 0, saved: 0, needingAttention: 0 };
  for (const item of items) {
    if (item.status === 'saved') summary.saved += 1;
    if (!isPendingSave(item)) continue;
    summary.toSave += 1;
    if (isIncome(item)) summary.in += itemAmount(item);
    else summary.out += itemAmount(item);
    if (itemNeedsAttention(item)) summary.needingAttention += 1;
  }
  return summary;
};

/** The payment an item counts under, for One total: its account, else its mode. */
const paymentKey = (form: EntryForm) =>
  form.account && form.mode !== 'Cash' ? form.account : form.mode || 'Cash';

export type PaymentWay = { label: string; total: number };

/** How the expenses that would fold into One total were paid, biggest first. */
export const paymentWays = (items: DayItem[]): PaymentWay[] => {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!foldsIntoTotal(item)) continue;
    const key = paymentKey(item.form);
    totals.set(key, (totals.get(key) ?? 0) + itemAmount(item));
  }
  return [...totals.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
};

const shortDayLabel = (label: string) => {
  const date = parseDateLabel(label);
  return date ? date.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : label;
};

/** "Tue 18 Nov", for the header chip. */
export const dayChipLabel = (items: DayItem[], now = new Date()) => {
  const first = items.find((item) => item.status !== 'saved') ?? items[0];
  if (!first) return null;
  const date = parseDateLabel(first.form.date);
  if (!date) return null;
  if (sameDay(date, now)) return 'Today';
  return shortDayLabel(first.form.date);
};

const largestBy = (items: DayItem[], keyOf: (item: DayItem) => string) => {
  const totals = new Map<string, { total: number; item: DayItem }>();
  for (const item of items) {
    const key = keyOf(item);
    const current = totals.get(key);
    totals.set(key, { total: (current?.total ?? 0) + itemAmount(item), item: current?.item ?? item });
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)[0]?.item ?? null;
};

/**
 * One total for the day (P111): the ticked expenses as one "Day's spends".
 * The category and the payment are whichever carried the most money — not
 * the single biggest item, which on a day of meals and rides says little.
 * The breakdown, with times, goes into the note. Income is never folded in;
 * it saves on its own.
 */
export const mergeDayIntoOne = (items: DayItem[], title = "Day's spends"): EntryForm | null => {
  const expenses = items.filter(foldsIntoTotal);
  if (expenses.length === 0) return null;
  const byCategory = largestBy(expenses, (item) => item.form.category || 'Misc');
  const byPayment = largestBy(expenses, (item) => paymentKey(item.form));
  const lead = byPayment ?? expenses[0];
  const total = expenses.reduce((sum, item) => sum + itemAmount(item), 0);
  const breakdown = expenses
    .map((item) => {
      const time = tileTimeLabel(item.form);
      const name = item.form.title.trim() || 'Expense';
      const amount = formatMoney(itemAmount(item), { sign: 'never' });
      return [time, `${name} ${amount}`, `(${paymentKey(item.form)})`].filter(Boolean).join(' ');
    })
    .join('\n');
  const latest = [...expenses]
    .map((item) => parseTimeOfDay(item.form.time))
    .filter((time): time is TimeOfDay => !!time)
    .sort((a, b) => b.hours * 60 + b.minutes - (a.hours * 60 + a.minutes))[0];
  return {
    ...lead.form,
    title,
    merchant: '',
    category: byCategory?.form.category || lead.form.category,
    amount: String(Math.round(total * 100) / 100),
    time: latest ? formTimeFor(latest) : lead.form.time,
    notes: breakdown,
    tag: '',
    eventId: undefined,
    attachment: null,
    // A split, a refund or a recurring payment belongs to one item, not the day.
    splitEnabled: false,
    splitParticipants: [],
    splitGroupId: null,
    splitGroupName: '',
    refundableAmount: '',
    refundExpectedOn: '',
    refundReminderEnabled: false,
    subscriptionEnabled: false,
  };
};

/**
 * "One per way paid" (P111): the same fold, once per payment, so a card's
 * balance still shows what went on it.
 */
export const mergeDayByPayment = (items: DayItem[]): EntryForm[] => {
  const ways = paymentWays(items);
  return ways
    .map((way) => {
      const group = items.filter((item) => foldsIntoTotal(item) && paymentKey(item.form) === way.label);
      return mergeDayIntoOne(group, `Day's spends · ${way.label}`);
    })
    .filter((form): form is EntryForm => !!form);
};

/** The chip for an item already in the ledger: "Already logged at 9:42 pm" (P113). */
export const alreadyLoggedLabel = (match: { dateLabel?: string | null; timeLabel?: string | null }) => {
  if (match.timeLabel) return `Already logged at ${match.timeLabel}`;
  if (match.dateLabel) return `Already logged on ${match.dateLabel}`;
  return 'Already logged';
};

/** The spoken words each row came from, located in the whole prompt (P107). */
export const phraseRanges = (
  sourceText: string,
  items: Pick<ParseBatchItem, 'source_text'>[]
): ({ start: number; end: number } | null)[] => {
  const haystack = sourceText.toLowerCase();
  let from = 0;
  return items.map((item) => {
    const phrase = item.source_text?.trim().toLowerCase();
    if (!phrase || phrase === haystack) return null;
    let start = haystack.indexOf(phrase, from);
    if (start < 0) start = haystack.indexOf(phrase);
    if (start < 0) return null;
    from = start + phrase.length;
    return { start, end: start + phrase.length };
  });
};

/** "7 saved · ₹1,430 out", the toast after Save all (P115). */
export const savedToastMessage = (count: number, out: number, income: number) => {
  const parts = [`${count} saved`];
  if (out > 0) parts.push(`${formatMoney(out, { sign: 'never' })} out`);
  else if (income > 0) parts.push(`${formatMoney(income, { sign: 'never' })} in`);
  return parts.join(' · ');
};

/** The batch's leftover words past ten, ready to send as typed text (P114). */
export const overCapPrompt = (batch: Pick<ParseBatch, 'over_cap_text'>) => batch.over_cap_text?.trim() || null;
