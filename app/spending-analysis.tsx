import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpendTrendChart } from '@/components/insights/SpendTrendChart';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import {
  SkeletonCard,
  SkeletonCards,
  SkeletonFrame,
  SkeletonStat,
} from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import { DashboardResponse, InsightCard, fetchDashboard } from '@/lib/insights';
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
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
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
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <SkeletonFrame
          label="Loading detailed analysis"
          testID="spending-analysis-skeleton"
          style={{ paddingHorizontal: 20, paddingTop: 24, gap: 20 }}>
          <SkeletonCard radius={26} padding={20}>
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
      <View className="flex-1 justify-center" style={{ backgroundColor: theme.background }}>
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-5 py-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="chevron-left" size={30} color={theme.text} />
        </TouchableOpacity>
        <ThemedText className="text-base font-black" style={{ color: theme.text }}>
          Detailed Analysis
        </ThemedText>
        <TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800">
          <MaterialCommunityIcons name="share-variant-outline" size={20} color="#6F6965" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}>
        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => void loadData()}
            style={{ marginHorizontal: 20, marginBottom: 16 }}
          />
        )}

        <View className="mt-3 items-center">
          <View
            className="mb-3 flex-row items-center rounded-full px-4 py-2"
            style={{ backgroundColor: theme.secondary }}>
            <ThemedText className="text-xs font-bold" style={{ color: theme.accent }}>
              {periodLabel}
            </ThemedText>
            {loading && <ActivityIndicator className="ml-2" size="small" color={theme.accent} />}
          </View>
          <ThemedText tone="muted" className="mb-1 text-[11px] font-black uppercase tracking-widest">
            Total Spending
          </ThemedText>
          <ThemedText
            className="text-4xl font-black"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: theme.text }}>
            {formatMoney(dashboard.summary.total_spent)}
          </ThemedText>
        </View>

        {/* Same chart as the Insights tab, not a second one. This screen used
            to draw its own bars with no reference line and a "Start / Mid /
            End" axis, so the same data told two stories depending on which
            screen you were on. */}
        <View className="mx-5 mt-8">
          <SpendTrendChart
            dashboard={dashboard}
            onOpenRange={(bucket) =>
              openFilteredTransactions({
                startDate: bucket.start,
                endDate: bucket.end,
                type: 'Expense',
              })
            }
          />
        </View>
        <CategoryBreakdown dashboard={dashboard} periodLabel={periodLabel} />
        <TopMerchants dashboard={dashboard} periodLabel={periodLabel} />
        <BehavioralInsights cards={dashboard.insights} />
      </ScrollView>

      <View className="absolute bottom-8 left-5 right-5">
        <TouchableOpacity
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
          className="flex-row items-center justify-center rounded-2xl py-4 shadow-lg"
          style={{ backgroundColor: theme.accent }}>
          <MaterialCommunityIcons name="file-chart" size={20} color={theme.onAccent} />
          <ThemedText tone="onAccent" className="ml-2 font-black">Generate Weekly Report</ThemedText>
        </TouchableOpacity>
      </View>
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
    <View className="mx-5 mt-8">
      <ThemedText className="mb-4 text-lg font-black">By Category</ThemedText>
      <View className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {dashboard.top_categories.map((category, index) => {
          const meta = resolveCategoryMetadata(category.category);
          return (
            <TouchableOpacity
              key={category.category}
              className={`flex-row items-center p-5 ${index < dashboard.top_categories.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
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
              }>
              <View
                className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: meta.bgColor }}>
                <MaterialCommunityIcons name={meta.icon} size={23} color={meta.color} />
              </View>
              <View className="flex-1">
                <ThemedText className="text-sm font-black">{category.category}</ThemedText>
                <ThemedText tone="muted" className="mt-1 text-[11px]">
                  {Math.round(category.percentage)}% of total
                </ThemedText>
              </View>
              <View className="items-end">
                <ThemedText className="text-sm font-black">
                  {formatMoney(category.amount)}
                </ThemedText>
                <View className="mt-2 h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(category.percentage, 100)}%`,
                      backgroundColor: meta.color,
                    }}
                  />
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="#CFCAC6" />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function TopMerchants({
  dashboard,
  periodLabel,
}: {
  dashboard: DashboardResponse;
  periodLabel: string;
}) {
  if (dashboard.top_merchants.length === 0) return null;

  return (
    <View className="mx-5 mt-8">
      <ThemedText className="mb-4 text-lg font-black">Top Merchants</ThemedText>
      <View className="overflow-hidden rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {dashboard.top_merchants.map((merchant, index) => (
          <TouchableOpacity
            key={merchant.merchant}
            className={`flex-row items-center ${index < dashboard.top_merchants.length - 1 ? 'mb-4' : ''}`}
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
            }>
            <View className="mr-4 h-11 w-11 items-center justify-center rounded-full bg-gray-100">
              <ThemedText tone="muted" className="text-[10px] font-black">
                {merchant.merchant.slice(0, 3).toUpperCase()}
              </ThemedText>
            </View>
            <View className="flex-1">
              <ThemedText className="text-sm font-bold">{merchant.merchant}</ThemedText>
              <ThemedText tone="muted" className="text-[11px]">
                {merchant.transaction_count} transactions
              </ThemedText>
            </View>
            <View className="items-end">
              <ThemedText className="text-sm font-black">{formatMoney(merchant.amount)}</ThemedText>
              <ThemedText className="mt-1 text-[10px] font-bold" style={{ color: '#9B9692' }}>
                Details
              </ThemedText>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#CFCAC6" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function BehavioralInsights({ cards }: { cards: InsightCard[] }) {
  const theme = useThemeTokens();
  if (cards.length === 0) return null;

  return (
    <View className="mx-5 mt-8">
      <ThemedText className="mb-4 text-lg font-black">Behavioral Insights</ThemedText>
      <View className="gap-4">
        {cards.slice(0, 4).map((card) => {
          const warning = card.severity === 'warning';
          const color = warning ? '#FF6680' : theme.colors.accent;
          return (
            <View
              key={card.kind}
              className="flex-row rounded-[24px] border p-5"
              style={{
                backgroundColor: warning ? '#FFF3F5' : theme.colors.secondary,
                borderColor: warning ? '#FFD3DB' : theme.colors.border,
              }}>
              <View className="mr-4 h-11 w-11 items-center justify-center rounded-full bg-white">
                <MaterialCommunityIcons
                  name={warning ? 'alarm-light-outline' : 'sofa-outline'}
                  size={22}
                  color={color}
                />
              </View>
              <View className="flex-1">
                <ThemedText className="text-sm font-black" style={{ color }}>
                  {card.title}
                </ThemedText>
                <ThemedText tone="mutedStrong" className="mt-1 text-xs leading-5">
                  {card.body}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
