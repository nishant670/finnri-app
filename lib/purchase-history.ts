import { formatMinor, type BillingPayment } from './billing';
import { formatTime } from './datetime';

export type PaymentBadgeTone = 'positive' | 'accent' | 'neutral' | 'negative';

/** One purchase, worded for the history list. */
export type PaymentRow = {
  title: string;
  amount: string;
  /** The regular price, shown struck through, when an offer lowered it. */
  originalAmount: string | null;
  offerLabel: string | null;
  badge: { label: string; tone: PaymentBadgeTone };
  details: string[];
  reference: string | null;
};

const methodLabels: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  emi: 'EMI',
  paylater: 'Pay later',
};

const parse = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** "16 Sept 2026". History spans years, so the year is always there. */
export const formatHistoryDate = (value?: string | null) =>
  parse(value)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ??
  null;

/** "16 Sept 2026, 10:42 AM", on the app's clock convention. */
const formatHistoryMoment = (value?: string | null) => {
  const date = formatHistoryDate(value);
  if (!date) return null;
  const time = formatTime(parse(value));
  return time ? `${date}, ${time}` : date;
};

export const describePayment = (payment: BillingPayment, now: Date = new Date()): PaymentRow => {
  const original =
    payment.original_amount_minor && payment.original_amount_minor > payment.amount_minor
      ? formatMinor(payment.original_amount_minor, payment.currency)
      : null;
  const method = payment.method ? (methodLabels[payment.method] ?? payment.method) : null;
  const paidAt = formatHistoryMoment(payment.captured_at ?? payment.created_at);
  const paidLine = paidAt ? `Paid ${paidAt}${method ? ` · ${method}` : ''}` : null;

  const row = {
    title: payment.plan_name || 'Finnri pass',
    amount: formatMinor(payment.amount_minor, payment.currency),
    originalAmount: original,
    offerLabel: original ? payment.offer_label || null : null,
    reference: payment.reference || null,
  };

  if (payment.status === 'failed') {
    const triedAt = formatHistoryMoment(payment.created_at);
    return {
      ...row,
      badge: { label: 'Failed', tone: 'negative' },
      details: [
        triedAt ? `Tried ${triedAt}` : null,
        payment.failure_reason || 'The payment did not go through',
      ].filter((line): line is string => !!line),
    };
  }

  if (payment.status === 'refunded') {
    const refundedAt = formatHistoryDate(payment.refunded_at);
    return {
      ...row,
      badge: { label: 'Refunded', tone: 'neutral' },
      details: [paidLine, refundedAt ? `Refunded ${refundedAt}` : 'Refunded in full'].filter(
        (line): line is string => !!line
      ),
    };
  }

  // Captured. Where the period sits against today is the part people come
  // here to find out: is it running, queued behind another, or over.
  const start = parse(payment.period_start);
  const end = parse(payment.period_end);
  const badge: PaymentRow['badge'] =
    start && start > now
      ? { label: `Starts ${formatHistoryDate(payment.period_start)}`, tone: 'accent' }
      : end && end <= now
        ? { label: 'Expired', tone: 'neutral' }
        : { label: 'Active', tone: 'positive' };
  const validity =
    start && end
      ? `Valid ${formatHistoryDate(payment.period_start)} – ${formatHistoryDate(payment.period_end)}`
      : null;
  const partRefund =
    payment.amount_refunded_minor > 0
      ? `${formatMinor(payment.amount_refunded_minor, payment.currency)} refunded`
      : null;

  return {
    ...row,
    badge,
    details: [paidLine, validity, partRefund].filter((line): line is string => !!line),
  };
};
