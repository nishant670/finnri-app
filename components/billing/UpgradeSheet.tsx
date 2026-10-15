import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CHECKOUT_LINK_ENABLED, IN_APP_PURCHASE_ENABLED } from '@/lib/purchase-policy';
import { AnimatedBottomSheet } from '@/components/ui/AnimatedBottomSheet';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Entitlement } from '@/lib/api-error';
import { useAuthStore } from '@/hooks/use-auth-store';
import {
  fetchBillingPlans,
  fetchBillingStatus,
  formatMinor,
  formatPlanPrice,
  planOffer,
  type BillingPlan,
  type BillingStatus,
} from '@/lib/billing';

type FeatureCopy = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  summary: string;
  bullets: string[];
};

/**
 * What each gated feature actually does, in the user's terms. Keyed by the
 * backend's `feature_code` (see `internal/billing/entitlements.go`).
 */
const featureCopy: Record<string, FeatureCopy> = {
  budgets: {
    icon: 'chart-donut',
    summary: 'Set a monthly limit and hear about it before you cross it — not after.',
    bullets: [
      'A limit per category, or one across everything',
      'An alert at your own threshold, 80% by default',
      'Budget progress on Insights and Home',
    ],
  },
  advanced_insights: {
    icon: 'chart-line',
    summary: 'The full read on where your money went, not just the last few days.',
    bullets: [
      'Category and merchant trends over any period',
      'Month-on-month comparisons',
      'Unusual spending flagged as it happens',
    ],
  },
  weekly_review: {
    icon: 'calendar-check',
    summary: 'A short weekly summary of what you spent and what changed.',
    bullets: ['Delivered every week', 'The biggest movers, called out', 'Shareable'],
  },
  subscription_reminders: {
    icon: 'bell-ring-outline',
    summary: 'Know a renewal is coming while you can still cancel it.',
    bullets: [
      'A reminder before every renewal date',
      'Your own notice period, 3 days by default',
      'Covers every tracked subscription',
    ],
  },
  split_ledger: {
    icon: 'account-group-outline',
    summary: 'Track who owes what without leaving Finnri.',
    bullets: ['Friends and groups', 'Running balances', 'Settle-up history'],
  },
  exports: {
    icon: 'tray-arrow-down',
    summary: 'Take your data with you, any time.',
    bullets: ['CSV of any filtered view', 'PDF month statements'],
  },
  bulk_edit: {
    icon: 'playlist-edit',
    summary: 'Fix many transactions at once instead of one at a time.',
    bullets: ['Recategorise in bulk', 'Retag or reassign accounts in one pass'],
  },
  web_dashboard: {
    icon: 'monitor-dashboard',
    summary: 'The same ledger on a bigger screen.',
    bullets: ['Full history in the browser', 'Signed in with this account'],
  },
  ai_text_capture: {
    icon: 'text-recognition',
    summary: 'Type a sentence and let Finnri turn it into a clean transaction.',
    bullets: ['Amount, merchant, category and account, filled in', 'Always yours to confirm'],
  },
  ai_voice_capture: {
    icon: 'microphone-outline',
    summary: 'Say it once and let Finnri turn it into a clean transaction.',
    bullets: ['Amount, merchant, category and account, filled in', 'Always yours to confirm'],
  },
  future_ai_advisor: {
    icon: 'lightbulb-on-outline',
    summary: 'Ask Finnri questions about your own spending.',
    bullets: ['Answers drawn from your ledger', 'Tap through to the transactions behind them'],
  },
};

const fallbackCopy = (label: string): FeatureCopy => ({
  icon: 'lock-open-variant-outline',
  summary: `${label} is part of Finnri's paid plan.`,
  bullets: [],
});

/** The cheapest plan a user can actually buy — what the feature costs today. */
const cheapestPayablePlan = (plans: BillingPlan[]) =>
  plans
    .filter((plan) => plan.billing_interval !== 'lifetime_quote')
    .filter((plan) => (plan.price_minor ?? 0) > 0)
    .sort((first, second) => (first.price_minor ?? 0) - (second.price_minor ?? 0))[0] ?? null;

/**
 * Whether there is a plan screen worth sending anyone to. True when either
 * route to paying exists — an in-app purchase (off) or the hosted checkout
 * page opened in a browser (on).
 */
const PLANS_REACHABLE = IN_APP_PURCHASE_ENABLED || CHECKOUT_LINK_ENABLED;

const intervalSuffix: Record<string, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

type UpgradeSheetProps = {
  visible: boolean;
  entitlement: Entitlement | null;
  onClose: () => void;
};

/**
 * The one paywall in the app. Anything that receives a 402 renders this
 * instead of an error: what the feature does, what it costs, one button.
 */
