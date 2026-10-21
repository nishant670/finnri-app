import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { normalizeAccountType } from './accounts';
import { formatTime } from './datetime';
import { formatDateLabel, parseDateLabel } from './transactions';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * The draft behind "Repeat for today": the same spend again, dated now.
 *
 * It is a different job from a quick prompt or a quick fill. Those are
 * shortcuts the user sets up, or the app ranks, *before* they need them, and
 * neither brings the amount. This one starts from a transaction the user is
 * looking at right now — yesterday's ₹20 e-rickshaw — and copies all of it.
 *
 * What carries over is what makes it the same spend: title, amount, type,
 * category, payment mode, account, merchant, tag and notes. What does not is
 * anything that belonged to the original as an *event*, because repeating
 * those would write something the user never asked for:
 *
 * - the receipt, which is a photo of the old bill;
 * - a split, which would put new debts on friends without asking them;
 * - a card EMI, which on a new entry means "turn this purchase into a fresh
 *   EMI plan" — the tag drops to General instead of starting a second loan;
 * - any subscription or loan-repeat setup, which the form only offers on a
 *   brand-new capture and which the original has already done once.
 *
 * A refundable entry stays refundable, with its due date moved by as many days
 * as the entry itself moved, so "back in a week" is still a week.
 */
export function buildRepeatForm(
  source: EntryForm,
  { now = new Date(), accountType }: { now?: Date; accountType?: string | null } = {}
): EntryForm {
  const today = startOfDay(now);
  const isCardEMI = source.tag === 'EMI' && normalizeAccountType(accountType) === 'credit_card';
  const tag = isCardEMI ? 'General' : source.tag;

  return {
    ...source,
    date: formatDateLabel(today),
    time: formatTime(now) ?? '',
    tag,
    attachment: null,
    splitEnabled: false,
    splitGroupId: null,
    splitGroupName: '',
    splitParticipants: [],
    ...(tag === 'Refundable'
      ? { refundExpectedOn: shiftRefundDate(source.refundExpectedOn, source.date, today) }
      : { refundableAmount: '', refundExpectedOn: '', refundReminderEnabled: true }),
    emiTenureMonths: '',
    emiRatePct: '',
    emiTotalInstalments: '',
    emiPaidInstalments: '',
    subscriptionEnabled: false,
    subscriptionName: '',
    subscriptionMerchant: '',
    subscriptionCategory: '',
    subscriptionAmount: '',
    subscriptionBillingInterval: '',
    subscriptionNextDueDate: '',
    subscriptionReminderDays: '3',
    subscriptionCancelBeforeDue: false,
    subscriptionCancelOnDate: '',
    subscriptionAutopay: false,
    subscriptionNotes: '',
  };
}

/**
 * The refund's due date, kept the same distance from the entry. Blank when
 * either date cannot be read, which makes the form ask rather than guess.
 */
function shiftRefundDate(expectedOn: string, entryDate: string, today: Date): string {
  const expected = parseDateLabel(expectedOn);
  const original = parseDateLabel(entryDate);
  if (!expected || !original) return '';
  // Rounded because a span across a DST change is 23 or 25 hours long.
  const days = Math.round((today.getTime() - startOfDay(original).getTime()) / DAY_MS);
  const shifted = startOfDay(expected);
  shifted.setDate(shifted.getDate() + days);
  return formatDateLabel(shifted);
}
