import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse } from '@/lib/insights';
import { SectionHeader } from './SectionHeader';

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
export function MonthlyReviewTeaser() {
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
            Monthly review
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
export function WeeklyReviewTeaser({
  dashboard,
  rangeLabel,
}: {
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  const theme = useThemeTokens();
  const budgetRisks =
    dashboard.budget_statuses?.filter((budget) => budget.status !== 'safe').length ?? 0;
  const recurringCount = dashboard.recurring_candidates.length;
  const warningCount = dashboard.insights.filter(
    (insight) => insight.severity === 'warning'
  ).length;

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
            Weekly review
          </ThemedText>
          <ThemedText className="mt-1 text-base font-black">See how your week went</ThemedText>
          <ThemedText tone="muted" className="mt-1 text-xs leading-5">
            {budgetRisks} budget risk{budgetRisks === 1 ? '' : 's'} · {recurringCount} recurring ·{' '}
            {warningCount} alert{warningCount === 1 ? '' : 's'}
          </ThemedText>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.accent} />
      </View>
    </TouchableOpacity>
  );
}
export function RecurringReviewTeaser({
  dashboard,
  rangeLabel,
}: {
  dashboard: DashboardResponse;
  rangeLabel: string;
}) {
  const theme = useThemeTokens();
  const dueCount = dashboard.recurring_candidates.filter(
    (candidate) => candidate.review_due
  ).length;
  const topCandidate = dashboard.recurring_candidates[0];

  return (
    <SectionHeader
      title="Recurring review"
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
              {dueCount > 0
                ? `${dueCount} due now`
                : `${dashboard.recurring_candidates.length} detected`}
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
