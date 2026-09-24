import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useHasPassed } from '@/hooks/use-has-passed';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { CHECKOUT_LINK_ENABLED, IN_APP_PURCHASE_ENABLED } from '@/lib/purchase-policy';
import {
  createBillingCheckout,
  fetchBillingPlans,
  fetchBillingStatus,
  formatCreditDate,
  formatPlanPrice,
  requestLifetimeQuote,
  type BillingPlan,
  type BillingStatus,
} from '@/lib/billing';

const intervalLabels: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  lifetime_quote: 'Lifetime quote',
};

const planAccents = ['#FF8865', '#17A978', '#2F80ED', '#8B5CF6', '#C2185B'];

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

const formatCount = (value?: number | null) => (value ?? 0).toLocaleString('en-IN');

const planSubtitle = (plan: BillingPlan) => {
  if (plan.billing_interval === 'lifetime_quote') {
    return `Quote after ${plan.requires_prior_paid_months || 3} paid months`;
  }
  if (plan.checkout_enabled) return 'Ready to subscribe';
  return 'Checkout coming soon';
};

const planIcon = (plan: BillingPlan): keyof typeof MaterialCommunityIcons.glyphMap => {
  if (plan.billing_interval === 'lifetime_quote') return 'infinity';
  if (plan.billing_interval === 'yearly') return 'calendar-star';
  if (plan.billing_interval === 'quarterly') return 'calendar-range';
  if (plan.billing_interval === 'weekly') return 'calendar-week';
  return 'creation';
};

const topFeatures = (plan: BillingPlan) => {
  const labels = plan.feature_gates.map((feature) => featureLabels[feature] ?? feature);
  return labels.slice(0, 4);
};

