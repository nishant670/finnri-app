import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse, moneyOutOf } from '@/lib/insights';
import { PulseMetric } from './PeriodPulseCard';

export function AllClearCard({ dashboard }: { dashboard: DashboardResponse }) {
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
            Categories and accounts look clean, budgets are safe, and there are no warning alerts
            for this period.
          </ThemedText>
        </View>
      </View>
      <View className="mt-4 flex-row gap-3">
        <PulseMetric label={surplus >= 0 ? 'Surplus' : 'Over income'} amount={Math.abs(surplus)} />
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
