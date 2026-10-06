import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, useScrollToTop } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryDonut } from '@/components/insights/CategoryDonut';
import { EmptyPeriodCard } from '@/components/insights/EmptyPeriodCard';
import { OverviewBand } from '@/components/insights/OverviewBand';
import { DateRange, PeriodPicker } from '@/components/insights/PeriodPicker';
import { InsightsSkeleton } from '@/components/insights/InsightsSkeleton';
import { SpendTrendChart } from '@/components/insights/SpendTrendChart';
import { ThemedText } from '@/components/themed-text';
import { CountUpMoney } from '@/components/ui/CountUpMoney';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { CURRENCY_SYMBOL } from '@/constants/Currency';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { fetchAccounts, type Account } from '@/lib/accounts';
import { linkEntryAccount } from '@/lib/entries';
import { formatMoney } from '@/lib/money';
import { DashboardResponse, InsightCard, fetchDashboard, moneyOutOf } from '@/lib/insights';
import {
  periodIsEmptyButAccountIsNot,
  rangeForOverviewMonth,
  selectedMonthKey,
} from '@/lib/insights-periods';
import { subscribeTransactionsChanged } from '@/lib/transaction-events';
import { openFilteredTransactions } from '@/lib/transaction-links';
import { formatApiDate, resolveCategoryMetadata } from '@/lib/transactions';

const defaultRange = (): DateRange => {
  const current = new Date();
  return {
    start: new Date(current.getFullYear(), current.getMonth(), 1),
    end: current,
    label: current.toLocaleString('default', { month: 'long', year: 'numeric' }),
    preset: 'this_month',
  };
};

const getInsightLevel = (dashboard: DashboardResponse) => {
  const count =
    dashboard.summary.lifetime_transaction_count ?? dashboard.summary.transaction_count;
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 10) return 2;
  if (count < 30) return 3;
  return 4;
};

const getBurnRateCopy = (dashboard: DashboardResponse) => {
  const { total_income: income, daily_average: daily } = dashboard.summary;
  const out = moneyOutOf(dashboard.summary);
  if (daily <= 0) return 'Add more transactions to estimate your spending rhythm.';
  if (income > out) {
    const remaining = income - out;
    const days = Math.max(1, Math.round(remaining / daily));
    return `At your current spending pace, your surplus can cover ~${days} more days.`;
  }
  return 'Spending has caught up with recorded income for this period.';
};

const getPeriodPulse = (dashboard: DashboardResponse, reviewCount: number) => {
  const { total_income: income, transaction_count: count } = dashboard.summary;
  // Investments are money going out too; the pulse weighs everything that left.
  const spent = moneyOutOf(dashboard.summary);
  if (count === 0) {
    return {
      label: 'Waiting for data',
      reason: 'Add confirmed transactions to build this period summary.',
      color: '#9B9692',
      icon: 'progress-clock',
    };
  }
  if (reviewCount > 0) {
    return {
      label: 'Needs review',
      reason: `${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need category or account cleanup.`,
      color: '#FFB020',
      icon: 'playlist-check',
    };
  }
  if (income <= 0 && spent > 0) {
    return {
      label: 'No income recorded',
      reason: 'This period has expenses but no recorded income, so surplus cannot be estimated.',
      color: '#FFB020',
      icon: 'cash-remove',
    };
  }
  if (income > 0 && spent > income) {
    return {
      label: 'Watch spending',
      reason: 'Confirmed expenses are higher than recorded income for this period.',
      color: '#FF6680',
      icon: 'alert-circle-outline',
    };
  }
  return {
    label: 'On track',
    reason: 'Recorded income is higher than confirmed expenses for this period.',
    color: '#00B878',
    icon: 'check-decagram',
  };
};

const needsTransactionReview = (entry: DashboardResponse['recent_transactions'][number]) => {
  const category = String(entry.category ?? '')
    .trim()
    .toLowerCase();
  return !category || category === 'uncategorized' || !entry.account_id;
};

const getNeedsReview = (dashboard: DashboardResponse) => {
  const apiItems = dashboard.review_items ?? [];
  if (apiItems.length > 0) return apiItems;
  return dashboard.recent_transactions.filter(needsTransactionReview);
};

const getReviewReasons = (entry: DashboardResponse['recent_transactions'][number]) => {
  const reasons: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [];
  const category = String(entry.category ?? '').trim();
  if (!category) {
    reasons.push({ label: 'Missing category', icon: 'shape-outline' });
  } else if (category.toLowerCase() === 'uncategorized') {
    reasons.push({ label: 'Uncategorized', icon: 'shape-plus-outline' });
  }
  if (!entry.account_id) {
    reasons.push({ label: 'Missing account', icon: 'credit-card-outline' });
  }
  return reasons.length > 0 ? reasons : [{ label: 'Needs review', icon: 'playlist-check' }];
};

const openDashboardEntryForReview = (entry: DashboardResponse['recent_transactions'][number]) => {
  if (entry.id == null) return;
  const reasons = getReviewReasons(entry);
  const reviewFields = reasons
    .map((reason) => {
      if (reason.label === 'Missing account') return 'account';
      if (reason.label === 'Missing category' || reason.label === 'Uncategorized') return 'category';
      return '';
    })
    .filter(Boolean);
  const reviewFocus = reviewFields.includes('category') ? 'category' : reviewFields[0];
  router.push({
    pathname: '/entry/[id]',
    params: {
      id: String(entry.id),
      name: entry.title || entry.merchant || entry.category || 'Transaction',
      category: entry.category ?? '',
      amount: String(Math.abs(Number(entry.amount || 0))),
      entryType: String(entry.type ?? 'expense').toLowerCase() === 'income' ? 'income' : 'expense',
      section: 'Needs review',
      mode: entry.mode ?? '',
      notes: entry.notes ?? '',
      merchant: entry.merchant ?? '',
      dateLabel: entry.date ?? '',
      rawDate: entry.date ?? '',
      tag: entry.tag ?? '',
      edit: '1',
      reviewFocus: reviewFocus ?? '',
      reviewFields: reviewFields.join(','),
      categorySuggestions: JSON.stringify(entry.category_suggestions ?? []),
    },
  });
};

/**
 * The hero card. It returns the insight it promoted so Smart Alerts can drop
 * it — the same alert appearing twice on one screen made the analysis look
 * padded.
 */
