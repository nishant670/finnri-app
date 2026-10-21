import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CountUpMoney } from '@/components/ui/CountUpMoney';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse, moneyOutOf } from '@/lib/insights';
import { getBurnRateCopy, getPeriodPulse } from '@/lib/insight-summary';
import {
  Eyebrow,
  HueTile,
  InsightCard,
  MetricStrip,
  Tag,
  insightText,
  metricValueStyle,
} from './insight-ui';

/** The period at a glance: its verdict, the figures under it, and why. */
export function PeriodPulseCard({
  dashboard,
  insightLevel,
  reviewCount,
}: {
  dashboard: DashboardResponse;
  insightLevel: number;
  reviewCount: number;
}) {
  const { colors } = useThemeTokens();
  const pulse = getPeriodPulse(dashboard, reviewCount);
  const surplus = dashboard.summary.total_income - moneyOutOf(dashboard.summary);
  const invested = dashboard.summary.total_invested ?? 0;

  const metrics = [
    { label: 'Income', value: <PulseValue amount={dashboard.summary.total_income} /> },
    { label: 'Spent', value: <PulseValue amount={dashboard.summary.total_spent} /> },
    ...(invested > 0 ? [{ label: 'Invested', value: <PulseValue amount={invested} /> }] : []),
    {
      label: surplus >= 0 ? 'Surplus' : 'Over income',
      value: <PulseValue amount={Math.abs(surplus)} />,
    },
    { label: 'Daily avg', value: <PulseValue amount={dashboard.summary.daily_average} /> },
  ];

  return (
    <InsightCard>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Eyebrow>This period</Eyebrow>
          <ThemedText style={[styles.label, { color: colors.text }]}>{pulse.label}</ThemedText>
          <ThemedText tone="muted" style={insightText.body}>
            {pulse.reason}
          </ThemedText>
        </View>
        <HueTile
          icon={pulse.icon as keyof typeof MaterialCommunityIcons.glyphMap}
          hue={pulse.color}
          size={44}
        />
      </View>

      <MetricStrip items={metrics} />

      <View style={[styles.why, { borderTopColor: colors.border }]}>
        <MaterialCommunityIcons name="timer-sand" size={16} color={colors.muted} />
        <ThemedText tone="muted" style={[insightText.caption, styles.whyText]}>
          <ThemedText style={[insightText.caption, styles.bold, { color: colors.text }]}>
            Why:{' '}
          </ThemedText>
          {getBurnRateCopy(dashboard)}
        </ThemedText>
      </View>

      <View style={styles.foot}>
        <ThemedText tone="muted" style={[insightText.caption, styles.footText]}>
          The more you log, the sharper these get.
        </ThemedText>
        <Tag label={`L${insightLevel}/4`} color={colors.text} background={colors.track} />
      </View>
    </InsightCard>
  );
}

function PulseValue({ amount }: { amount: number }) {
  const { colors } = useThemeTokens();
  return (
    <CountUpMoney
      amount={amount}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[metricValueStyle, { color: colors.text }]}
    />
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
  const { colors } = useThemeTokens();

  return (
    <View style={styles.metric}>
      <ThemedText tone="muted" numberOfLines={1} style={insightText.caption}>
        {label}
      </ThemedText>
      {amount == null ? (
        <ThemedText numberOfLines={1} style={[metricValueStyle, { color: colors.text }]}>
          {value}
        </ThemedText>
      ) : (
        <PulseValue amount={amount} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  why: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  whyText: {
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  footText: {
    flex: 1,
  },
  metric: {
    flex: 1,
    minWidth: 0,
  },
});
