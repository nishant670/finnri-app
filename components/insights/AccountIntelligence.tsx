import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { SectionHeader } from './SectionHeader';

export function AccountIntelligence({ dashboard }: { dashboard: DashboardResponse }) {
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
      <ThemedText tone="muted" className="mt-3 text-[11px]">
        {label}
      </ThemedText>
      <ThemedText className="mt-1 text-sm font-black" numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}