const getTopTakeaway = (dashboard: DashboardResponse, reviewCount: number) => {
  const warning = dashboard.insights.find((item) => item.severity === 'warning');
  const topCategory = dashboard.top_categories[0];

  if (reviewCount > 0) {
    return {
      eyebrow: 'Fix first',
      title: `${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need review`,
      body: 'Resolve missing categories or accounts so the rest of your insights stay accurate.',
      icon: 'playlist-check',
      tone: 'warning' as const,
      promotedKind: null,
    };
  }

  if (warning) {
    return {
      eyebrow: 'Worth attention',
      title: warning.title,
      body: warning.body,
      icon: 'alarm-light-outline',
      tone: 'warning' as const,
      promotedKind: warning.kind,
    };
  }

  if (topCategory) {
    return {
      eyebrow: 'Main driver',
      title: `${topCategory.category} is ${Math.round(topCategory.percentage)}% of spend`,
      body: `${formatMoney(topCategory.amount)} recorded in this category during the selected period.`,
      icon: resolveCategoryMetadata(topCategory.category).icon,
      tone: 'info' as const,
      promotedKind: null,
    };
  }

  return {
    eyebrow: 'Spending pace',
    title: `${formatMoney(dashboard.summary.daily_average)} per day`,
    body: 'This is your average confirmed expense pace for the selected period.',
    icon: 'speedometer',
    tone: 'info' as const,
    promotedKind: null,
  };
};

export default function InsightScreen() {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [currentRange, setCurrentRange] = useState<DateRange>(defaultRange);
  const { period: requestedPeriod } = useLocalSearchParams<{ period?: string }>();

  /**
   * Home's month strip taps through here and promises "the same period".
   *
   * This screen stays mounted as a tab, so whatever range was last picked
   * survives — land on it after choosing "Last 30 Days" and the numbers would
   * not be the ones the strip just showed. The param resets the range to the
   * month the strip was describing.
   */
  useFocusEffect(
    useCallback(() => {
      if (requestedPeriod === 'this_month') {
        setCurrentRange((range) => (range.preset === 'this_month' ? range : defaultRange()));
      }
    }, [requestedPeriod])
  );

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (!token) {
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      setError(null);
      try {
        const start = currentRange.start ? formatApiDate(currentRange.start) : undefined;
        const end = currentRange.end ? formatApiDate(currentRange.end) : undefined;
        setDashboard(await fetchDashboard(token, start, end));
      } catch (loadError) {
        setError(getFriendlyErrorMessage(loadError, 'Unable to load insights.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentRange.end, currentRange.start, token]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData(true);
    }, [loadData])
  );

  useEffect(
    () =>
      subscribeTransactionsChanged(() => {
        void loadData(true);
      }),
    [loadData]
  );

  const insightLevel = useMemo(() => (dashboard ? getInsightLevel(dashboard) : 0), [dashboard]);
  const reviewItems = useMemo(() => (dashboard ? getNeedsReview(dashboard) : []), [dashboard]);
  const previewReviewItems = useMemo(() => reviewItems.slice(0, 3), [reviewItems]);
  const allClear = useMemo(
    () =>
      Boolean(
        dashboard &&
          dashboard.summary.transaction_count > 0 &&
          reviewItems.length === 0 &&
          !dashboard.budget_statuses?.some((budget) => budget.status !== 'safe') &&
          dashboard.recurring_candidates.length === 0 &&
          !dashboard.insights.some((insight) => insight.severity === 'warning')
      ),
    [dashboard, reviewItems.length]
  );
  const overview = dashboard?.overview ?? null;
  /**
   * The state the whole tab used to have no answer for: a window with nothing
   * in it on an account that is full.
   *
   * It is not an edge case — it is where every account lands on the 1st of
   * every month, which is when somebody opens Insights to plan. Answering it
   * with the ordinary cards produced ₹0 four times over "Waiting for data": a
   * true description of the window, and a false one of the account.
   */
  const periodIsEmpty = periodIsEmptyButAccountIsNot(dashboard);

  // The hero card promotes one insight to the top of the screen. Smart Alerts
  // must not then repeat it — the same alert twice on one screen reads as
  // padding and made the whole tab look thinner than it is.
  const smartAlertCards = useMemo(() => {
    if (!dashboard) return [];
    const promoted = getTopTakeaway(dashboard, reviewItems.length).promotedKind;
    return promoted
      ? dashboard.insights.filter((card) => card.kind !== promoted)
      : dashboard.insights;
  }, [dashboard, reviewItems.length]);

  // The header is real on the way in, because it is real the whole time the
  // screen exists — a period label that arrives with the data would be the
  // chrome pretending it was also being fetched.
  if (loading && !dashboard) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
        edges={['top', 'left', 'right']}>
        <InsightsHeader
          rangeLabel={currentRange.label}
          refreshing={false}
          onPickPeriod={() => setPickerVisible(true)}
        />
        <InsightsSkeleton />
        {/* The header's period is live while the skeleton is up — choosing a
            different month is the one useful thing to do during the wait, and a
            control that opens nothing is worse than no control. */}
        <PeriodPicker
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={setCurrentRange}
          currentRange={currentRange}
        />
      </SafeAreaView>
    );
  }

  if (!dashboard) {
    return (
      <View className="flex-1 justify-center" style={{ backgroundColor: theme.background }}>
        <StateView
          icon={error ? 'wifi-off' : 'chart-box-outline'}
          title={error ? 'Insights did not load' : 'No insights yet'}
          message={error || 'Capture a transaction to start seeing insights.'}
          actionLabel="Try again"
          onAction={() => void loadData()}
        />
      </View>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: theme.background }}
      edges={['top', 'left', 'right']}>
      <InsightsHeader
        rangeLabel={currentRange.label}
        refreshing={loading}
        onPickPeriod={() => setPickerVisible(true)}
      />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 110,
          gap: 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData(true);
            }}
            tintColor={theme.accent}
          />
        }>
        {error && <ErrorBanner message={error} onRetry={() => void loadData()} />}

        {/* First on the screen and independent of the period, because it is the
            one thing that is still true when the period is empty — and because
            a month means very little until there is something to read it
            against. See `OverviewBand`. */}
        {overview?.has_history ? (
          <Reflow>
            <OverviewBand
              overview={overview}
              selectedMonth={selectedMonthKey(currentRange)}
              onSelectMonth={(month) => setCurrentRange(rangeForOverviewMonth(month))}
            />
          </Reflow>
        ) : null}

        {insightLevel <= 1 ? (
          <Reflow>
            <InsightsUnlockProgressCard
              count={dashboard.summary.lifetime_transaction_count ?? dashboard.summary.transaction_count}
            />
          </Reflow>
        ) : null}

        {periodIsEmpty && overview ? (
          <Reflow>
            <EmptyPeriodCard
              rangeLabel={currentRange.label}
              overview={overview}
              onOpenMonth={(month) => setCurrentRange(rangeForOverviewMonth(month))}
              onAddTransaction={() => router.push('/(tabs)')}
            />
          </Reflow>
        ) : null}

        {insightLevel >= 2 && !periodIsEmpty ? (
          <>
            <Reflow>
              <TopTakeawayCard dashboard={dashboard} reviewCount={reviewItems.length} />
            </Reflow>
            <Reflow>
              <PeriodPulseCard
                dashboard={dashboard}
                insightLevel={insightLevel}
                reviewCount={reviewItems.length}
              />
            </Reflow>
          </>
        ) : null}

        {insightLevel >= 4 ? (
          <>
            {/* The weekly review reads the selected window, so it is one of the
                cards that had nothing to say in an empty one. The monthly
                review is not period-scoped and stays — in a month with no
                data yet, last month's review is the useful thing on screen. */}
            {periodIsEmpty ? null : (
              <Reflow>
                <WeeklyReviewTeaser dashboard={dashboard} rangeLabel={currentRange.label} />
              </Reflow>
            )}
            <Reflow>
              <MonthlyReviewTeaser />
            </Reflow>
          </>
        ) : null}

        {insightLevel >= 3 && allClear && (
          <Reflow>
            <AllClearCard dashboard={dashboard} />
          </Reflow>
        )}

        {insightLevel >= 2 && dashboard.summary.transaction_count > 0 && (
          <Reflow>
            <SpendingAnalysisCard
              dashboard={dashboard}
              onDetails={() =>
                router.push({
                  pathname: '/spending-analysis',
                  params: {
                    start: dashboard.period.start,
                    end: dashboard.period.end,
                    label: currentRange.label,
                  },
                })
              }
            />
          </Reflow>
        )}

        {insightLevel >= 3 && (
          <Reflow>
            <SmartAlerts
              cards={smartAlertCards}
              dashboard={dashboard}
              rangeLabel={currentRange.label}
            />
          </Reflow>
        )}

        {insightLevel >= 3 && dashboard.budget_statuses?.some((budget) => budget.status !== 'safe') && (
          <Reflow>
            <BudgetWatchSection dashboard={dashboard} rangeLabel={currentRange.label} />
          </Reflow>
        )}

        {insightLevel >= 3 && dashboard.recurring_candidates.length > 0 && (
          <Reflow>
            <RecurringReviewTeaser dashboard={dashboard} rangeLabel={currentRange.label} />
          </Reflow>
        )}

        {insightLevel >= 4 && dashboard.account_spending.length > 0 && (
          <Reflow>
            <AccountIntelligence dashboard={dashboard} />
          </Reflow>
        )}

        {previewReviewItems.length > 0 && (
          <Reflow>
            <NeedsReview
              entries={previewReviewItems}
              totalCount={reviewItems.length}
              periodStart={dashboard.period.start}
              periodEnd={dashboard.period.end}
              onLinked={() => void loadData(true)}
            />
          </Reflow>
        )}

      </ScrollView>

      <PeriodPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={setCurrentRange}
        currentRange={currentRange}
      />
    </SafeAreaView>
  );
}

