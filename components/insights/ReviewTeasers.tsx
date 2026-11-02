import { router } from 'expo-router';
import { useMemo } from 'react';

import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse } from '@/lib/insights';
import { NavCard } from './insight-ui';
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
    <NavCard
      icon="calendar-month"
      hue={theme.colors.accent}
      eyebrow="Monthly review"
      title={`${label} in review`}
      body="The finished month, with what changed and a summary you can share."
      accessibilityLabel={`Open the ${label} review`}
      onPress={() =>
        router.push({
          pathname: '/monthly-review',
          params: {
            month: `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`,
          },
        })
      }
    />
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
    <NavCard
      icon="file-chart-outline"
      hue={theme.colors.accent}
      eyebrow="Weekly review"
      title="See how your week went"
      body={`${budgetRisks} budget risk${budgetRisks === 1 ? '' : 's'} · ${recurringCount} recurring · ${warningCount} alert${warningCount === 1 ? '' : 's'}`}
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
    />
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
      <NavCard
        icon="repeat-variant"
        hue={theme.colors.accent}
        eyebrow={
          dueCount > 0 ? `${dueCount} due now` : `${dashboard.recurring_candidates.length} detected`
        }
        title={topCandidate?.label ?? 'Recurring patterns'}
        body="Confirm repeated spends before Finnri tracks them as subscriptions."
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
      />
    </SectionHeader>
  );
}