export default function BillingScreen() {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const router = useRouter();
  const { token, user } = useAuthStore();
  const dialog = useAppDialog();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const isGuest = !!user?.is_guest;

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

  const periodEnd = formatCreditDate(status?.current_period_end);
  const resetAt = formatCreditDate(status?.credits.reset_at);
  const trialExpiry = formatCreditDate(status?.credits.trial_expires_at);
  const trialHasExpired = useHasPassed(status?.credits.trial_expires_at);
  const hasPaidPlan = status?.subscription_status === 'active' || status?.subscription_status === 'cancelled';
  // "Free trial" stops being the current access the day it runs out. Leaving
  // the name as-is under a heading that says CURRENT ACCESS tells someone they
  // still have something they do not.
  const currentPlanName = status?.plan?.name ?? (trialHasExpired && !hasPaidPlan ? 'No active plan' : 'Free trial');
  const subscriptionCopy =
    status?.subscription_status === 'active' && periodEnd
      ? `Renews or ends ${periodEnd}`
      : status?.subscription_status === 'cancelled' && periodEnd
        ? `Access remains until ${periodEnd}`
        : isGuest
          ? 'Guest credits stay on this device'
          : trialExpiry
            ? trialHasExpired
              ? `Free trial ended ${trialExpiry} — choose a pass to carry on`
              : `Trial expires ${trialExpiry}`
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}>
      <AppHeader title="Plans & Credits" onBack={() => router.back()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 44, gap: theme.spacing.lg }}>
        <View
          style={{
            borderRadius: 28,
            overflow: 'hidden',
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 1,
          }}>
          <View
            style={{
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
              backgroundColor: colors.secondary,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View
                style={{
                  height: 52,
                  width: 52,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.accent,
                }}>
                <MaterialCommunityIcons name="creation" size={26} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText
                  variant="captionStrong"
                  style={{ color: colors.accent, textTransform: 'uppercase' }}>
                  Current access
                </ThemedText>
                <ThemedText
                  numberOfLines={1}
                  style={{
                    color: colors.text,
                    fontFamily: Fonts.title,
                    fontSize: 24,
                    fontWeight: '900',
                    lineHeight: 30,
                  }}>
                  {currentPlanName}
                </ThemedText>
                <ThemedText style={{ color: `${colors.text}A8` }}>{subscriptionCopy}</ThemedText>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <MetricPill
                label="Credits left"
                value={formatCount(status?.credits.total_credits_remaining)}
                icon="wallet-outline"
              />
              <MetricPill
                label="Daily left"
                value={formatCount(status?.credits.daily_credits_remaining)}
                icon="speedometer"
              />
            </View>
          </View>

          <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#F1E6E8',
              }}>
              <View
                style={{
                  height: '100%',
                  width: `${dailyUsagePercent * 100}%`,
                  borderRadius: 4,
                  backgroundColor: colors.accent,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
                {formatCount(status?.credits.daily_credits_used)} used today
              </ThemedText>
              <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
                {resetAt ? `Resets ${resetAt}` : 'Daily reset'}
              </ThemedText>
            </View>
          </View>
        </View>

        {isGuest ? (
          <Card compact style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <MaterialCommunityIcons name="account-arrow-up-outline" size={22} color="#2F80ED" />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ color: colors.text, fontFamily: Fonts.title, fontWeight: '800' }}>
                  Create an account to keep your plan
                </ThemedText>
                <ThemedText style={{ color: `${colors.text}99` }}>
                  A plan is tied to your profile, not a temporary guest device.
                </ThemedText>
              </View>
            </View>
          </Card>
        ) : null}

        {PLANS_VISIBLE ? (
          <>
          <View style={{ gap: theme.spacing.sm }}>
            <ThemedText
              style={{
                color: colors.text,
                fontFamily: Fonts.title,
                fontSize: 18,
                fontWeight: '900',
              }}>
              Choose your AI budget
            </ThemedText>
            <ThemedText style={{ color: `${colors.text}99` }}>
              Every plan includes manual tracking. Credits are only used when Finnri AI processes text
              or voice capture.
            </ThemedText>
            {CHECKOUT_LINK_ENABLED && !IN_APP_PURCHASE_ENABLED ? (
              <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
                Payment opens in your browser and is handled by Razorpay. Your plan appears here as
                soon as it clears.
              </ThemedText>
            ) : null}
          </View>

          {isLoading ? (
            <SkeletonFrame label="Loading plans" testID="billing-skeleton">
              <SkeletonCards count={3} lines={3} radius={22} />
            </SkeletonFrame>
          ) : (
            plans.map((plan, index) => {
              const isLifetime = plan.billing_interval === 'lifetime_quote';
              const lifetimeEligible = status?.lifetime_eligibility.eligible ?? false;
              const isCurrent = status?.plan?.code === plan.code;
              const isRecommended = plan.code === recommendedPlanCode;
              const disabled = busyPlan !== null || (isLifetime && !lifetimeEligible);
              const accent = planAccents[index % planAccents.length];
              const actionLabel = isGuest
                ? 'Create account'
                : isCurrent
                  ? 'Current plan'
                  : isLifetime
                    ? lifetimeEligible
                      ? 'Request quote'
                      : `${status?.lifetime_eligibility.paid_months_completed ?? 0}/${plan.requires_prior_paid_months} months`
                    : plan.checkout_enabled
                      // Names what the tap does. The payment is taken on a web
                      // page, and a button saying "Subscribe" that opens a
                      // browser is a small dishonesty people notice.
                      ? 'Continue to payment'
                      : 'Notify me';
              return (
                <PlanCard
                  key={plan.code}
                  plan={plan}
                  accent={accent}
                  actionLabel={actionLabel}
                  busy={busyPlan === plan.code}
                  disabled={disabled || isCurrent}
                  isCurrent={isCurrent}
                  isRecommended={isRecommended}
                  onPress={() => void handlePlanPress(plan)}
                />
              );
            })
          )}
          </>
        ) : (
          <Card compact style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <MaterialCommunityIcons name="information-outline" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{ color: colors.text, fontFamily: Fonts.title, fontWeight: '800' }}>
                  Managed on your account
                </ThemedText>
                <ThemedText style={{ color: `${colors.text}99` }}>
                  Plan changes are not available in this version of the app. Everything above is
                  what your account has right now.
                </ThemedText>
              </View>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  return (
    <View
      style={{
        flex: 1,
        minHeight: 76,
        borderRadius: 20,
        padding: theme.spacing.md,
        justifyContent: 'space-between',
        backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
      }}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      <View>
        <ThemedText style={{ color: colors.text, fontFamily: Fonts.title, fontWeight: '900' }}>
          {value}
        </ThemedText>
        <ThemedText variant="micro" style={{ color: `${colors.text}88` }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

function PlanCard({
  plan,
  accent,
  actionLabel,
  busy,
  disabled,
  isCurrent,
  isRecommended,
  onPress,
}: {
  plan: BillingPlan;
  accent: string;
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  isCurrent: boolean;
  isRecommended: boolean;
  onPress: () => void;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const features = topFeatures(plan);
  const includedCredits = formatCount(plan.included_credits);
  const dailyLimit =
    plan.daily_credit_limit > 0 ? `${formatCount(plan.daily_credit_limit)} / day` : 'Custom cap';

  return (
    <Card
      compact
      style={{
        padding: 0,
        overflow: 'hidden',
        borderColor: isRecommended ? accent : colors.border,
        borderWidth: isRecommended ? 1.5 : 1,
      }}>
      <View style={{ height: 6, backgroundColor: accent }} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}>
          <View
            style={{
              height: 48,
              width: 48,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}24`,
            }}>
            <MaterialCommunityIcons name={planIcon(plan)} size={24} color={accent} />
          </View>

          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <ThemedText
                style={{
                  color: colors.text,
                  fontFamily: Fonts.title,
                  fontSize: 18,
                  fontWeight: '900',
                }}>
                {plan.name}
              </ThemedText>
              {isRecommended ? <Badge label="Smart pick" color={accent} /> : null}
              {isCurrent ? <Badge label="Active" color="#17A978" /> : null}
            </View>
            <ThemedText style={{ color: `${colors.text}99` }}>{planSubtitle(plan)}</ThemedText>
          </View>

          <View style={{ alignItems: 'flex-end', maxWidth: 112 }}>
            <ThemedText
              numberOfLines={2}
              style={{ color: colors.text, fontFamily: Fonts.title, fontWeight: '900' }}>
              {formatPlanPrice(plan)}
            </ThemedText>
            <ThemedText variant="caption" style={{ color: `${colors.text}88` }}>
              {intervalLabels[plan.billing_interval] ?? plan.billing_interval}
            </ThemedText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <PlanMetric label="Included credits" value={includedCredits} icon="creation-outline" />
          <PlanMetric label="Daily limit" value={dailyLimit} icon="speedometer" />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {features.length > 0 ? (
            features.map((feature) => (
              <FeatureRow key={feature} label={feature} accent={accent} />
            ))
          ) : (
            <FeatureRow label="Manual tracking stays free" accent={accent} />
          )}
          {plan.feature_gates.length > features.length ? (
            <ThemedText variant="caption" style={{ color: `${colors.text}88` }}>
              +{plan.feature_gates.length - features.length} more paid feature
              {plan.feature_gates.length - features.length === 1 ? '' : 's'}
            </ThemedText>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => ({
            minHeight: 46,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.84 : disabled ? 0.62 : 1,
            backgroundColor: disabled ? colors.secondary : accent,
          })}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText
              style={{
                color: disabled ? colors.text : '#FFFFFF',
                fontFamily: Fonts.title,
                fontWeight: '900',
              }}>
              {actionLabel}
            </ThemedText>
          )}
        </Pressable>
      </View>
    </Card>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        backgroundColor: `${color}20`,
      }}>
      <ThemedText variant="micro" style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

function PlanMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  return (
    <View
      style={{
        flex: 1,
        minHeight: 74,
        borderRadius: 18,
        padding: theme.spacing.md,
        justifyContent: 'space-between',
        backgroundColor: colors.secondary,
      }}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      <View>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={{ color: colors.text, fontFamily: Fonts.title, fontWeight: '900' }}>
          {value}
        </ThemedText>
        <ThemedText variant="micro" style={{ color: `${colors.text}88` }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

function FeatureRow({ label, accent }: { label: string; accent: string }) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View
        style={{
          height: 22,
          width: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${accent}20`,
        }}>
        <MaterialCommunityIcons name="check" size={14} color={accent} />
      </View>
      <ThemedText style={{ flex: 1, color: colors.text }}>{label}</ThemedText>
    </View>
  );
}
