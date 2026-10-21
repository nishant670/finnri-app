import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { withAlpha } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { InsightCard, ProgressBar, Tag, insightText } from './insight-ui';
import { PillButton } from './PillButton';
import { SectionHeader } from './SectionHeader';

export function BudgetWatchSection({
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
      <InsightCard flush>
        {visible.map((budget, index) => (
          <BudgetWatchCard
            key={budget.budget_id}
            divider={index > 0}
            budget={budget}
            periodStart={dashboard.period.start}
            periodEnd={dashboard.period.end}
            rangeLabel={rangeLabel}
          />
        ))}
      </InsightCard>
    </SectionHeader>
  );
}
function BudgetWatchCard({
  divider,
  budget,
  periodStart,
  periodEnd,
  rangeLabel,
}: {
  divider: boolean;
  budget: DashboardResponse['budget_statuses'][number];
  periodStart: string;
  periodEnd: string;
  rangeLabel: string;
}) {
  const { colors } = useThemeTokens();
  const exceeded = budget.status === 'exceeded';
  const color = exceeded ? colors.negative : colors.warning;
  const label = budget.category || budget.name;
  const kind = exceeded ? 'budget_exceeded' : 'budget_watch';
  const title = exceeded ? `${label} budget exceeded` : `${label} budget nearing limit`;
  const body = `${formatMoney(budget.spent_amount)} of ${formatMoney(budget.limit_amount)} used with ${budget.days_left} day${budget.days_left === 1 ? '' : 's'} left.`;

  return (
    <View style={[styles.row, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={styles.head}>
        <View style={styles.text}>
          <View style={styles.tags}>
            <Tag
              label={exceeded ? 'Exceeded' : 'Watch'}
              color={color}
              background={exceeded ? withAlpha(colors.negative, 0.12) : colors.warningSurface}
            />
            <ThemedText tone="muted" style={insightText.caption}>
              {budget.days_left} day{budget.days_left === 1 ? '' : 's'} left
            </ThemedText>
          </View>
          <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
          <ThemedText tone="muted" style={insightText.caption}>
            {formatMoney(budget.spent_amount)} of {formatMoney(budget.limit_amount)} used
          </ThemedText>
        </View>
        <ThemedText style={[styles.percent, { color }]}>{Math.round(budget.percentage)}%</ThemedText>
      </View>

      <ProgressBar fraction={budget.percentage / 100} color={color} style={styles.bar} />

      <View style={styles.actions}>
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

const styles = StyleSheet.create({
  row: {
    padding: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  percent: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bar: {
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
