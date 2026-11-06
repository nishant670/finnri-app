import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { NeutralTile, SettingsRow } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useHasPassed } from '@/hooks/use-has-passed';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import { CHECKOUT_LINK_ENABLED, IN_APP_PURCHASE_ENABLED } from '@/lib/purchase-policy';
import {
  createBillingCheckout,
  describeAccess,
  endedAccessLine,
  fetchBillingPlans,
  fetchBillingStatus,
  fetchCheckoutOrderStatus,
  formatCreditDate,
  formatMinor,
  formatPlanPrice,
  planOffer,
  requestLifetimeQuote,
  type BillingPlan,
  type BillingStatus,
  type PlanOffer,
} from '@/lib/billing';

const intervalLabels: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  lifetime_quote: 'Lifetime quote',
};

const featureLabels: Record<string, string> = {
  ai_text_capture: 'AI text capture',
  ai_voice_capture: 'Voice capture',
  advanced_insights: 'Advanced insights',
  weekly_review: 'Weekly review',
  budgets: 'Budgets',
  subscription_reminders: 'Subscription reminders',
  split_ledger: 'Split ledger',
  web_dashboard: 'Web dashboard',
  exports: 'Exports',
  bulk_edit: 'Bulk edit',
  future_ai_advisor: 'AI advisor',
};

/**
 * Whether the plan catalogue is worth drawing at all.
 *
 * True when there is any route to paying — an in-app purchase (off), or the
 * hosted checkout page opened in a browser (on). With neither, the screen
 * shows what the account already has and nothing else.
 */
const PLANS_VISIBLE = IN_APP_PURCHASE_ENABLED || CHECKOUT_LINK_ENABLED;

/**
 * How long to keep asking whether the payment landed, after the browser tab
 * has closed.
 *
 * The tab closing says nothing about whether money moved — only the signed
 * webhook does, and UPI in particular can take several seconds to settle. A
 * changed period end is the observable proof the webhook ran.
 */
const ACTIVATION_POLL_INTERVAL_MS = 2000;
const ACTIVATION_POLL_ATTEMPTS = 10;

const waitForActivation = async (token: string, periodEndBefore: string | null) => {
  for (let attempt = 0; attempt < ACTIVATION_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, ACTIVATION_POLL_INTERVAL_MS));
    try {
      const latest = await fetchBillingStatus(token);
      if (latest.current_period_end && latest.current_period_end !== periodEndBefore) {
        return true;
      }
    } catch {
      // A blip mid-poll is not an answer either way; keep asking.
    }
  }
  return false;
};

/**
 * Whether the order was actually paid, once the browser tab has closed.
 *
 * The webhook that flips an order to `captured` can arrive a beat after the
 * tab does, so a single read would call a real payment abandoned. A few short
 * reads cover that gap; staying at `created` past them means nobody paid, and
 * the quiet ending is the honest one.
 */
const PAYMENT_CHECK_INTERVAL_MS = 1500;
const PAYMENT_CHECK_ATTEMPTS = 4;

const waitForPaymentAttempt = async (orderId: string) => {
  for (let attempt = 0; attempt < PAYMENT_CHECK_ATTEMPTS; attempt += 1) {
    const status = await fetchCheckoutOrderStatus(orderId);
    if (status === 'captured') return true;
    // `failed` is a decision, not a gap: the provider has already said no, and
    // waiting longer cannot change it.
    if (status === 'failed') return false;
    if (attempt < PAYMENT_CHECK_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, PAYMENT_CHECK_INTERVAL_MS));
    }
  }
  return false;
};

const formatCount = (value?: number | null) => (value ?? 0).toLocaleString('en-IN');

