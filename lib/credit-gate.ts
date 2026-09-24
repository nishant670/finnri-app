import type { BillingStatus } from '@/lib/billing';

export type CreditGate = {
  title: string;
  message: string;
  actionLabel: string;
  action: 'upgrade' | 'login';
};

/**
 * Whether an AI capture can be paid for, and what to say when it cannot.
 *
 * The refusal used to arrive from the server, after the recording: hold the
 * mic, speak the expense, press Process, and only then hear there were no
 * credits. The work is discarded and the person has performed for nothing. The
 * same sentence costs them nothing if it arrives before they speak, so the
 * decision has to be makeable on what the app already knows.
 *
 * `null` means go ahead — including while the billing status is still loading,
 * because an unknown must not lock the microphone on a funded account. The
 * server remains the authority: this only avoids the obviously wasted trip.
 */
export const creditGateFor = (
  status: Pick<BillingStatus, 'credits'> | null,
  options: { isGuest: boolean }
): CreditGate | null => {
  if (!status) return null;

  const dailyLimit = status.credits.daily_limit ?? 0;
  const dailyRemaining = status.credits.daily_credits_remaining ?? 0;
  const totalRemaining = status.credits.total_credits_remaining ?? 0;

  const dailyCapReached = dailyLimit > 0 && dailyRemaining <= 0;
  const balanceGone = totalRemaining <= 0;
  if (!dailyCapReached && !balanceGone) return null;

  // A cap that resets tomorrow is a different problem from a balance that is
  // gone. Telling someone to buy a plan when they only have to wait until
  // morning is the wrong advice, and they can still add the expense by hand.
  if (dailyCapReached && !balanceGone) {
    return {
      title: "Today's AI credits are used up",
      message: `You have used all ${dailyLimit} AI credits for today. Type or add the expense manually, or come back tomorrow.`,
      actionLabel: options.isGuest ? 'Sign in for more credits' : 'View plans',
      action: options.isGuest ? 'login' : 'upgrade',
    };
  }

  return options.isGuest
    ? {
        title: 'You have used up your guest AI credits',
        message:
          'Sign in to keep capturing by voice and text — everything you have added so far comes with you.',
        actionLabel: 'Sign in for more credits',
        action: 'login',
      }
    : {
        title: 'Out of AI credits',
        message: 'Voice and text capture need credits. Manual entry stays free and unlimited.',
        actionLabel: 'View plans',
        action: 'upgrade',
      };
};
