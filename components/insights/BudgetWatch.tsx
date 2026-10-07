import { router } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
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
