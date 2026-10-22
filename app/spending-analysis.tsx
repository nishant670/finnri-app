import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BarRow,
  categoryTrend,
  Eyebrow,
  InsightCard,
  MonogramTile,
  NavRow,
  insightText,
  periodRangeLabel,
} from '@/components/insights/insight-ui';
import { SectionHeader } from '@/components/insights/SectionHeader';
import { SpendTrendChart } from '@/components/insights/SpendTrendChart';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ListRow } from '@/components/ui/ListRow';
import {
  SkeletonCard,
  SkeletonCards,
  SkeletonFrame,
  SkeletonStat,
} from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import {
  DashboardResponse,
  InsightCard as InsightCardData,
  fetchDashboard,
  previousWindowLabel,
} from '@/lib/insights';
import { insightDetailParams } from '@/lib/insight-summary';
import { subscribeTransactionsChanged } from '@/lib/transaction-events';
import { openFilteredTransactions } from '@/lib/transaction-links';
import { resolveCategoryMetadata } from '@/lib/transactions';

const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const monthLabelFromPeriod = (dashboard: DashboardResponse | null, fallback?: string) => {
  if (fallback) return fallback;
  if (!dashboard?.period.start) return 'Selected Period';
  const parsed = new Date(`${dashboard.period.start}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? 'Selected Period'
    : parsed.toLocaleString('default', { month: 'short', year: 'numeric' });
};

export default function SpendingAnalysisScreen() {
  const params = useLocalSearchParams();
  const theme = useThemeTokens().colors;
  const { token } = useAuthStore();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = toParam(params.start);
  const end = toParam(params.end);
  const label = toParam(params.label);

  const loadData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDashboard(await fetchDashboard(token, start, end));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load detailed analysis.'));
    } finally {
      setLoading(false);
    }
  }, [end, start, token]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        void loadData();
      }),
    [loadData]
  );

  const periodLabel = useMemo(() => monthLabelFromPeriod(dashboard, label), [dashboard, label]);

  if (loading && !dashboard) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <SkeletonFrame
          label="Loading detailed analysis"
          testID="spending-analysis-skeleton"
          style={{ paddingHorizontal: 16, paddingTop: 24, gap: 16 }}>
          <SkeletonCard radius={16} padding={16}>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <SkeletonStat index={0} />
              <SkeletonStat index={1} />
            </View>
          </SkeletonCard>
          <SkeletonCards count={3} lines={3} />
        </SkeletonFrame>
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <StateView
          icon={error ? 'wifi-off' : 'chart-line'}
          title={error ? 'Analysis did not load' : 'No analysis yet'}
          message={error || 'Add transactions to generate a detailed spending view.'}
          actionLabel="Try again"
          onAction={() => void loadData()}
        />
      </View>
    );
  }

  const range = periodRangeLabel(dashboard.period.start, dashboard.period.end);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Detailed analysis"
        subtitle={range && range !== periodLabel ? `${periodLabel} · ${range}` : periodLabel}
        onBack={() => router.back()}
        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
        rightNode={
          loading ? <ActivityIndicator color={theme.muted} style={{ marginLeft: 12 }} /> : <View />
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}

        {/* Same chart as the Insights tab, not a second one. This screen used
            to draw its own bars with no reference line and a "Start / Mid /
            End" axis, so the same data told two stories depending on which
            screen you were on. */}
        <InsightCard>
          <Eyebrow>Total spending</Eyebrow>
          <ThemedText
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[insightText.figure, { color: theme.text }]}>
            {formatMoney(dashboard.summary.total_spent)}
          </ThemedText>
          <ThemedText tone="muted" style={insightText.body}>
            {formatMoney(dashboard.summary.daily_average)} a day on average
          </ThemedText>
          <SpendTrendChart
            bare
            dashboard={dashboard}
            onOpenRange={(bucket) =>
              openFilteredTransactions({
                startDate: bucket.start,
                endDate: bucket.end,
                type: 'Expense',
              })
            }
          />
        </InsightCard>
        <CategoryBreakdown dashboard={dashboard} periodLabel={periodLabel} />
        <TopMerchants dashboard={dashboard} periodLabel={periodLabel} />
        <BehavioralInsights dashboard={dashboard} periodLabel={periodLabel} />

        <Button
          variant="outline"
          icon="file-chart-outline"
          label="Generate weekly report"
          onPress={() =>
            router.push({
              pathname: '/weekly-review',
              params: {
                start: dashboard.period.start,
                end: dashboard.period.end,
                label: periodLabel,
              },
            })
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryBreakdown({
  dashboard,
  periodLabel,
}: {
  dashboard: DashboardResponse;
  periodLabel: string;
}) {
  if (dashboard.top_categories.length === 0) return null;

  return (
    <SectionHeader title="By category">
      <InsightCard flush>
        {dashboard.top_categories.map((category, index) => {
          const meta = resolveCategoryMetadata(category.category);
          return (
            <BarRow
              key={category.category}
              icon={meta.icon}
              hue={meta.color}
              title={category.category}
              amount={formatMoney(category.amount)}
              fraction={category.percentage / 100}
              caption={`${shareLabel(category.percentage)} of total`}
              trend={categoryTrend(category, previousWindowLabel(dashboard.period))}
              divider={index > 0}
              onPress={() =>
                router.push({
                  pathname: '/category-detail',
                  params: {
                    category: category.category,
                    start: dashboard.period.start,
                    end: dashboard.period.end,
                    label: periodLabel,
                  },
                })
              }
            />
          );
        })}
      </InsightCard>
    </SectionHeader>
  );
}

/** `48%`, or `under 1%` for a share that would round to nothing. */
const shareLabel = (percentage: number) =>
  percentage > 0 && percentage < 1 ? 'under 1%' : `${Math.round(percentage)}%`;

function TopMerchants({
  dashboard,
  periodLabel,
}: {
  dashboard: DashboardResponse;
  periodLabel: string;
}) {
  if (dashboard.top_merchants.length === 0) return null;

  return (
    <SectionHeader title="Top merchants">
      <InsightCard flush>
        {dashboard.top_merchants.map((merchant, index) => (
          <ListRow
            key={merchant.merchant}
            icon="storefront-outline"
            hue={MERCHANT_HUE}
            leading={<MonogramTile name={merchant.merchant} />}
            title={merchant.merchant}
            meta={`${merchant.transaction_count} transaction${merchant.transaction_count === 1 ? '' : 's'}`}
            amount={formatMoney(merchant.amount)}
            divider={index > 0}
            onPress={() =>
              router.push({
                pathname: '/merchant-history',
                params: {
                  merchant: merchant.merchant,
                  start: dashboard.period.start,
                  end: dashboard.period.end,
                  label: periodLabel,
                },
              })
            }
          />
        ))}
      </InsightCard>
    </SectionHeader>
  );
}

/** Unused under a monogram, but ListRow wants a hue for its fallback tile. */
const MERCHANT_HUE = '#64748B';

function BehavioralInsights({
  dashboard,
  periodLabel,
}: {
  dashboard: DashboardResponse;
  periodLabel: string;
}) {
  const theme = useThemeTokens().colors;
  const cards = dashboard.insights;
  if (cards.length === 0) return null;

  return (
    <SectionHeader title="What stands out">
      <InsightCard flush>
        {cards.slice(0, 4).map((card: InsightCardData, index) => {
          const warning = card.severity === 'warning';
          return (
            <NavRow
              key={card.kind}
              icon={warning ? 'alarm-light-outline' : 'chart-line-variant'}
              hue={warning ? theme.warning : theme.accent}
              title={card.title}
              body={card.body}
              divider={index > 0}
              onPress={() =>
                router.push({
                  pathname: '/insight-detail',
                  params: insightDetailParams(card, dashboard, periodLabel),
                })
              }
            />
          );
        })}
      </InsightCard>
    </SectionHeader>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 48,
  },
});