export function UpgradeSheet({ visible, entitlement, onClose }: UpgradeSheetProps) {
  const router = useRouter();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const muted = `${colors.text}99`;
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  // Who is looking decides whether the launch price is theirs to quote.
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const { token } = useAuthStore();

  useEffect(() => {
    // Prices are only ever shown where the app may sell. Fetching them for a
    // sheet that will not display one is a request for nothing.
    if (!visible || plans || !PLANS_REACHABLE) return;
    let active = true;
    Promise.all([
      fetchBillingPlans(),
      token ? fetchBillingStatus(token).catch(() => null) : Promise.resolve(null),
    ])
      .then(([loaded, loadedStatus]) => {
        if (!active) return;
        setPlans(loaded);
        setBillingStatus(loadedStatus);
      })
      // Price is a nicety. Without it the sheet still says what the feature
      // does and still routes to the plan screen.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [plans, token, visible]);

  if (!entitlement) return null;

  const label = entitlement.featureLabel;
  const copy = (entitlement.featureCode && featureCopy[entitlement.featureCode]) || fallbackCopy(label);
  const plan = plans ? cheapestPayablePlan(plans) : null;
  // Never invent a price. Until checkout is live the plans carry no amount,
  // and saying so is better than an empty card or a made-up number.
  const offer = plan ? planOffer(plan, billingStatus) : null;
  const priceLine = plan
    ? offer
      ? `${formatMinor(offer.price_minor, plan.currency)} a ${intervalSuffix[plan.billing_interval] ?? plan.billing_interval} · ${plan.name} · launch offer, was ${formatMinor(offer.original_price_minor, plan.currency)}`
      : `${formatPlanPrice(plan)} a ${intervalSuffix[plan.billing_interval] ?? plan.billing_interval} · ${plan.name}`
    : plans && plans.length > 0
      ? 'Pricing announced soon'
      : null;

  const openPlans = () => {
    onClose();
    router.push('/billing');
  };

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={onClose}
      sheetStyle={{
        backgroundColor: colors.background,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 32,
      }}>
      <View className="mb-5 items-center">
        <View className="h-1 w-10 rounded-full" style={{ backgroundColor: colors.border }} />
      </View>

      <View className="flex-row items-center gap-3">
        <View
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${colors.accent}1F` }}>
          <MaterialCommunityIcons name={copy.icon} size={24} color={colors.accent} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-[11px] font-black uppercase" style={{ color: colors.accent }}>
            Finnri plan
          </ThemedText>
          <ThemedText className="text-xl font-black" style={{ fontFamily: Fonts.title }}>
            {label}
          </ThemedText>
        </View>
      </View>

      <ThemedText className="mt-4 text-sm" style={{ color: muted, lineHeight: 20 }}>
        {copy.summary}
      </ThemedText>

      {copy.bullets.length > 0 && (
        <View className="mt-4 gap-2">
          {copy.bullets.map((bullet) => (
            <View key={bullet} className="flex-row items-start gap-2">
              <MaterialCommunityIcons
                name="check-circle"
                size={16}
                color={colors.accent}
                style={{ marginTop: 2 }}
              />
              <ThemedText className="flex-1 text-sm" style={{ lineHeight: 20 }}>
                {bullet}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      {PLANS_REACHABLE && priceLine && (
        <View
          className="mt-5 rounded-2xl px-4 py-3"
          style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}>
          <ThemedText className="text-[11px] font-black uppercase" style={{ color: muted }}>
            From
          </ThemedText>
          <ThemedText className="mt-0.5 text-sm font-black">{priceLine}</ThemedText>
        </View>
      )}

      {/*
        With in-app purchase off, this sheet explains the feature and stops
        there. Google Play forbids both selling digital content outside Play
        Billing and steering users to somewhere that does, so there is no buy
        button, no price, and no link out - only a way back to the plan and
        credits the account already has.
      */}
      <Pressable
        accessibilityRole="button"
        onPress={PLANS_REACHABLE ? openPlans : onClose}
        className="mt-6 h-13 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.accent, minHeight: 52 }}>
        <ThemedText className="text-sm font-black" style={{ color: 'white' }}>
          {PLANS_REACHABLE ? 'See plans' : 'Got it'}
        </ThemedText>
      </Pressable>

      {PLANS_REACHABLE ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          className="mt-2 items-center justify-center"
          style={{ minHeight: 44 }}>
          <ThemedText className="text-xs font-bold" style={{ color: muted }}>
            Not now
          </ThemedText>
        </Pressable>
      ) : null}
    </AnimatedBottomSheet>
  );
}
