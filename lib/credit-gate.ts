import type { BillingStatus } from '@/lib/billing';
import { ParseApiError } from '@/lib/parse';
import type { BlockedAIReason } from '@/lib/plans-prompt';

export type CreditGate = {
  title: string;
  message: string;
  actionLabel: string;
  action: 'upgrade' | 'login';
  /** Which wall it is, for the plans sheet that offers a way past it. */
  reason: BlockedAIReason;
};

/** The three ways an expense reaches the AI, each with its own price. */
export type CaptureKind = 'text' | 'voice' | 'receipt';

/**
 * What each capture costs when the billing status does not say — an API from
 * before it did. Voice is the shortest clip's price; the server still decides.
 */
const FALLBACK_CAPTURE_CREDITS: Record<CaptureKind, number> = {
  text: 5,
  voice: 12,
  receipt: 25,
};

const CAPTURE_NAME: Record<CaptureKind, string> = {
  text: 'A typed entry',
  voice: 'A voice entry',
  receipt: 'A bill scan',
};

export const captureCreditsFor = (
  status: Pick<BillingStatus, 'credits'> | null,
  kind: CaptureKind
): number => status?.credits.capture_credits?.[kind] || FALLBACK_CAPTURE_CREDITS[kind];

/**
 * Whether a failed AI request was refused for credits, and which way: the
 * balance is gone, or today's share of it is. Anything else is null.
 */
export const blockedAIReason = (error: unknown): BlockedAIReason | null => {
  if (!(error instanceof ParseApiError)) return null;
  if (error.code === 'insufficient_ai_credits') return 'out_of_credits';
  if (error.code === 'daily_ai_limit_reached') return 'daily_limit';
  return null;
};

/**
 * What to say when a capture costs more than is left, today or in total.
 *
 * It names the price and what is left, because "you have used all 15 credits
 * for today" to a guest who had used none — the scan simply cost 25 — reads as
 * the app being wrong. A guest is pointed at sign-in, the only way they can buy.
 */
export const creditShortfall = ({
  kind,
  required,
  available,
  scope,
  dailyLimit,
  isGuest,
}: {
  kind?: CaptureKind;
  required: number;
  available: number;
  /** `today`: the daily allowance is short; `balance`: the credits themselves are. */
  scope: 'today' | 'balance';
  dailyLimit?: number;
  isGuest: boolean;
}): CreditGate => {
  const name = kind ? CAPTURE_NAME[kind] : 'This capture';
  const spent = available <= 0;
  const action = isGuest ? ('login' as const) : ('upgrade' as const);
  const actionLabel = isGuest ? 'Sign in for more credits' : 'View plans';

  if (scope === 'today') {
    const lead = !spent
      ? `${name} needs ${required} credits and you have ${available} left today.`
      : dailyLimit
        ? `You have used all ${dailyLimit} AI credits for today.`
        : "You have used all of today's AI credits.";
    const way = isGuest
      ? 'Sign in to buy a pass with more credits a day — everything you have added so far comes with you.'
      : 'Get a pass for more credits a day, add it by hand for free, or come back tomorrow.';
    return {
      title: spent ? "Today's AI credits are used up" : 'Not enough AI credits left today',
      message: `${lead} ${way}`,
      actionLabel,
      action,
      reason: 'daily_limit',
    };
  }

  const lead = spent ? '' : `${name} needs ${required} credits and you have ${available} left. `;
  return isGuest
    ? {
        title: spent ? 'You have used up your guest AI credits' : 'Not enough guest AI credits',
        message: `${lead}Sign in for more credits — everything you have added so far comes with you.`,
        actionLabel,
        action,
        reason: 'out_of_credits',
      }
    : {
        title: spent ? 'Out of AI credits' : 'AI credits are low',
        message: `${lead}Get a pass to keep using AI. Manual entry stays free and unlimited.`,
        actionLabel,
        action,
        reason: 'out_of_credits',
      };
};

/**
 * Whether an AI capture can be paid for, and what to say when it cannot.
 *
 * The refusal used to arrive from the server, after the recording or the
 * photo: hold the mic, speak the expense, press Process, and only then hear
 * there were no credits. The work is discarded and the person has performed
 * for nothing. The same sentence costs them nothing if it arrives before they
 * start, so the decision has to be makeable on what the app already knows —
 * including the capture's price, since a bill scan costs five typed entries.
 *
 * `null` means go ahead — including while the billing status is still loading,
 * because an unknown must not lock the microphone on a funded account. The
 * server remains the authority: this only avoids the obviously wasted trip.
 */
export const creditGateFor = (
  status: Pick<BillingStatus, 'credits'> | null,
  options: { isGuest: boolean; kind: CaptureKind }
): CreditGate | null => {
  if (!status) return null;

  const required = captureCreditsFor(status, options.kind);
  const dailyLimit = status.credits.daily_limit ?? 0;
  const dailyRemaining = status.credits.daily_credits_remaining ?? 0;
  const totalRemaining = status.credits.total_credits_remaining ?? 0;

  // A balance that cannot cover it is checked first: waiting for tomorrow's
  // allowance would not help. A short day is a different problem — the
  // credits are there, they just cannot all be spent today.
  if (totalRemaining < required) {
    return creditShortfall({
      kind: options.kind,
      required,
      available: totalRemaining,
      scope: 'balance',
      isGuest: options.isGuest,
    });
  }
  if (dailyLimit > 0 && dailyRemaining < required) {
    return creditShortfall({
      kind: options.kind,
      required,
      available: dailyRemaining,
      scope: 'today',
      dailyLimit,
      isGuest: options.isGuest,
    });
  }
  return null;
};

/**
 * What a refused capture needed, and what there was at the time.
 *
 * Home's "Out of AI credits" card is a snapshot of a refusal, so it used to
 * stay up after the balance came back — a gifted pass landed, the footnote
 * under the card read "3600 total credits left", and the card still said the
 * credits were gone until the app was restarted.
 */
export type CreditBlock = {
  requiredCredits: number;
  /** The balance when it was refused, or null if it wasn't known yet. */
  creditsWhenBlocked: { total: number; daily: number } | null;
};

export const creditBlockFor = (
  status: Pick<BillingStatus, 'credits'> | null,
  requiredCredits: number
): CreditBlock => ({
  requiredCredits,
  creditsWhenBlocked: status
    ? {
        total: status.credits.total_credits_remaining ?? 0,
        daily: status.credits.daily_credits_remaining ?? 0,
      }
    : null,
});

/**
 * Whether a refused capture could go ahead now, so its card can step aside.
 *
 * Two things must both be true: credits came in since the refusal, and they
 * now cover what was refused. "Covers" alone is not enough — a long voice clip
 * costs more than the shortest-clip price the app knows about, so a balance
 * the app thinks is enough can still be refused, and the card must not vanish
 * while nothing has changed.
 */
export const creditBlockLifted = (
  block: CreditBlock,
  status: Pick<BillingStatus, 'credits'> | null
): boolean => {
  if (!status) return false;
  const total = status.credits.total_credits_remaining ?? 0;
  const daily = status.credits.daily_credits_remaining ?? 0;
  const dailyLimit = status.credits.daily_limit ?? 0;
  const before = block.creditsWhenBlocked;
  const gained = !before || total > before.total || daily > before.daily;
  const covers = total >= block.requiredCredits && (dailyLimit <= 0 || daily >= block.requiredCredits);
  return gained && covers;
};