export default function BillingScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const footerBottom = useBottomInset(20);
  const contentBottom = useBottomInset(32);
  const { token, user } = useAuthStore();
  const dialog = useAppDialog();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const isGuest = !!user?.is_guest;
  // Set when another screen (the Home plans pop-up) sends someone here having
  // already chosen a plan: checkout starts once, as if they had tapped it.
  const { checkout: checkoutParam } = useLocalSearchParams<{ checkout?: string }>();
  const startedCheckout = useRef(false);

  const loadBilling = useCallback(async () => {
    setIsLoading(true);
    try {
      // The catalogue is only rendered where the app may sell. Fetching it
      // otherwise costs a request on every visit to a screen that will not
      // show a single price.
      const [planList, billingStatus] = await Promise.all([
        PLANS_VISIBLE ? fetchBillingPlans() : Promise.resolve([]),
        token ? fetchBillingStatus(token) : Promise.resolve(null),
      ]);
      setPlans(planList);
      setStatus(billingStatus);
    } catch (error) {
      void dialog.alert({
        title: 'Billing did not load',
        message: getFriendlyErrorMessage(error, 'Please try again.'),
        tone: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  }, [dialog, token]);

  useFocusEffect(
    useCallback(() => {
      void loadBilling();
    }, [loadBilling])
  );

  const handlePlanPress = async (plan: BillingPlan) => {
    if (isGuest) {
      router.push('/auth?mode=link');
      return;
    }
    if (!token) return;
    if (plan.billing_interval === 'lifetime_quote') {
      if (!status?.lifetime_eligibility.eligible) {
        void dialog.alert({
          title: 'Lifetime quote unavailable',
          message: `Complete ${status?.lifetime_eligibility.required_paid_months ?? 3} paid months before requesting a lifetime quote.`,
        });
        return;
      }
      setBusyPlan(plan.code);
      try {
        await requestLifetimeQuote(token);
        void dialog.alert({
          title: 'Quote requested',
          message: 'Your 90-day AI usage summary is ready for review.',
          tone: 'success',
        });
      } catch (error) {
        void dialog.alert({
          title: 'Quote request failed',
          message: getFriendlyErrorMessage(error, 'Please try again.'),
          tone: 'danger',
        });
      } finally {
        setBusyPlan(null);
      }
      return;
    }

    setBusyPlan(plan.code);
    const periodEndBefore = status?.current_period_end ?? null;
    try {
      const order = await createBillingCheckout(token, plan.code);
      if (!order.checkout_url) {
        // The server has no web origin configured, so there is nowhere to send
        // anyone. Saying so beats opening a broken tab.
        void dialog.alert({
          title: 'Checkout not ready',
          message: 'Payments are not switched on yet. Please try again later.',
          tone: 'danger',
        });
        return;
      }

      // The payment is taken on a web page, never inside the app. This
      // resolves when the tab closes, which is the earliest moment worth
      // asking the server whether anything happened.
      await WebBrowser.openBrowserAsync(order.checkout_url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: 'done',
      });

      // Closing the tab says nothing about whether money moved. Ask the order
      // before saying anything: someone who read the price and came back was
      // being told their payment was still being confirmed, which invites them
      // to wait for something that is never coming — or to pay twice.
      const paid = await waitForPaymentAttempt(order.order_id);
      if (!paid) {
        await loadBilling();
        return;
      }

      const activated = await waitForActivation(token, periodEndBefore);
      await loadBilling();
      void dialog.alert(
        activated
          ? {
              title: 'You are on ' + plan.name,
              message: 'Your credits are available now.',
              tone: 'success',
            }
          : {
              // Not a failure. A UPI collect request can settle minutes after
              // the tab has closed, and telling someone it failed is how they
              // end up paying twice.
              title: 'Confirming your payment',
              message:
                'Your bank is still confirming it. Your plan appears here on its own once it lands — you do not need to pay again.',
            }
      );
    } catch (error) {
      void dialog.alert({
        title: 'Checkout not ready',
        message: getFriendlyErrorMessage(error, 'Please try again.'),
        tone: 'danger',
      });
    } finally {
      setBusyPlan(null);
    }
  };

  useEffect(() => {
    if (!checkoutParam || startedCheckout.current || isLoading || plans.length === 0) return;
    const chosen = plans.find((plan) => plan.code === checkoutParam);
    if (!chosen) return;
    startedCheckout.current = true;
    void handlePlanPress(chosen);
    // handlePlanPress is recreated every render; the ref makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutParam, isLoading, plans]);

  const launchOffer = status?.launch_offer?.active
    ? status.launch_offer
    : !status
      ? plans.find((plan) => plan.offer)?.offer
      : null;
  const offerIsYours = !status || !!status.launch_offer?.eligible;

  const periodEnd = formatCreditDate(status?.current_period_end);
  const resetAt = formatCreditDate(status?.credits.reset_at);
  const trialExpiry = formatCreditDate(status?.credits.trial_expires_at);
  // Read so the screen redraws the moment the trial runs out.
  useHasPassed(status?.credits.trial_expires_at);
  const access = describeAccess(status);
  // "Free trial" stops being the current access the day it runs out. Leaving
  // the name as-is under a heading that says CURRENT ACCESS tells someone they
  // still have something they do not.
  const currentPlanName =
    access.kind === 'pass'
      ? access.planName
      : access.kind === 'trial' || (isGuest && access.kind === 'none')
        ? 'Free trial'
        : 'No active plan';
  const subscriptionCopy =
    access.kind === 'pass'
      ? periodEnd
        ? access.cancelled
          ? `Access remains until ${periodEnd}`
          : // A pass is one payment for a fixed span. "Renews or ends" left
            // people wondering whether they would be charged again; nothing
            // renews on its own.
            `Active until ${periodEnd} · it won't renew on its own`
        : 'Active now'
      : isGuest
        ? 'Guest credits stay on this device'
        : access.kind === 'trial'
          ? `Trial expires ${trialExpiry}`
          : access.kind === 'ended'
            ? `${access.ended.kind === 'pass' ? 'Your ' : ''}${endedAccessLine(access.ended)} — choose a pass to carry on`
            : 'No active paid plan';

  const recommendedPlanCode = useMemo(() => {
    const paidPlans = plans.filter((plan) => plan.billing_interval !== 'lifetime_quote');
    return (
      paidPlans.find((plan) => plan.billing_interval === 'monthly')?.code ??
      paidPlans[0]?.code ??
      null
    );
  }, [plans]);

  const dailyUsagePercent =
    status?.credits.daily_limit && status.credits.daily_limit > 0
      ? Math.min(1, status.credits.daily_credits_used / status.credits.daily_limit)
      : 0;

  const passes = plans.filter((plan) => plan.billing_interval !== 'lifetime_quote');
  const lifetimePlan = plans.find((plan) => plan.billing_interval === 'lifetime_quote') ?? null;
  // One pass is chosen at a time and paid for from the foot of the screen
  // (board R8-Plans); it starts on the recommended one.
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selectedPlan =
    passes.find((plan) => plan.code === (selectedCode ?? recommendedPlanCode)) ?? passes[0] ?? null;
  const selectedOffer = selectedPlan ? planOffer(selectedPlan, status) : null;
  const selectedIsCurrent = !!selectedPlan && status?.plan?.code === selectedPlan.code;
  const actionLabel = !selectedPlan
    ? ''
    : isGuest
      ? 'Create account'
      : selectedIsCurrent
        ? 'Current plan'
        : selectedPlan.checkout_enabled
          ? // Names what the tap does. The payment is taken on a web page, and
            // a button saying "Subscribe" that opens a browser is a small
            // dishonesty people notice.
            selectedOffer
            ? `Continue to pay ${formatMinor(selectedOffer.price_minor, selectedPlan.currency)}`
            : 'Continue to payment'
          : 'Notify me';

  const dailyLimit = status?.credits.daily_limit ?? 0;
  const usedUp = dailyLimit > 0 && (status?.credits.daily_credits_remaining ?? 0) <= 0;
  const accessTag =
    access.kind === 'pass' && periodEnd
      ? `Until ${periodEnd}`
      : access.kind === 'trial' && trialExpiry
        ? `Ends ${trialExpiry}`
        : null;
  const dailyLine =
    access.kind === 'ended'
      ? null
      : usedUp
        ? `Today’s AI credits are used up. You get ${formatCount(dailyLimit)} again ${resetAt || 'tomorrow'}.`
        : resetAt
          ? `Resets ${resetAt}`
          : 'Resets daily';
  const lifetimeEligible = status?.lifetime_eligibility.eligible ?? false;
  const features = (selectedPlan?.feature_gates ?? []).map((feature) => featureLabels[feature] ?? feature);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Plans & credits" onBack={() => router.back()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          // The footer clears the nav bar when it shows; without it the list does.
          !(PLANS_VISIBLE && selectedPlan) && { paddingBottom: contentBottom },
        ]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.access}>
            <View style={styles.accessHead}>
              <ThemedText numberOfLines={1} style={[styles.accessName, { color: colors.text }]}>
                {currentPlanName}
              </ThemedText>
              {accessTag ? <Tag label={accessTag} /> : null}
            </View>
            <View style={styles.figureLine}>
              <ThemedText style={[styles.figure, { color: colors.text }]}>
                {formatCount(status?.credits.total_credits_remaining)}
              </ThemedText>
              <ThemedText tone="muted" style={styles.figureUnit}>
                credits left
              </ThemedText>
            </View>
            {/* The tag already says when the trial or pass ends. */}
            {accessTag ? null : (
              <ThemedText tone="muted" style={styles.caption}>
                {subscriptionCopy}
              </ThemedText>
            )}
            {dailyLimit > 0 ? (
              <>
                <View style={styles.todayLine}>
                  <ThemedText style={[styles.todayLabel, { color: colors.text }]}>Today</ThemedText>
                  <ThemedText tone="muted" style={styles.small}>
                    {formatCount(status?.credits.daily_credits_used)} of {formatCount(dailyLimit)} used
                  </ThemedText>
                </View>
                <View style={[styles.bar, { backgroundColor: colors.track }]}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${dailyUsagePercent * 100}%`, backgroundColor: usedUp ? colors.warning : colors.accent },
                    ]}
                  />
                </View>
                {/* Nothing refills once the trial is over and no pass is held. */}
                {dailyLine ? (
                  <ThemedText tone="muted" style={[styles.caption, styles.dailyLine]}>
                    {dailyLine}
                  </ThemedText>
                ) : null}
              </>
            ) : null}
          </View>
          {!isGuest && token ? (
            <SettingsRow
              testID="purchase-history-link"
              icon="receipt-text-outline"
              title="Purchase history"
              subtitle="Passes you bought, payments and refunds"
              onPress={() => router.push('/purchase-history')}
              divider
            />
          ) : null}
          <SettingsRow
            icon="creation"
            title="AI usage"
            subtitle="What each AI action used"
            onPress={() => router.push('/ai-usage')}
            divider
          />
        </View>

        {isGuest ? (
          <NoteCard
            icon="account-arrow-up-outline"
            title="Create an account to keep your plan"
            body="A plan is tied to your profile, not a temporary guest device."
          />
        ) : null}

        {PLANS_VISIBLE ? (
          <>
            {launchOffer ? (
              <NoteCard
                testID="launch-offer-banner"
                icon="tag-outline"
                warning
                title={`Launch offer: ${launchOffer.percent_off}% off every pass`}
                body={
                  !offerIsYours
                    ? 'You have already used the launch price — thanks for being early.'
                    : launchOffer.spots_left != null
                      ? `For a limited time · only ${launchOffer.spots_left} launch spot${launchOffer.spots_left === 1 ? '' : 's'} left`
                      : 'Once per account, for a limited time.'
                }
              />
            ) : null}

            <View style={styles.heading}>
              <ThemedText accessibilityRole="header" style={[styles.headingTitle, { color: colors.text }]}>
                Choose a pass
              </ThemedText>
              <ThemedText tone="muted" style={styles.caption}>
                Manual tracking is always free. Credits are used only when Finnri AI reads your text, voice or a bill.
              </ThemedText>
            </View>

            {isLoading && plans.length === 0 ? (
              <SkeletonFrame label="Loading plans" testID="billing-skeleton">
                <SkeletonCards count={3} lines={2} radius={16} />
              </SkeletonFrame>
            ) : (
              <>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Passes"
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {passes.map((plan, index) => (
                    <PassRow
                      key={plan.code}
                      plan={plan}
                      offer={planOffer(plan, status)}
                      selected={plan.code === selectedPlan?.code}
                      recommended={plan.code === recommendedPlanCode}
                      current={status?.plan?.code === plan.code}
                      divider={index > 0}
                      disabled={busyPlan !== null}
                      onSelect={() => setSelectedCode(plan.code)}
                    />
                  ))}
                </View>

                {lifetimePlan ? (
                  <PressableView
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !lifetimeEligible || busyPlan !== null }}
                    disabled={!lifetimeEligible || busyPlan !== null}
                    onPress={() => void handlePlanPress(lifetimePlan)}
                    style={[styles.lifetime, { borderColor: colors.borderStrong }]}
                    pressedStyle={styles.pressed}>
                    <NeutralTile icon="infinity" />
                    <View style={styles.flexText}>
                      <ThemedText style={[styles.rowTitle, { color: colors.text }]}>Lifetime</ThemedText>
                      <ThemedText tone="muted" style={styles.small}>
                        Ask for a quote after {lifetimePlan.requires_prior_paid_months || 3} paid months
                      </ThemedText>
                    </View>
                    {busyPlan === lifetimePlan.code ? (
                      <ActivityIndicator color={colors.muted} />
                    ) : lifetimeEligible ? (
                      <ThemedText style={[styles.rowTitle, styles.bold, { color: colors.text }]}>Request quote</ThemedText>
                    ) : (
                      <ThemedText tone="muted" style={[styles.small, styles.bold]}>
                        {status?.lifetime_eligibility.paid_months_completed ?? 0} of{' '}
                        {lifetimePlan.requires_prior_paid_months || status?.lifetime_eligibility.required_paid_months || 3}
                      </ThemedText>
                    )}
                  </PressableView>
                ) : null}

                {features.length > 0 ? (
                  <View style={[styles.card, styles.includes, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <ThemedText style={[styles.includesTitle, { color: colors.text }]}>Every pass includes</ThemedText>
                    <View style={styles.featureGrid}>
                      {features.map((feature) => (
                        <View key={feature} style={styles.feature}>
                          <MaterialCommunityIcons name="check" size={16} color={colors.positive} />
                          <ThemedText style={[styles.small, { color: colors.text, flexShrink: 1 }]}>{feature}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            )}

            {CHECKOUT_LINK_ENABLED && !IN_APP_PURCHASE_ENABLED ? (
              <ThemedText tone="muted" style={styles.caption}>
                Payment opens in your browser and is handled by Razorpay. Your pass starts as soon as it clears and never renews on its own.
              </ThemedText>
            ) : null}
          </>
        ) : (
          <NoteCard
            icon="information-outline"
            title="Managed on your account"
            body="Plan changes are not available in this version of the app. Everything above is what your account has right now."
          />
        )}
      </ScrollView>

      {PLANS_VISIBLE && selectedPlan ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: footerBottom },
          ]}>
          <PrimaryButton
            testID="plans-continue"
            label={busyPlan === selectedPlan.code ? 'Opening payment…' : actionLabel}
            loading={busyPlan === selectedPlan.code}
            disabled={busyPlan !== null || (selectedIsCurrent && !isGuest)}
            onPress={() => void handlePlanPress(selectedPlan)}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const periodLabels: Record<string, string> = {
  weekly: 'a week',
  monthly: 'a month',
  quarterly: 'a quarter',
  yearly: 'a year',
};

/** One pass in the list: a radio, its name and tags, its credits, and its price. */
function PassRow({
  plan,
  offer,
  selected,
  recommended,
  current,
  divider,
  disabled,
  onSelect,
}: {
  plan: BillingPlan;
  offer: PlanOffer | null;
  selected: boolean;
  recommended: boolean;
  current: boolean;
  divider: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { colors } = useThemeTokens();
  const daily = plan.daily_credit_limit > 0 ? `${formatCount(plan.daily_credit_limit)} a day` : 'custom daily cap';
  return (
    <PressableView
      testID={`plan-row-${plan.code}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={plan.name}
      disabled={disabled}
      onPress={() => {
        haptics.select();
        onSelect();
      }}
      style={[
        styles.passRow,
        divider && { borderTopWidth: 1, borderTopColor: colors.border },
        selected && { backgroundColor: colors.selectedFill },
      ]}
      pressedStyle={styles.pressed}>
      <View style={[styles.radio, { borderColor: selected ? colors.text : colors.borderStrong }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: colors.text }]} /> : null}
      </View>
      <View style={styles.flexText}>
        <View style={styles.passName}>
          <ThemedText style={[styles.rowTitle, { color: colors.text, fontWeight: selected ? '700' : '600' }]}>
            {plan.name}
          </ThemedText>
          {recommended ? <Tag label="Smart pick" /> : null}
          {current ? <Tag label="Active" tone="positive" /> : null}
        </View>
        <ThemedText tone="muted" style={styles.small}>
          {formatCount(plan.included_credits)} credits · {daily}
        </ThemedText>
      </View>
      <View style={styles.price}>
        <View style={styles.priceLine}>
          {offer ? (
            <ThemedText
              testID={`plan-original-price-${plan.code}`}
              tone="muted"
              style={[styles.small, styles.struck]}>
              {formatMinor(offer.original_price_minor, plan.currency)}
            </ThemedText>
          ) : null}
          <ThemedText
            testID={offer ? `plan-offer-price-${plan.code}` : undefined}
            numberOfLines={1}
            style={[styles.priceValue, { color: colors.text }]}>
            {offer ? formatMinor(offer.price_minor, plan.currency) : formatPlanPrice(plan)}
          </ThemedText>
        </View>
        <ThemedText tone="muted" style={styles.small}>
          {periodLabels[plan.billing_interval] ?? intervalLabels[plan.billing_interval] ?? plan.billing_interval}
        </ThemedText>
      </View>
    </PressableView>
  );
}

