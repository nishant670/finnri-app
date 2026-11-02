import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { DashboardResponse, moneyOutOf } from '@/lib/insights';
import { Eyebrow, HueTile, InsightCard, insightText } from './insight-ui';
import { PulseMetric } from './PeriodPulseCard';

export function AllClearCard({ dashboard }: { dashboard: DashboardResponse }) {
  const { colors } = useThemeTokens();
  const topCategory = dashboard.top_categories[0];
  const surplus = dashboard.summary.total_income - moneyOutOf(dashboard.summary);

  return (
    <InsightCard>
      <View style={styles.head}>
        <HueTile icon="check-decagram" hue={colors.positive} size={44} />
        <View style={styles.text}>
          <Eyebrow>All clear</Eyebrow>
          <ThemedText style={[insightText.title, { color: colors.text }]}>
            No urgent actions right now
          </ThemedText>
          <ThemedText tone="muted" style={insightText.body}>
            Categories and accounts look clean, budgets are safe, and there are no warning alerts
            for this period.
          </ThemedText>
        </View>
      </View>
      <View style={[styles.metrics, { borderTopColor: colors.border }]}>
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
    </InsightCard>
  );
}

const styles = StyleSheet.create({
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
  metrics: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
