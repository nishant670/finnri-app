import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CountUpMoney } from '@/components/ui/CountUpMoney';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse, moneyOutOf } from '@/lib/insights';
import { getBurnRateCopy, getPeriodPulse } from '@/lib/insight-summary';

export function PeriodPulseCard({
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
          <ThemedText tone="muted" className="mt-2 text-xs leading-5">
            {pulse.reason}
          </ThemedText>
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
 * One figure of the period summary.
 *
 * `amount` counts up from zero; `value` is for the cases that are not money at
 * all — a category name has nothing to count towards, and animating it would be
 * decoration rather than the arrival of an answer.
 */
export function PulseMetric({
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
      <ThemedText tone="muted" className="text-[10px] font-black uppercase">
        {label}
      </ThemedText>
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