function Tag({ label, tone = 'default' }: { label: string; tone?: 'default' | 'positive' }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.tag, { backgroundColor: colors.track }]}>
      <ThemedText style={[styles.tagLabel, { color: tone === 'positive' ? colors.positive : colors.text }]}>
        {label}
      </ThemedText>
    </View>
  );
}

/** A one-line card with a tile: the launch offer, a guest note, a policy note. */
function NoteCard({
  icon,
  title,
  body,
  warning = false,
  testID,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  warning?: boolean;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <View testID={testID} style={[styles.card, styles.note, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {warning ? (
        <View style={[styles.noteTile, { backgroundColor: colors.warningSurface }]}>
          <MaterialCommunityIcons name={icon} size={18} color={colors.warning} />
        </View>
      ) : (
        <NeutralTile icon={icon} />
      )}
      <View style={styles.flexText}>
        <ThemedText style={[styles.noteTitle, { color: colors.text }]}>{title}</ThemedText>
        <ThemedText tone="muted" style={styles.small}>
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  access: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  accessHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  accessName: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  figureLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 8,
  },
  figure: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  figureUnit: {
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  small: {
    fontSize: 12,
    lineHeight: 16,
  },
  todayLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  todayLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  bar: {
    height: 8,
    marginTop: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  dailyLine: {
    marginTop: 6,
  },
  heading: {
    gap: 4,
    marginTop: 12,
  },
  headingTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  passRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  passName: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '600',
  },
  price: {
    alignItems: 'flex-end',
    gap: 2,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  priceValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tag: {
    height: 20,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  tagLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  lifetime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  includes: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  includesTitle: {
    marginBottom: 10,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  feature: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noteTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
