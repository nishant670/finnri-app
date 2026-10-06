import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BillingStatus } from './billing';

/**
 * When Home may show the plans pop-up.
 *
 * The pop-up sells, so its timing decides whether it reads as help or as
 * nagging. The rules:
 *
 * - Never to guests: they cannot buy (checkout needs an account), and the
 *   credit card on Home already asks them to sign in.
 * - Only right after the user got something from Finnri — a saved entry —
 *   never on opening the app, which is when a pop-up feels like a toll.
 * - For a reason: credits are nearly gone, or the user has no plan.
 *   A paying user with plenty of credits never sees it.
 * - At most once a session, and after each dismissal it waits longer:
 *   3 days, then 6, 12, capped at 3 weeks. Low credits halve the wait,
 *   because then the pop-up is answering a real problem.
 */

export type PlansPromptReason = 'low_credits' | 'no_plan';

export type PlansPromptMemory = {
  lastShownAt?: number;
  dismissals: number;
};

/** Under this many credits, the next voice capture or two may not go through. */
export const LOW_CREDITS = 25;

const DAY = 24 * 60 * 60 * 1000;
const BASE_COOLDOWN = 3 * DAY;
const MAX_COOLDOWN = 21 * DAY;

const hasPaidPlan = (status: BillingStatus) =>
  status.subscription_status === 'active' || status.subscription_status === 'cancelled';

export const plansPromptReason = (status: BillingStatus): PlansPromptReason | null => {
  const credits = status.credits;
  const low =
    credits.total_credits_remaining < LOW_CREDITS ||
    (credits.daily_limit > 0 && credits.daily_credits_remaining <= 0);
  if (low) return 'low_credits';
  if (!hasPaidPlan(status)) return 'no_plan';
  return null;
};

export const plansPromptCooldown = (dismissals: number, reason: PlansPromptReason) => {
  const cooldown = Math.min(MAX_COOLDOWN, BASE_COOLDOWN * 2 ** Math.max(0, dismissals));
  return reason === 'low_credits' ? cooldown / 2 : cooldown;
};

export const shouldShowPlansPrompt = ({
  status,
  isGuest,
  shownThisSession,
  memory,
  now,
}: {
  status: BillingStatus | null;
  isGuest: boolean;
  shownThisSession: boolean;
  memory: PlansPromptMemory;
  now: number;
}): PlansPromptReason | null => {
  if (!status || isGuest || shownThisSession) return null;
  const reason = plansPromptReason(status);
  if (!reason) return null;
  if (
    memory.lastShownAt != null &&
    now - memory.lastShownAt < plansPromptCooldown(memory.dismissals, reason)
  ) {
    return null;
  }
  return reason;
};

const MEMORY_KEY = 'finnri_plans_prompt_memory';

export const readPlansPromptMemory = async (): Promise<PlansPromptMemory> => {
  try {
    const raw = await AsyncStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PlansPromptMemory>) : {};
    return {
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : undefined,
      dismissals: typeof parsed.dismissals === 'number' ? parsed.dismissals : 0,
    };
  } catch {
    return { dismissals: 0 };
  }
};

/** Records a showing; a dismissal also lengthens the next wait. */
export const recordPlansPrompt = async (
  outcome: 'shown' | 'dismissed' | 'chose_plan',
  now = Date.now()
) => {
  try {
    const memory = await readPlansPromptMemory();
    const next: PlansPromptMemory = {
      lastShownAt: now,
      dismissals:
        outcome === 'dismissed'
          ? memory.dismissals + 1
          : outcome === 'chose_plan'
            ? 0
            : memory.dismissals,
    };
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  } catch {
    // A pop-up's memory must never break Home.
  }
};
