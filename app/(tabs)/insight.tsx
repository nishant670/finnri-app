import { router, useFocusEffect, useLocalSearchParams, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyPeriodCard } from '@/components/insights/EmptyPeriodCard';
import { OverviewBand } from '@/components/insights/OverviewBand';
import { DateRange, PeriodPicker } from '@/components/insights/PeriodPicker';
import { InsightsSkeleton } from '@/components/insights/InsightsSkeleton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { DashboardResponse, fetchDashboard } from '@/lib/insights';
import {
  periodIsEmptyButAccountIsNot,
  rangeForOverviewMonth,
  selectedMonthKey,
} from '@/lib/insights-periods';
import { subscribeTransactionsChanged } from '@/lib/transaction-events';
import { formatApiDate } from '@/lib/transactions';

import { AccountIntelligence } from '@/components/insights/AccountIntelligence';
import { AllClearCard } from '@/components/insights/AllClearCard';
import { BudgetWatchSection } from '@/components/insights/BudgetWatch';
import { InsightsHeader } from '@/components/insights/InsightsHeader';
import { InsightsUnlockProgressCard } from '@/components/insights/InsightsUnlockProgressCard';
import { NeedsReview } from '@/components/insights/NeedsReview';
import { PeriodPulseCard } from '@/components/insights/PeriodPulseCard';
import { Reflow } from '@/components/insights/Reflow';
import {
  MonthlyReviewTeaser,
  RecurringReviewTeaser,
  WeeklyReviewTeaser,
} from '@/components/insights/ReviewTeasers';
import { SmartAlerts } from '@/components/insights/SmartAlerts';
import { SpendingAnalysisCard } from '@/components/insights/SpendingAnalysisCard';
import { TopTakeawayCard } from '@/components/insights/TopTakeawayCard';
import { getInsightLevel, getNeedsReview, getTopTakeaway } from '@/lib/insight-summary';

const defaultRange = (): DateRange => {
  const current = new Date();
  return {
    start: new Date(current.getFullYear(), current.getMonth(), 1),
    end: current,
    label: current.toLocaleString('default', { month: 'long', year: 'numeric' }),
    preset: 'this_month',
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
              count={
                dashboard.summary.lifetime_transaction_count ?? dashboard.summary.transaction_count
              }
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

        {insightLevel >= 3 &&
          dashboard.budget_statuses?.some((budget) => budget.status !== 'safe') && (
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
