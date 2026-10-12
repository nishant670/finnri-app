import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
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
  const muted = `${colors.text}99`;
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Monthly review"
        subtitle={review?.label ?? 'Last month'}
        onBack={() => router.back()}
        rightIcon={review?.available ? 'share-variant' : 'refresh'}
        onRightPress={review?.available ? share : load}
      />

      {loading && !review ? (
        <SkeletonFrame
          label="Loading monthly review"
          testID="monthly-review-skeleton"
          style={{ paddingHorizontal: 20, paddingTop: 16, gap: 16 }}>
          <SkeletonCards count={4} lines={3} radius={28} />
        </SkeletonFrame>
      ) : !review ? (
        <View className="flex-1 justify-center">
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
        <View className="flex-1 justify-center">
          <StateView
            icon="calendar-blank"
            title={`Not much to review in ${review.label}`}
            message="Finnri needs a few transactions in a month before it can tell you anything you did not already know."
            actionLabel="See the month"
            onAction={() => openMonth()}
          />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 16 }}>
          {error && <ErrorBanner message={error} onRetry={load} />}

          <View
            className="rounded-[28px] border p-5 shadow-sm"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}>
            <ThemedText
              variant="micro"
              style={{ color: muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              {review.label}
            </ThemedText>
            {/* amountHero carries its own line height; a bare text-[Npx] would
                clip the comma out of ₹40,091. */}
            <ThemedText variant="amountHero" style={{ marginTop: 6, color: colors.text }}>
              {formatMoney(review.summary.total_spent)}
            </ThemedText>
            <ThemedText variant="caption" style={{ marginTop: 4, color: muted }}>
              across {spentAcross} transaction
              {spentAcross === 1 ? '' : 's'}
              {comparison ? ` · ${comparison}` : ''}
            </ThemedText>

            <View className="mt-5 flex-row gap-3">
              <MiniStat label="Income" value={formatMoney(review.summary.total_income)} />
              <MiniStat label={net >= 0 ? 'Kept' : 'Over by'} value={formatMoney(Math.abs(net))} />
              <MiniStat label="Per day" value={formatMoney(review.summary.daily_average)} />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => openMonth()}
              className="mt-4 self-start rounded-full px-4 py-2"
              style={{ backgroundColor: colors.secondary }}>
              <ThemedText variant="button" style={{ color: colors.accent }}>
                See the {review.summary.transaction_count} transactions
              </ThemedText>
            </Pressable>
          </View>

          {review.biggest_change && (
            <ReviewSection title="The month's story">
              <ReviewRow
                icon={review.biggest_change.direction === 'lower' ? 'trending-down' : 'trending-up'}
                title={`${review.biggest_change.category} went ${review.biggest_change.direction}`}
                body={
                  review.biggest_change.comparable
                    ? `${formatMoney(review.biggest_change.previous_amount)} in ${review.previous_label} → ${formatMoney(review.biggest_change.amount)} · ${formatChangeMagnitude(review.biggest_change.change)} ${review.biggest_change.direction}`
                    : `${formatMoney(review.biggest_change.amount)} this month, with nothing comparable in ${review.previous_label}`
                }
                onPress={() => openMonth(review.biggest_change?.category)}
              />
              {review.busiest_day && (
                <ReviewRow
                  icon="calendar-star"
                  title={`Busiest day: ${shortDate(review.busiest_day.date)}`}
                  body={`${formatMoney(review.busiest_day.amount)} across ${review.busiest_day.count} transaction${review.busiest_day.count === 1 ? '' : 's'}`}
                />
              )}
            </ReviewSection>
          )}

          {review.top_categories.length > 0 && (
            <ReviewSection title="Where it went">
              {review.top_categories.slice(0, 5).map((category) => (
                <ReviewRow
                  key={category.category}
                  // The same icon map every other surface uses. A single
                  // `shape-outline` for all five rows was X8's defect one
                  // screen over: the category is the thing being named, so it
                  // should look the way it looks everywhere else.
                  icon={categoryVisual(category.category).icon}
                  title={category.category}
                  body={`${formatMoney(category.amount)} · ${Math.round(category.percentage)}% of spend${
                    category.change_comparable
                      ? ` · ${formatChangeMagnitude(category.change)} ${category.change < 0 ? 'lower' : 'higher'}`
                      : ''
                  }`}
                  onPress={() => openMonth(category.category)}
                />
              ))}
            </ReviewSection>
          )}

          {review.top_merchants.length > 0 && (
            <ReviewSection title="Who you paid">
              {review.top_merchants.slice(0, 5).map((merchant) => (
                <ReviewRow
                  key={merchant.merchant}
                  icon="storefront-outline"
                  title={merchant.merchant}
                  body={`${formatMoney(merchant.amount)} across ${merchant.transaction_count} transaction${merchant.transaction_count === 1 ? '' : 's'}`}
                />
              ))}
            </ReviewSection>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share your ${review.label} review`}
            onPress={share}
            className="flex-row items-center justify-center gap-2 rounded-[24px] px-5 py-4"
            style={{ backgroundColor: colors.accent }}>
            <MaterialCommunityIcons name="share-variant" size={18} color={colors.onAccent} />
            <ThemedText variant="button" style={{ color: colors.onAccent }}>
              Share this month
            </ThemedText>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const theme = useThemeTokens();
  return (
    <View
      className="flex-1 rounded-2xl border px-3 py-3"
      style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }}>
      <ThemedText variant="micro" style={{ color: `${theme.colors.text}99`, textTransform: 'uppercase' }}>
        {label}
      </ThemedText>
      <ThemedText variant="captionStrong" style={{ marginTop: 4 }} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useThemeTokens();
  return (
    <View>
      <ThemedText variant="sectionTitle" style={{ marginBottom: 12, paddingHorizontal: 4 }}>
        {title}
      </ThemedText>
      <View
        className="overflow-hidden rounded-[24px] border"
        style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
        {children}
      </View>
    </View>
  );
}

function ReviewRow({
  icon,
  title,
  body,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  onPress?: () => void;
}) {
  const theme = useThemeTokens();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      // 48dp minimum target, whole row pressable — X9's rule, applied here
      // rather than to the corner beside the icon.
      style={{ minHeight: 64 }}
      className="flex-row items-center border-b border-gray-100 p-4 last:border-b-0 dark:border-gray-700">
      <View
        className="mr-3 h-10 w-10 items-center justify-center rounded-2xl"
        style={{ backgroundColor: theme.colors.secondary }}>
        <MaterialCommunityIcons name={icon} size={19} color={theme.colors.accent} />
      </View>
      <View className="flex-1">
        <ThemedText variant="bodyStrong" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText
          variant="caption"
          style={{ marginTop: 2, color: `${theme.colors.text}99` }}
          numberOfLines={2}>
          {body}
        </ThemedText>
      </View>
      {onPress && (
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.accent} />
      )}
    </Pressable>
  );
}