/**
 * One card of the Insights stack, allowed to move rather than jump.
 *
 * Choosing the period rewrites this whole screen: cards appear, disappear and
 * change height, and every card below each change used to land somewhere else
 * in a single frame. The wrapper is what carries the `layout` — the cards
 * themselves are plain views with their own borders and padding, and pushing
 * Reanimated into each of them would spread the same three lines nine ways.
 */
function Reflow({ children }: { children: ReactNode }) {
  const motion = useMotion();

  return <Animated.View layout={motion.reflow()}>{children}</Animated.View>;
}

/**
 * The Insights chrome — title, the period it is showing, and search.
 *
 * Extracted only because the loading frame wears it too. A screen whose header
 * appears a beat after its body is a screen that visibly assembles itself, and
 * this one already knows its period before the first byte arrives.
 */
function InsightsHeader({
  rangeLabel,
  refreshing,
  onPickPeriod,
}: {
  rangeLabel: string;
  /** A reload behind content that is already on screen. Never true while the
   *  skeleton is up — that frame is already saying the same thing. */
  refreshing: boolean;
  onPickPeriod: () => void;
}) {
  const theme = useThemeTokens().colors;

  return (
    <View className="flex-row items-center justify-between px-5 py-4">
      <View>
        <ThemedText className="text-2xl font-black">Insights</ThemedText>
        <TouchableOpacity className="mt-1 flex-row items-center" onPress={onPickPeriod}>
          <ThemedText className="text-xs font-bold" style={{ color: theme.accent }}>
            {rangeLabel}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-down" size={14} color={theme.accent} />
        </TouchableOpacity>
      </View>
      <View className="flex-row items-center gap-3">
        {refreshing && <ActivityIndicator color={theme.accent} />}
        <HeaderIcon name="magnify" onPress={() => router.push('/transactions')} />
      </View>
    </View>
  );
}

