import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Eyebrow,
  HueTile,
  InsightCard,
  MetricStrip,
  NavCard,
  insightText,
} from '@/components/insights/insight-ui';
import { SectionHeader } from '@/components/insights/SectionHeader';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ReviewPeriodSwitch } from '@/components/insights/ReviewPeriodSwitch';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ListRow } from '@/components/ui/ListRow';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { categoryVisual } from '@/lib/categories';
import { formatMoney } from '@/lib/money';
import { DashboardResponse, fetchDashboard } from '@/lib/insights';

const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const toApiDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultWeeklyRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: toApiDate(start), end: toApiDate(end) };
};

const getNeedsReviewCount = (dashboard: DashboardResponse) =>
  (dashboard.review_items ?? dashboard.recent_transactions.filter((entry) => {
    const category = String(entry.category ?? '').trim().toLowerCase();
    return !category || category === 'uncategorized' || !entry.account_id;
  })).length;

export default function WeeklyReviewScreen() {
  const params = useLocalSearchParams();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const { token } = useAuthStore();
  const fallbackRange = useMemo(() => defaultWeeklyRange(), []);
  const start = toParam(params.start) ?? fallbackRange.start;
  const end = toParam(params.end) ?? fallbackRange.end;
  const label = toParam(params.label) ?? 'Weekly review';

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDashboard(await fetchDashboard(token, start, end));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load weekly review.'));
    } finally {
      setLoading(false);
    }
  }, [end, start, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const warnings = useMemo(
    () => dashboard?.insights.filter((insight) => insight.severity === 'warning') ?? [],
    [dashboard?.insights]
  );
  const budgetRisks = useMemo(
    () => dashboard?.budget_statuses.filter((budget) => budget.status !== 'safe') ?? [],
    [dashboard?.budget_statuses]
  );
  const recurringDue = useMemo(
    () => dashboard?.recurring_candidates.filter((candidate) => candidate.review_due) ?? [],
    [dashboard?.recurring_candidates]
  );
  const reviewCount = dashboard ? getNeedsReviewCount(dashboard) : 0;
  const topAction = useMemo(() => {
    if (!dashboard) return null;
    if (reviewCount > 0) {
      return {
        title: 'Clean up review items',
        body: `${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need category or account cleanup.`,
        icon: 'playlist-check' as const,
        onPress: () =>
          router.push({
            pathname: '/transactions',
            params: { review: '1', start_date: start, end_date: end },
          }),
      };
    }
    if (budgetRisks.length > 0) {
      const budget = budgetRisks[0];
      return {
        title: `${budget.category || budget.name} budget needs attention`,
        body: `${formatMoney(budget.spent_amount)} of ${formatMoney(budget.limit_amount)} used.`,
        icon: 'chart-donut' as const,
        onPress: () =>
          router.push({
            pathname: '/budgets',
            params: {
              source: 'insight',
              budgetId: String(budget.budget_id),
              category: budget.category,
              suggestedLimit: String(Math.max(budget.limit_amount, budget.spent_amount)),
            },
          }),
      };
    }
    if (recurringDue.length > 0) {
      return {
        title: 'Confirm recurring patterns',
        body: `${recurringDue.length} recurring pattern${recurringDue.length === 1 ? '' : 's'} ready for review.`,
        icon: 'repeat-variant' as const,
        onPress: () => router.push({ pathname: '/recurring-review', params: { start, end } }),
      };
    }
    return {
      title: 'Review spending details',
      body: 'Open the detailed breakdown for categories, merchants, and daily trend.',
      icon: 'chart-line' as const,
      onPress: () => router.push({ pathname: '/spending-analysis', params: { start, end, label } }),
    };
  }, [budgetRisks, dashboard, end, label, recurringDue.length, reviewCount, start]);

  const topCategory = dashboard?.top_categories[0];
  const topMerchant = dashboard?.top_merchants[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Review"
        subtitle={label}
        onBack={() => router.back()}
        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
        rightNode={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reload"
            onPress={load}
            style={styles.headerIcon}>
            <MaterialCommunityIcons name="refresh" size={24} color={colors.text} />
          </Pressable>
        }
      />
      <ReviewPeriodSwitch active="week" />

      {loading && !dashboard ? (
        <SkeletonFrame
          label="Loading weekly review"
          testID="weekly-review-skeleton"
          style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
          <SkeletonCards count={4} lines={3} radius={16} />
        </SkeletonFrame>
      ) : !dashboard ? (
        <View style={styles.center}>
          <StateView
            icon={error ? 'wifi-off' : 'file-chart'}
            title={error ? 'Review did not load' : 'No review yet'}
            message={error || 'Add transactions to generate a weekly review.'}
            actionLabel="Try again"
            onAction={load}
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {error && <ErrorBanner message={error} onRetry={load} />}

          <InsightCard>
            <Eyebrow>This period</Eyebrow>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[insightText.figure, { color: colors.text }]}>
              {formatMoney(dashboard.summary.total_spent)}
            </ThemedText>
            <ThemedText tone="muted" style={insightText.body}>
              {dashboard.summary.transaction_count} confirmed transactions ·{' '}
              {formatMoney(dashboard.summary.daily_average)} a day
            </ThemedText>
            <MetricStrip
              items={[
                { label: 'Income', value: formatMoney(dashboard.summary.total_income) },
                { label: 'Budgets', value: String(budgetRisks.length) },
                { label: 'Recurring', value: String(recurringDue.length) },
              ]}
            />
          </InsightCard>

          {topAction && (
            <NavCard
              icon={topAction.icon}
              hue={colors.accent}
              eyebrow="Next step"
              title={topAction.title}
              body={topAction.body}
              onPress={topAction.onPress}
            />
          )}

          <SectionHeader title="Highlights">
            <InsightCard flush>
              <ListRow
                icon={topCategory ? categoryVisual(topCategory.category).icon : 'shape-outline'}
                hue={topCategory ? categoryVisual(topCategory.category).color : colors.neutral}
                title={topCategory?.category ?? 'No category leader'}
                meta={
                  topCategory
                    ? `${Math.round(topCategory.percentage)}% of spend`
                    : 'More transactions will reveal a category pattern.'
                }
                amount={topCategory ? formatMoney(topCategory.amount) : undefined}
              />
              <ListRow
                icon="storefront-outline"
                hue={colors.neutral}
                title={topMerchant?.merchant ?? 'No merchant leader'}
                meta={
                  topMerchant
                    ? `${topMerchant.transaction_count} transaction${topMerchant.transaction_count === 1 ? '' : 's'}`
                    : 'Merchant insights appear after merchant-tagged expenses.'
                }
                amount={topMerchant ? formatMoney(topMerchant.amount) : undefined}
                divider
              />
            </InsightCard>
          </SectionHeader>

          {(budgetRisks.length > 0 || recurringDue.length > 0 || warnings.length > 0) && (
            <SectionHeader title="Needs attention">
              <InsightCard flush>
                {[
                  ...budgetRisks.slice(0, 2).map((budget) => ({
                    key: `budget-${budget.budget_id}`,
                    icon: 'chart-donut' as const,
                    hue: budget.status === 'exceeded' ? colors.negative : colors.warning,
                    title: `${budget.category || budget.name} budget ${budget.status}`,
                    body: `${Math.round(budget.percentage)}% used · ${formatMoney(budget.remaining_amount)} left`,
                  })),
                  ...recurringDue.slice(0, 2).map((candidate) => ({
                    key: `recurring-${candidate.candidate_key}`,
                    icon: 'repeat-variant' as const,
                    hue: colors.accent,
                    title: candidate.label,
                    body: `${formatMoney(candidate.average_amount)} expected around ${candidate.next_expected_date}`,
                  })),
                  ...warnings.slice(0, 2).map((warning) => ({
                    key: `warning-${warning.kind}-${warning.title}`,
                    icon: 'alarm-light-outline' as const,
                    hue: colors.warning,
                    title: warning.title,
                    body: warning.body,
                  })),
                ].map(({ key, ...item }, index) => (
                  <AttentionRow key={key} {...item} divider={index > 0} />
                ))}
              </InsightCard>
            </SectionHeader>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** A row that explains rather than opens: tile, title, and a body that may wrap. */
function AttentionRow({
  icon,
  hue,
  title,
  body,
  divider,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  title: string;
  body: string;
  divider: boolean;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.attention, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <HueTile icon={icon} hue={hue} />
      <View style={styles.attentionText}>
        <ThemedText numberOfLines={1} style={[styles.attentionTitle, { color: colors.text }]}>
          {title}
        </ThemedText>
        <ThemedText tone="muted" numberOfLines={2} style={insightText.caption}>
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 48,
  },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  attentionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  attentionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  headerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginRight: -8,
  },
});
