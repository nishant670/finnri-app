import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  describeAccess,
  fetchBillingPlans,
  fetchBillingStatus,
  type BillingPlan,
  type BillingStatus,
} from '@/lib/billing';
import {
  readPlansPromptMemory,
  recordPlansPrompt,
  shouldShowPlansPrompt,
  type BlockedAIReason,
  type PlansSheetReason,
} from '@/lib/plans-prompt';
import { CHECKOUT_LINK_ENABLED, IN_APP_PURCHASE_ENABLED } from '@/lib/purchase-policy';

/** Long enough for the save confirmation to land before anything new appears. */
const SETTLE_MS = 1500;

/**
 * Home's plans pop-up: when to open it, what it shows, where a choice goes.
 *
 * Home calls `considerAfterSave()` when an entry has just been saved — the
 * moment the user got something from Finnri. The hook waits for the screen to
 * settle, asks `shouldShowPlansPrompt` with fresh billing status, and opens the
 * sheet only if nothing else is on screen (`isBusy`). Choosing a plan opens the
 * Plans screen with that plan's checkout already starting.
 */
export function usePlansPrompt({
  token,
  isGuest,
  isBusy,
}: {
  token: string | null | undefined;
  isGuest: boolean;
  /** True while another sheet or prompt owns the screen. */
  isBusy: () => boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<PlansSheetReason>('no_plan');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const shownThisSession = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Whether the open sheet was Home's idea or the answer to a refused request.
   * Only Home's own prompts feed the cool-down: someone who hits a wall and
   * closes the offer has not told us they want to be asked less often.
   */
  const source = useRef<'after_save' | 'blocked'>('after_save');

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const considerAfterSave = useCallback(() => {
    // No way to buy from this build, nothing to offer.
    if (!token || isGuest || shownThisSession.current) return;
    if (!CHECKOUT_LINK_ENABLED && !IN_APP_PURCHASE_ENABLED) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const [freshStatus, memory] = await Promise.all([
            fetchBillingStatus(token),
            readPlansPromptMemory(),
          ]);
          const decided = shouldShowPlansPrompt({
            status: freshStatus,
            isGuest,
            shownThisSession: shownThisSession.current,
            memory,
            now: Date.now(),
          });
          if (!decided || isBusy()) return;
          const planList = await fetchBillingPlans();
          if (!planList.some((plan) => plan.checkout_enabled && (plan.price_minor ?? 0) > 0)) return;
          if (isBusy()) return;
          shownThisSession.current = true;
          source.current = 'after_save';
          setStatus(freshStatus);
          setPlans(planList);
          setReason(decided);
          setVisible(true);
          void recordPlansPrompt('shown');
        } catch {
          // A sales prompt that cannot load simply does not appear.
        }
      })();
    }, SETTLE_MS);
  }, [isBusy, isGuest, token]);

  /**
   * Opens the sheet now, because an AI request was just refused for credits —
   * the feedback that asked for this put it as "show the popup to purchase
   * the AI credits" at the moment it is needed, not days later after a save.
   *
   * Resolves false when there is nothing honest to offer, so the caller can
   * say something plainer instead: a guest (they sign in, they do not buy), a
   * build that cannot sell, or someone with a pass running — another one would
   * queue behind it and add nothing today.
   */
  const offerForBlockedAI = useCallback(
    async (blocked: BlockedAIReason): Promise<boolean> => {
      if (!token || isGuest) return false;
      if (!CHECKOUT_LINK_ENABLED && !IN_APP_PURCHASE_ENABLED) return false;
      try {
        const [freshStatus, planList] = await Promise.all([
          fetchBillingStatus(token),
          fetchBillingPlans(),
        ]);
        if (describeAccess(freshStatus).kind === 'pass') return false;
        if (!planList.some((plan) => plan.checkout_enabled && (plan.price_minor ?? 0) > 0)) {
          return false;
        }
        // One offer is enough; the post-save one must not follow it.
        if (timer.current) clearTimeout(timer.current);
        shownThisSession.current = true;
        source.current = 'blocked';
        setStatus(freshStatus);
        setPlans(planList);
        setReason(blocked);
        setVisible(true);
        return true;
      } catch {
        return false;
      }
    },
    [isGuest, token]
  );

  const dismiss = useCallback(() => {
    setVisible(false);
    if (source.current === 'after_save') void recordPlansPrompt('dismissed');
  }, []);

  const choose = useCallback(
    (plan: BillingPlan) => {
      setVisible(false);
      if (source.current === 'after_save') void recordPlansPrompt('chose_plan');
      router.push({ pathname: '/billing', params: { checkout: plan.code } });
    },
    [router]
  );

  return {
    considerAfterSave,
    offerForBlockedAI,
    sheet: { visible, plans, status, reason, onChoose: choose, onClose: dismiss },
  };
}