function HeaderIcon({
  name,
  onPress,
}: {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
}) {
  const theme = useThemeTokens();

  return (
    <TouchableOpacity
      className="h-10 w-10 items-center justify-center rounded-full shadow-sm"
      style={{ backgroundColor: theme.colors.card }}
      onPress={onPress}>
      <MaterialCommunityIcons name={name} size={20} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

function TopTakeawayCard({
  dashboard,
  reviewCount,
}: {
  dashboard: DashboardResponse;
  reviewCount: number;
}) {
  const theme = useThemeTokens();
  const takeaway = getTopTakeaway(dashboard, reviewCount);
  const color = takeaway.tone === 'warning' ? '#FF6680' : theme.colors.accent;
  const topCategory = dashboard.top_categories[0];

  const handleAction = () => {
    if (reviewCount > 0) {
      router.push({
        pathname: '/transactions',
        params: {
          review: '1',
          start_date: dashboard.period.start,
          end_date: dashboard.period.end,
        },
      });
      return;
    }
    if (takeaway.tone === 'warning') {
      const warning = dashboard.insights.find((item) => item.severity === 'warning');
      if (warning) {
        router.push({
          pathname: '/insight-detail',
          params: insightDetailParams(warning, dashboard, dashboard.period.start),
        });
        return;
      }
    }
    if (topCategory) {
      router.push({
        pathname: '/category-detail',
        params: {
          category: topCategory.category,
          start: dashboard.period.start,
          end: dashboard.period.end,
          label: dashboard.period.start,
        },
      });
      return;
    }
    router.push('/spending-analysis');
  };

  return (
    <View
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start">
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${color}1A` }}>
          <MaterialCommunityIcons
            name={takeaway.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={23}
            color={color}
          />
        </View>
        <View className="flex-1">
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            {takeaway.eyebrow}
          </ThemedText>
          <ThemedText className="mt-1 text-xl font-black">{takeaway.title}</ThemedText>
          <ThemedText tone="muted" className="mt-2 text-xs leading-5">{takeaway.body}</ThemedText>
        </View>
      </View>
      <TouchableOpacity
        onPress={handleAction}
        className="mt-4 h-11 flex-row items-center justify-center rounded-2xl"
        style={{ backgroundColor: theme.colors.secondary }}>
        <ThemedText className="text-xs font-black" style={{ color }}>
          Open next step
        </ThemedText>
        <MaterialCommunityIcons name="chevron-right" size={18} color={color} />
      </TouchableOpacity>
    </View>
  );
}

function PeriodPulseCard({
  dashboard,
  insightLevel,
  reviewCount,
}: {
  dashboard: DashboardResponse;
  insightLevel: number;
  reviewCount: number;
}) {
  const theme = useThemeTokens();
  const accentSurface = theme.mode === 'dark' ? theme.colors.secondary : theme.colors.secondary;
  const pulse = getPeriodPulse(dashboard, reviewCount);
  const surplus = dashboard.summary.total_income - moneyOutOf(dashboard.summary);

  return (
    <View
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-4">
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            Period Pulse
          </ThemedText>
          <ThemedText className="mt-1 text-2xl font-black">{pulse.label}</ThemedText>
          <ThemedText tone="muted" className="mt-2 text-xs leading-5">{pulse.reason}</ThemedText>
        </View>
        <View
          className="h-[58px] w-[58px] items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${pulse.color}1A` }}>
          <MaterialCommunityIcons
            name={pulse.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={25}
            color={pulse.color}
          />
        </View>
      </View>

      <View className="mt-7 gap-3">
        <View className="flex-row gap-3">
          <PulseMetric label="Income" amount={dashboard.summary.total_income} />
          <PulseMetric label="Spent" amount={dashboard.summary.total_spent} />
        </View>
        {(dashboard.summary.total_invested ?? 0) > 0 ? (
          <>
            <View className="flex-row gap-3">
              <PulseMetric label="Invested" amount={dashboard.summary.total_invested ?? 0} />
              <PulseMetric
                label={surplus >= 0 ? 'Surplus' : 'Over income'}
                amount={Math.abs(surplus)}
              />
            </View>
            <View className="flex-row gap-3">
              <PulseMetric label="Daily avg" amount={dashboard.summary.daily_average} />
              <View className="flex-1" />
            </View>
          </>
        ) : (
          <View className="flex-row gap-3">
            <PulseMetric
              label={surplus >= 0 ? 'Surplus' : 'Over income'}
              amount={Math.abs(surplus)}
            />
            <PulseMetric label="Daily avg" amount={dashboard.summary.daily_average} />
          </View>
        )}
      </View>

      <View
        className="mt-5 rounded-2xl border p-3"
        style={{ backgroundColor: accentSurface, borderColor: theme.colors.border }}>
        <View className="flex-row items-start">
          <View
            className="mr-3 h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.colors.card }}>
            <MaterialCommunityIcons name="timer-sand" size={16} color={theme.colors.accent} />
          </View>
          <View className="flex-1">
            <ThemedText className="text-xs leading-5">
              <ThemedText className="text-xs font-black" style={{ color: theme.colors.accent }}>
                Why this status:{' '}
              </ThemedText>
              {getBurnRateCopy(dashboard)}
            </ThemedText>
          </View>
        </View>
      </View>

      <View className="mt-4 flex-row items-start gap-3">
        <ThemedText tone="muted" className="flex-1 text-[11px] font-bold">
          Insight depth grows as Finnri sees more transactions, merchants, and accounts.
        </ThemedText>
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: accentSurface, flexShrink: 0 }}>
          <ThemedText className="text-[10px] font-black" style={{ color: theme.colors.accent }}>
            L{insightLevel}/4
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

/**
 * The way into the monthly review that is not a notification.
 *
 * A screen reachable only from a push is a screen most people never see: the
 * notification can be missed, dismissed, or switched off entirely, and the
 * review is still the most interesting page in the app on the 1st. It sits
 * under the weekly teaser because they answer the same question at two
 * different distances.
 *
 * It carries no figures. The card would have to fetch the month to show one,
 * and a teaser that loads a whole review to render a subtitle is a request
 * charged to every visit to this tab, for a line nobody reads twice.
 */
function MonthlyReviewTeaser() {
  const theme = useThemeTokens();
  const lastMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }, []);
  const label = lastMonth.toLocaleDateString('en-IN', { month: 'long' });

  return (
    <TouchableOpacity
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open the ${label} review`}
      onPress={() =>
        router.push({
          pathname: '/monthly-review',
          params: {
            month: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
          },
        })
      }
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start">
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: theme.colors.secondary }}>
          <MaterialCommunityIcons name="calendar-month" size={23} color={theme.colors.accent} />
        </View>
        <View className="flex-1">
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            Monthly Review
          </ThemedText>
          <ThemedText className="mt-1 text-base font-black">{label} in review</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-5">
            The finished month, with what changed and a summary you can share.
          </ThemedText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.accent} />
      </View>
    </TouchableOpacity>
  );
}

function WeeklyReviewTeaser({
  dashboard,
  rangeLabel,
}: {
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  const theme = useThemeTokens();
  const budgetRisks = dashboard.budget_statuses?.filter((budget) => budget.status !== 'safe').length ?? 0;
  const recurringCount = dashboard.recurring_candidates.length;
  const warningCount = dashboard.insights.filter((insight) => insight.severity === 'warning').length;

  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={() =>
        router.push({
          pathname: '/weekly-review',
          params: {
            start: dashboard.period.start,
            end: dashboard.period.end,
            label: rangeLabel,
          },
        })
      }
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start">
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: theme.colors.secondary }}>
          <MaterialCommunityIcons name="file-chart-outline" size={23} color={theme.colors.accent} />
        </View>
        <View className="flex-1">
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            Weekly Review
          </ThemedText>
          <ThemedText className="mt-1 text-base font-black">Review the money story</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-5">
            {budgetRisks} budget risk{budgetRisks === 1 ? '' : 's'} · {recurringCount} recurring · {warningCount} alert{warningCount === 1 ? '' : 's'}
          </ThemedText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.accent} />
      </View>
    </TouchableOpacity>
  );
}

function AllClearCard({ dashboard }: { dashboard: DashboardResponse }) {
  const theme = useThemeTokens();
  const topCategory = dashboard.top_categories[0];
  const surplus = dashboard.summary.total_income - moneyOutOf(dashboard.summary);

  return (
    <View
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start">
        <View
          className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: '#DCFCE7' }}>
          <MaterialCommunityIcons name="check-decagram" size={24} color="#16A34A" />
        </View>
        <View className="flex-1">
          <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
            All clear
          </ThemedText>
          <ThemedText className="mt-1 text-lg font-black">No urgent actions right now</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-5">
            Categories and accounts look clean, budgets are safe, and there are no warning alerts for this period.
          </ThemedText>
        </View>
      </View>
      <View className="mt-4 flex-row gap-3">
        <PulseMetric
          label={surplus >= 0 ? 'Surplus' : 'Over income'}
          amount={Math.abs(surplus)}
        />
        {/* The fallback is a figure and the real thing is a category name, so
            this is two different metrics wearing one label rather than one
            metric with an optional format. */}
        {topCategory ? (
          <PulseMetric label="Top spend" value={topCategory.category} />
        ) : (
          <PulseMetric label="Top spend" amount={dashboard.summary.daily_average} />
        )}
      </View>
    </View>
  );
}

/**
 * One figure of the period summary.
 *
 * `amount` counts up from zero; `value` is for the cases that are not money at
 * all — a category name has nothing to count towards, and animating it would be
 * decoration rather than the arrival of an answer.
 */
function PulseMetric({
  label,
  value,
  amount,
}: {
  label: string;
  value?: string;
  amount?: number;
}) {
  const theme = useThemeTokens();

  return (
    <View
      className="flex-1 rounded-2xl border px-4 py-3"
      style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}>
      <ThemedText tone="muted" className="text-[10px] font-black uppercase">{label}</ThemedText>
      {amount == null ? (
        <ThemedText className={PULSE_VALUE_CLASS} numberOfLines={1}>
          {value}
        </ThemedText>
      ) : (
        <CountUpMoney amount={amount} className={PULSE_VALUE_CLASS} numberOfLines={1} />
      )}
    </View>
  );
}

/** Shared so the counting figure and the static one cannot drift apart. */
const PULSE_VALUE_CLASS = 'mt-1 text-sm font-black';

/**
 * Spending Analysis — the section this tab was missing.
 *
 * It used to be one card: a ring drawn from the single largest category with
 * that category's share printed in the middle, the top two categories beside
 * it, and two merchants underneath. Nothing on the screen showed spending over
 * time, and the ring showed a part while looking like a whole.
 *
 * It is now the two charts the data always supported — a bar per day against
 * the daily average, and a donut over the complete category breakdown — with
 * the merchant list kept as it was.
 */
function SpendingAnalysisCard({
  dashboard,
  onDetails,
}: {
  dashboard: DashboardResponse;
  onDetails: () => void;
}) {
  const theme = useThemeTokens();
  const merchants = dashboard.top_merchants.slice(0, 2);

  return (
    <SectionHeader title="Spending Analysis" actionLabel="Details" onAction={onDetails}>
      <View className="gap-4">
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

        {dashboard.summary.total_spent > 0 && (
          <CategoryDonut
            categories={dashboard.top_categories}
            totalSpent={dashboard.summary.total_spent}
            period={dashboard.period}
            onSelectCategory={(category) =>
              openFilteredTransactions({
                category,
                startDate: dashboard.period.start,
                endDate: dashboard.period.end,
                type: 'Expense',
              })
            }
          />
        )}

        {merchants.length > 0 && (
          <View
            className="rounded-[24px] border p-5 shadow-sm"
            style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
            <ThemedText tone="muted" className="mb-2 text-[10px] font-black uppercase tracking-widest">
              Top Merchants
            </ThemedText>
            {merchants.map((merchant) => (
              <MerchantRow key={merchant.merchant} merchant={merchant} />
            ))}
          </View>
        )}
      </View>
    </SectionHeader>
  );
}

function MerchantRow({ merchant }: { merchant: DashboardResponse['top_merchants'][number] }) {
  const theme = useThemeTokens();

  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-2"
      onPress={() =>
        router.push({
          pathname: '/merchant-history',
          params: { merchant: merchant.merchant },
        })
      }>
      <View className="flex-row items-center">
        <View
          className="mr-3 h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: theme.colors.secondary }}>
          <MaterialCommunityIcons name="storefront-outline" size={16} color={theme.colors.accent} />
        </View>
        <View>
          <ThemedText className="text-xs font-bold">{merchant.merchant}</ThemedText>
          <ThemedText tone="muted" className="text-[10px]">
            {merchant.transaction_count} transactions
          </ThemedText>
        </View>
      </View>
      <ThemedText className="text-xs font-black">{formatMoney(merchant.amount)}</ThemedText>
    </TouchableOpacity>
  );
}

const insightDetailParams = (
  card: InsightCard,
  dashboard: DashboardResponse,
  rangeLabel: string
) => {
  const params: Record<string, string> = {
    kind: card.kind,
    severity: card.severity,
    title: card.title,
    body: card.body,
    start: dashboard.period.start,
    end: dashboard.period.end,
    label: rangeLabel,
  };

  if (card.kind === 'category_increase') {
    const categoryName = card.category ?? card.title.replace(/\s+increased$/i, '').trim();
    const category =
      dashboard.top_categories.find((item) => item.category.toLowerCase() === categoryName.toLowerCase()) ??
      dashboard.top_categories[0];
    if (category) {
      params.category = category.category;
    }
  }
  if (card.category) params.category = card.category;
  if (card.budget_id != null) params.budgetId = String(card.budget_id);
  if (card.amount != null) params.amount = String(card.amount);
  if (card.limit_amount != null) params.limitAmount = String(card.limit_amount);
  if (card.remaining_amount != null) params.remainingAmount = String(card.remaining_amount);
  if (card.status) params.status = card.status;
  if (card.percentage != null) params.percentage = String(card.percentage);
  if (card.change_percentage != null) params.change = String(card.change_percentage);
  if (card.explanation) params.explanation = card.explanation;
  if (card.action_label) params.actionLabel = card.action_label;

  if (card.kind === 'top_merchant') {
    const merchant = card.merchant
      ? dashboard.top_merchants.find((item) => item.merchant === card.merchant)
      : dashboard.top_merchants[0];
    if (merchant) {
      params.merchant = merchant.merchant;
    }
  }
  if (card.merchant) params.merchant = card.merchant;
  if (card.transaction_count != null) params.transactionCount = String(card.transaction_count);

  if (card.kind === 'account_usage') {
    const account = card.account_id != null
      ? dashboard.account_spending.find((item) => item.account_id === card.account_id)
      : dashboard.account_spending[0];
    if (account) {
      params.accountName = account.account_name;
      if (account.account_id != null) params.accountId = String(account.account_id);
    }
  }
  if (card.account_name) params.accountName = card.account_name;
  if (card.account_id != null) params.accountId = String(card.account_id);

  if (card.kind === 'recurring_candidate') {
    const candidate = card.merchant
      ? dashboard.recurring_candidates.find((item) => item.merchant === card.merchant)
      : dashboard.recurring_candidates[0];
    if (candidate) {
      params.merchant = candidate.merchant;
      params.category = candidate.category;
    }
  }
  if (card.next_expected_date) params.nextExpectedDate = card.next_expected_date;
  if (card.confidence != null) params.confidence = String(card.confidence);

  if (card.kind === 'unusual_spending' && !params.amount) {
    const match = card.body.match(new RegExp(`${CURRENCY_SYMBOL}([\\d,.]+)`));
    if (match?.[1]) params.amount = match[1].replace(/,/g, '');
  }

  return params;
};

function SmartAlerts({
  cards,
  dashboard,
  rangeLabel,
}: {
  cards: InsightCard[];
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  if (cards.length === 0) return null;

  return (
    <SectionHeader title="Smart Alerts">
      <View className="gap-3">
        {cards.slice(0, 3).map((card) => (
          <AlertCard
            key={card.kind}
            card={card}
            params={insightDetailParams(card, dashboard, rangeLabel)}
          />
        ))}
      </View>
    </SectionHeader>
  );
}

function RecurringReviewTeaser({
  dashboard,
  rangeLabel,
}: {
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  const theme = useThemeTokens();
  const dueCount = dashboard.recurring_candidates.filter((candidate) => candidate.review_due).length;
  const topCandidate = dashboard.recurring_candidates[0];

  return (
    <SectionHeader
      title="Recurring Review"
      actionLabel="Review"
      onAction={() =>
        router.push({
          pathname: '/recurring-review',
          params: {
            start: dashboard.period.start,
            end: dashboard.period.end,
            label: rangeLabel,
          },
        })
      }>
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() =>
          router.push({
            pathname: '/recurring-review',
            params: {
              start: dashboard.period.start,
              end: dashboard.period.end,
              label: rangeLabel,
              merchant: topCandidate?.merchant ?? '',
            },
          })
        }
        className="rounded-[24px] border p-5 shadow-sm"
        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
        <View className="flex-row items-start">
          <View
            className="mr-4 h-12 w-12 items-center justify-center rounded-2xl"
            style={{ backgroundColor: theme.colors.secondary }}>
            <MaterialCommunityIcons name="repeat-variant" size={23} color={theme.colors.accent} />
          </View>
          <View className="flex-1">
            <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
              {dueCount > 0 ? `${dueCount} due now` : `${dashboard.recurring_candidates.length} detected`}
            </ThemedText>
            <ThemedText className="mt-1 text-base font-black">
              {topCandidate?.label ?? 'Recurring patterns'}
            </ThemedText>
            <ThemedText tone="muted" className="mt-1 text-xs leading-5">
              Confirm repeated spends before Finnri tracks them as subscriptions.
            </ThemedText>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.accent} />
        </View>
      </TouchableOpacity>
    </SectionHeader>
  );
}

function BudgetWatchSection({
  dashboard,
  rangeLabel,
}: {
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  const visible = dashboard.budget_statuses
    .filter((budget) => budget.status !== 'safe')
    .slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <SectionHeader title="Budgets">
      <View className="gap-3">
        {visible.map((budget) => (
          <BudgetWatchCard
            key={budget.budget_id}
            budget={budget}
            periodStart={dashboard.period.start}
            periodEnd={dashboard.period.end}
            rangeLabel={rangeLabel}
          />
        ))}
      </View>
    </SectionHeader>
  );
}

function BudgetWatchCard({
  budget,
  periodStart,
  periodEnd,
  rangeLabel,
}: {
  budget: DashboardResponse['budget_statuses'][number];
  periodStart: string;
  periodEnd: string;
  rangeLabel: string;
}) {
  const theme = useThemeTokens();
  const exceeded = budget.status === 'exceeded';
  const color = exceeded ? '#FF6680' : '#FFB020';
  const label = budget.category || budget.name;
  const kind = exceeded ? 'budget_exceeded' : 'budget_watch';
  const title = exceeded ? `${label} budget exceeded` : `${label} budget nearing limit`;
  const body = `${formatMoney(budget.spent_amount)} of ${formatMoney(budget.limit_amount)} used with ${budget.days_left} day${budget.days_left === 1 ? '' : 's'} left.`;

  return (
    <View
      className="rounded-[24px] border p-5 shadow-sm"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${color}1A` }}>
              <ThemedText className="text-[10px] font-black uppercase" style={{ color }}>
                {exceeded ? 'Exceeded' : 'Watch'}
              </ThemedText>
            </View>
            <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
              {budget.days_left} day{budget.days_left === 1 ? '' : 's'} left
            </ThemedText>
          </View>
          <ThemedText className="mt-3 text-base font-black">{label}</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-5">
            {formatMoney(budget.spent_amount)} of {formatMoney(budget.limit_amount)} used
          </ThemedText>
        </View>
        <ThemedText className="text-xl font-black" style={{ color }}>
          {Math.round(budget.percentage)}%
        </ThemedText>
      </View>

      <View className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <View
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, budget.percentage)}%`, backgroundColor: color }}
        />
      </View>

      <View className="mt-4 flex-row gap-2">
        <PillButton
          label="Review"
          muted
          onPress={() =>
            router.push({
              pathname: '/insight-detail',
              params: {
                kind,
                severity: 'warning',
                title,
                body,
                explanation:
                  'This compares confirmed expenses in the selected period against your active monthly budget.',
                actionLabel: budget.category ? 'Open category' : 'Review transactions',
                start: periodStart,
                end: periodEnd,
                label: rangeLabel,
                budgetId: String(budget.budget_id),
                category: budget.category,
                amount: String(budget.spent_amount),
                limitAmount: String(budget.limit_amount),
                remainingAmount: String(budget.remaining_amount),
                percentage: String(budget.percentage),
                status: budget.status,
              },
            })
          }
        />
        <PillButton
          label="Adjust"
          onPress={() =>
            router.push({
              pathname: '/budgets',
              params: {
                source: 'insight',
                budgetId: String(budget.budget_id),
                category: budget.category,
                suggestedLimit: String(Math.max(budget.limit_amount, budget.spent_amount)),
              },
            })
          }
        />
      </View>
    </View>
  );
}

function AlertCard({ card, params }: { card: InsightCard; params: Record<string, string> }) {
  const theme = useThemeTokens();
  const isWarning = card.severity === 'warning';
  const color = isWarning ? '#FF6680' : card.severity === 'success' ? '#00B878' : theme.colors.accent;
  const icon = isWarning
    ? 'calendar-alert'
    : card.severity === 'success'
      ? 'check-decagram'
      : 'creation';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => router.push({ pathname: '/insight-detail', params })}
      className="rounded-[22px] border p-4 shadow-sm"
      style={{
        backgroundColor: theme.colors.card,
        borderLeftColor: color,
        borderLeftWidth: 3,
        borderColor: theme.colors.border,
      }}>
      <View className="flex-row">
        <View
          className="mr-3 h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: isWarning ? '#FFF3F5' : theme.colors.secondary }}>
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
        <View className="flex-1">
          <ThemedText className="text-sm font-black">{card.title}</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-4">{card.body}</ThemedText>
          {isWarning && (
            <View className="mt-3 flex-row gap-2">
              <PillButton
                label="View Details"
                muted
                onPress={() => router.push({ pathname: '/insight-detail', params })}
              />
              {params.category && (
                <PillButton
                  label="Set Limit"
                  onPress={() =>
                    router.push({
                      pathname: '/budgets',
                      params: {
                        source: 'insight',
                        budgetId: params.budgetId ?? '',
                        category: params.category,
                        suggestedLimit: params.amount ?? '',
                      },
                    })
                  }
                />
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PillButton({
  label,
  muted,
  onPress,
}: {
  label: string;
  muted?: boolean;
  onPress?: () => void;
}) {
  const theme = useThemeTokens();

  return (
    <TouchableOpacity
      onPress={onPress}
      className="rounded-lg px-3 py-2"
      style={{ backgroundColor: muted ? (theme.mode === 'dark' ? '#333333' : '#F3F3F3') : theme.colors.accent }}>
      <ThemedText
        className="text-[10px] font-black"
        style={{ color: muted ? theme.colors.text : '#FFFFFF' }}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

function AccountIntelligence({ dashboard }: { dashboard: DashboardResponse }) {
  const theme = useThemeTokens();
  const topCategory = dashboard.top_categories[0]?.category ?? 'Not enough data';
  return (
    <SectionHeader title="Account Intelligence">
      <View
        className="rounded-[24px] border p-5 shadow-sm"
        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
        {dashboard.account_spending.slice(0, 3).map((account) => (
          <View key={account.account_id ?? account.account_name} className="mb-4">
            <View className="mb-2 flex-row items-center justify-between">
              <ThemedText className="text-sm">{account.account_name}</ThemedText>
              <ThemedText tone="muted" className="text-xs">
                {formatMoney(account.amount)} spent
              </ThemedText>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-gray-100">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(account.percentage, 100)}%`,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
          </View>
        ))}

        <View className="mt-2 flex-row gap-3">
          <MiniMetric
            icon="calendar-blank-outline"
            label="Daily Average"
            value={formatMoney(dashboard.summary.daily_average)}
          />
          <MiniMetric icon="chart-bar" label="Top Category" value={topCategory} />
        </View>
      </View>
    </SectionHeader>
  );
}

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  const theme = useThemeTokens();

  return (
    <View
      className="flex-1 rounded-2xl border p-4"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <MaterialCommunityIcons name={icon} size={20} color={theme.colors.accent} />
      <ThemedText tone="muted" className="mt-3 text-[11px]">{label}</ThemedText>
      <ThemedText className="mt-1 text-sm font-black" numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function NeedsReview({
  entries,
  totalCount,
  periodStart,
  periodEnd,
  onLinked,
}: {
  entries: DashboardResponse['recent_transactions'];
  totalCount: number;
  periodStart: string;
  periodEnd: string;
  onLinked: () => void;
}) {
  const theme = useThemeTokens();
  const { token } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pickerEntryID, setPickerEntryID] = useState<string | number | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !entries.some((entry) => !entry.account_id)) return;
    void fetchAccounts(token).then(setAccounts).catch(() => setAccounts([]));
  }, [entries, token]);

  const linkAccount = async (entryID: string | number, account: Account) => {
    if (!token || linking) return;
    setLinking(true);
    setLinkError(null);
    try {
      await linkEntryAccount(token, entryID, account.id);
      setPickerEntryID(null);
      onLinked();
    } catch (error) {
      setLinkError(getFriendlyErrorMessage(error, 'Unable to link this transaction right now.'));
    } finally {
      setLinking(false);
    }
  };

  return (
    <SectionHeader
      title="Needs Review"
      actionLabel={totalCount > entries.length ? `View all ${totalCount}` : `${totalCount} Items`}
      onAction={() =>
        router.push({
          pathname: '/transactions',
          params: {
            review: '1',
            start_date: periodStart,
            end_date: periodEnd,
          },
        })
      }>
      <View
        className="overflow-hidden rounded-[24px] border shadow-sm"
        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
        {entries.map((entry, index) => {
          const reasons = getReviewReasons(entry);
          return (
            <TouchableOpacity
              key={entry.id ?? `${entry.date}-${index}`}
              activeOpacity={0.78}
              disabled={entry.id == null}
              onPress={() => openDashboardEntryForReview(entry)}
              className={`p-4 ${index < entries.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
              <View className="flex-row items-start">
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                  <MaterialCommunityIcons name="help" size={16} color="#9B9692" />
                </View>
                <View className="min-w-0 flex-1 pr-3">
                  <ThemedText className="text-sm font-bold" numberOfLines={1}>
                    {entry.title || entry.merchant || entry.category || 'Transaction'}
                  </ThemedText>
                  <ThemedText tone="muted" className="mt-0.5 text-[11px]">
                    {entry.date || 'No date recorded'}
                  </ThemedText>
                </View>
                <View className="items-end">
                  <ThemedText className="text-sm font-black">
                    {formatMoney(Number(entry.amount || 0))}
                  </ThemedText>
                  <ThemedText className="mt-1 text-[10px] font-bold" style={{ color: theme.colors.accent }}>
                    Resolve
                  </ThemedText>
                </View>
              </View>
              <View className="ml-12 mt-3 flex-row flex-wrap gap-2">
                {reasons.map((reason) => (
                  <View
                    key={reason.label}
                    className="flex-row items-center rounded-full px-2.5 py-1"
                    style={{ backgroundColor: theme.colors.secondary }}>
                    <MaterialCommunityIcons
                      name={reason.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={12}
                      color={theme.colors.accent}
                    />
                    <ThemedText className="ml-1 text-[10px] font-black" style={{ color: theme.colors.accent }}>
                      {reason.label}
                    </ThemedText>
                  </View>
                ))}
              </View>
              {!entry.account_id && entry.id != null ? (
                <View className="ml-12 mt-3">
                  <Pressable
                    accessibilityRole="button"
                    onPress={(event) => {
                      event.stopPropagation();
                      setLinkError(null);
                      setPickerEntryID((current) => (current === entry.id ? null : entry.id!));
                    }}
                    className="self-start rounded-full px-3 py-2"
                    style={{ backgroundColor: theme.colors.accent }}>
                    <ThemedText tone="onAccent" className="text-[11px] font-black">
                      Choose account
                    </ThemedText>
                  </Pressable>
                  {pickerEntryID === entry.id ? (
                    <View className="mt-3 gap-2 rounded-2xl p-3" style={{ backgroundColor: theme.colors.secondary }}>
                      {accounts.length > 0 ? (
                        accounts.map((account) => (
                          <Pressable
                            key={account.id}
                            accessibilityRole="button"
                            disabled={linking}
                            onPress={(event) => {
                              event.stopPropagation();
                              void linkAccount(entry.id!, account);
                            }}
                            className="flex-row items-center justify-between rounded-xl px-3 py-2"
                            style={{ backgroundColor: theme.colors.card }}>
                            <ThemedText className="text-xs font-bold">{account.name}</ThemedText>
                            {linking ? (
                              <ActivityIndicator size="small" color={theme.colors.accent} />
                            ) : (
                              <MaterialCommunityIcons name="link-variant" size={16} color={theme.colors.accent} />
                            )}
                          </Pressable>
                        ))
                      ) : (
                        <Pressable
                          onPress={(event) => {
                            event.stopPropagation();
                            router.push('/money?segment=accounts');
                          }}>
                          <ThemedText className="text-xs font-bold" style={{ color: theme.colors.accent }}>
                            Set up an account first
                          </ThemedText>
                        </Pressable>
                      )}
                      {linkError ? (
                        <ThemedText tone="negative" className="text-xs">{linkError}</ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
            </View>
    </SectionHeader>
  );
}

function InsightsUnlockProgressCard({ count }: { count: number }) {
  const theme = useThemeTokens();
  const progress = Math.min(3, Math.max(0, count));
  return (
    <View
      className="rounded-[28px] border p-6"
      style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
      <View
        className="h-12 w-12 items-center justify-center rounded-2xl"
        style={{ backgroundColor: theme.colors.secondary }}>
        <MaterialCommunityIcons name="chart-box-plus-outline" size={24} color={theme.colors.accent} />
      </View>
      <ThemedText className="mt-4 text-lg font-black">Add 3 transactions to unlock insights</ThemedText>
      <ThemedText tone="muted" className="mt-2 text-xs leading-5">
        A few real entries are enough for Finnri to start showing useful patterns.
      </ThemedText>
      <View className="mt-5 h-2 overflow-hidden rounded-full" style={{ backgroundColor: theme.colors.secondary }}>
        <View
          className="h-full rounded-full"
          style={{ backgroundColor: theme.colors.accent, width: `${(progress / 3) * 100}%` }}
        />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <ThemedText tone="muted" className="text-[11px] font-bold">{progress}/3 added</ThemedText>
        <ThemedText className="text-[11px] font-black" style={{ color: theme.colors.accent }}>
          {Math.max(0, 3 - progress)} to go
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(tabs)')}
        className="mt-5 items-center rounded-full py-3"
        style={{ backgroundColor: theme.colors.accent }}>
        <ThemedText tone="onAccent" className="text-sm font-black">Add transaction</ThemedText>
      </Pressable>
    </View>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  const theme = useThemeTokens();

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between px-1">
        <ThemedText className="text-lg font-black">{title}</ThemedText>
        {actionLabel && (
          <TouchableOpacity onPress={onAction}>
            <ThemedText className="text-xs font-bold" style={{ color: theme.colors.accent }}>
              {actionLabel}
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}
