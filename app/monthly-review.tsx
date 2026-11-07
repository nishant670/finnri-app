import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BarRow,
  Eyebrow,
  InsightCard,
  MetricStrip,
  MonogramTile,
  NavRow,
  insightText,
} from '@/components/insights/insight-ui';
import { SectionHeader } from '@/components/insights/SectionHeader';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ReviewPeriodSwitch } from '@/components/insights/ReviewPeriodSwitch';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ListRow } from '@/components/ui/ListRow';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryVisual } from '@/lib/categories';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatChangeMagnitude } from '@/lib/insights';
import { formatMoney } from '@/lib/money';
import {
  describeMonthlyChange,
  fetchMonthlyReview,
  monthlyReviewShareText,
  type MonthlyReview,
} from '@/lib/monthly-review';
import { haptics } from '@/lib/haptics';
import { openFilteredTransactions } from '@/lib/transaction-links';

/**
 * The month, once it is over.
 *
 * Built on `weekly-review.tsx`'s shape — header, hero figure, sections of rows
 * — because the two are the same kind of screen and a second visual language
 * for "here is a period summarised" would be one more thing to keep in step.
 *
 * The figures are recomputed from the ledger, not replayed from the
 * notification. A month can still be edited after it closes, and when the two
 * disagree the ledger is right; the notification was true when it was sent.
 */

const toParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** "2026-08-13" → "13 Aug". Dates, not money, so this is local formatting. */
const shortDate = (value: string) => {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function MonthlyReviewScreen() {
  const params = useLocalSearchParams();
  const month = toParam(params.month);
  const theme = useThemeTokens();
  const colors = theme.colors;
  const { token } = useAuthStore();

  const [review, setReview] = useState<MonthlyReview | null>(null);
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
      setReview(await fetchMonthlyReview(token, month));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load this month’s review.'));
    } finally {
      setLoading(false);
    }
  }, [month, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const share = useCallback(async () => {
    if (!review) return;
    haptics.select();
    await Share.share({
      title: `${review.label} on Finnri`,
      message: monthlyReviewShareText(review),
    });
  }, [review]);

  const openMonth = useCallback(
    (category?: string) => {
      if (!review) return;
      haptics.select();
      openFilteredTransactions({
        category,
        startDate: review.start_date,
        endDate: review.end_date,
        type: 'Expense',
      });
    },
    [review]
  );

  const comparison = review ? describeMonthlyChange(review) : null;
  const net = review ? review.summary.total_income - review.summary.total_spent : 0;
  // The headline pairs this with a spend total, so it counts the rows that
  // total is made of. `transaction_count` includes income, which made the two
  // halves of the sentence describe different sets of rows. The fallback keeps
  // an older backend readable rather than rendering "across undefined".
  const spentAcross = review
    ? (review.summary.expense_count ?? review.summary.transaction_count)
    : 0;

  const monthName = review?.label.split(' ')[0] ?? 'the month';
  const change = review?.summary.spend_change ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Review"
        subtitle={review?.label ?? 'Last month'}
        onBack={() => router.back()}
        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
        rightNode={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={review?.available ? 'Share this month' : 'Reload'}
            onPress={review?.available ? share : load}
            style={styles.headerIcon}>
            <MaterialCommunityIcons
              name={review?.available ? 'share-variant-outline' : 'refresh'}
              size={24}
              color={colors.text}
            />
          </Pressable>
        }
      />
      <ReviewPeriodSwitch active="month" />

      {loading && !review ? (
        <SkeletonFrame
          label="Loading monthly review"
          testID="monthly-review-skeleton"
          style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
          <SkeletonCards count={4} lines={3} radius={16} />
        </SkeletonFrame>
      ) : !review ? (
        <View style={styles.center}>
          <StateView
            icon={error ? 'wifi-off' : 'calendar-month'}
            title={error ? 'Review did not load' : 'No review yet'}
            message={error || 'A review appears once a month has finished.'}
            actionLabel="Try again"
            onAction={load}
          />
        </View>
      ) : !review.available ? (
        // A month with almost nothing in it gets told so plainly. Rendering a
        // story about ₹0 across 1 transaction would be worse than saying there
        // is nothing to tell.
        <View style={styles.center}>
          <StateView
            icon="calendar-blank"
            title={`Not much to review in ${review.label}`}
            message="Finnri needs a few transactions in a month before it can tell you anything you did not already know."
            actionLabel="See the month"
            onAction={() => openMonth()}
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {error && <ErrorBanner message={error} onRetry={load} />}

          <InsightCard>
            <Eyebrow>Spent in {monthName}</Eyebrow>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[insightText.figure, { color: colors.text }]}>
              {formatMoney(review.summary.total_spent)}
            </ThemedText>
            <ThemedText tone="muted" style={insightText.body}>
              {spentAcross} expense{spentAcross === 1 ? '' : 's'}
              {comparison ? ' · ' : ''}
              {comparison ? (
                <ThemedText
                  style={[
                    insightText.body,
                    styles.bold,
                    { color: change < 0 ? colors.positive : colors.negative },
                  ]}>
                  {comparison}
                </ThemedText>
              ) : null}
            </ThemedText>

            <MetricStrip
              items={[
                { label: 'Income', value: formatMoney(review.summary.total_income) },
                {
                  label: net >= 0 ? 'Kept' : 'Over by',
                  value: formatMoney(Math.abs(net)),
                  tone: net >= 0 ? 'positive' : 'negative',
                },
                { label: 'Per day', value: formatMoney(review.summary.daily_average) },
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`See the ${review.summary.transaction_count} transactions`}
              onPress={() => openMonth()}
              hitSlop={8}
              style={styles.link}>
              <ThemedText style={[styles.linkLabel, { color: colors.text }]}>
                See {monthName}’s transactions
              </ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
            </Pressable>
          </InsightCard>

          {review.biggest_change && (
            <SectionHeader title="The month’s story">
              <InsightCard flush>
                <NavRow
                  icon={review.biggest_change.direction === 'lower' ? 'trending-down' : 'trending-up'}
                  hue={review.biggest_change.direction === 'lower' ? colors.positive : colors.negative}
                  title={`${review.biggest_change.category} went ${review.biggest_change.direction}`}
                  body={
                    review.biggest_change.comparable
                      ? `${formatMoney(review.biggest_change.previous_amount)} in ${review.previous_label} → ${formatMoney(review.biggest_change.amount)} · ${formatChangeMagnitude(review.biggest_change.change)} ${review.biggest_change.direction}`
                      : `${formatMoney(review.biggest_change.amount)} this month, with nothing comparable in ${review.previous_label}`
                  }
                  onPress={() => openMonth(review.biggest_change?.category)}
                />
                {review.busiest_day && (
                  <ListRow
                    icon="calendar-star"
                    hue={colors.neutral}
                    title={`Busiest day: ${shortDate(review.busiest_day.date)}`}
                    meta={`${formatMoney(review.busiest_day.amount)} across ${review.busiest_day.count} transaction${review.busiest_day.count === 1 ? '' : 's'}`}
                    divider
                  />
                )}
              </InsightCard>
            </SectionHeader>
          )}

          {review.top_categories.length > 0 && (
            <SectionHeader title="Where it went">
              <InsightCard flush>
                {review.top_categories.slice(0, 5).map((category, index) => {
                  // The same icon map every other surface uses: the category
                  // is the thing being named, so it should look the way it
                  // looks everywhere else.
                  const visual = categoryVisual(category.category);
                  return (
                    <BarRow
                      key={category.category}
                      icon={visual.icon}
                      hue={visual.color}
                      title={category.category}
                      amount={formatMoney(category.amount)}
                      fraction={category.percentage / 100}
                      caption={`${Math.round(category.percentage)}% of spend${
                        category.change_comparable
                          ? ` · ${formatChangeMagnitude(category.change)} ${category.change < 0 ? 'lower' : 'higher'}`
                          : ''
                      }`}
                      divider={index > 0}
                      onPress={() => openMonth(category.category)}
                    />
                  );
                })}
              </InsightCard>
            </SectionHeader>
          )}

          {review.top_merchants.length > 0 && (
            <SectionHeader title="Who you paid">
              <InsightCard flush>
                {review.top_merchants.slice(0, 5).map((merchant, index) => (
                  <ListRow
                    key={merchant.merchant}
                    icon="storefront-outline"
                    hue={colors.neutral}
                    leading={<MonogramTile name={merchant.merchant} />}
                    title={merchant.merchant}
                    meta={`${merchant.transaction_count} transaction${merchant.transaction_count === 1 ? '' : 's'}`}
                    amount={formatMoney(merchant.amount)}
                    divider={index > 0}
                  />
                ))}
              </InsightCard>
            </SectionHeader>
          )}

          <Button
            variant="outline"
            icon="share-variant-outline"
            label="Share this month"
            accessibilityLabel={`Share your ${review.label} review`}
            onPress={share}
          />
        </ScrollView>
      )}
    </SafeAreaView>
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
  bold: {
    fontWeight: '700',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: 14,
  },
  linkLabel: {
    fontSize: 14,
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
