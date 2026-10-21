import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { DashboardResponse } from '@/lib/insights';
import { InsightCard, MetricStrip, ProgressBar } from './insight-ui';
import { SectionHeader } from './SectionHeader';

/** Which accounts the period's money went through, with two figures under them. */
export function AccountIntelligence({ dashboard }: { dashboard: DashboardResponse }) {
  const { colors } = useThemeTokens();
  const topCategory = dashboard.top_categories[0]?.category ?? 'Not enough data';
  return (
    <SectionHeader title="Accounts">
      <InsightCard>
        {dashboard.account_spending.slice(0, 3).map((account, index) => (
          <View key={account.account_id ?? account.account_name} style={index > 0 && styles.gap}>
            <View style={styles.line}>
              <ThemedText numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                {account.account_name}
              </ThemedText>
              <ThemedText style={[styles.amount, { color: colors.text }]}>
                {formatMoney(account.amount)}
              </ThemedText>
            </View>
            <ProgressBar fraction={account.percentage / 100} color={colors.accent} style={styles.bar} />
          </View>
        ))}

        <MetricStrip
          items={[
            { label: 'Daily average', value: formatMoney(dashboard.summary.daily_average) },
            { label: 'Top category', value: topCategory },
          ]}
        />
      </InsightCard>
    </SectionHeader>
  );
}

const styles = StyleSheet.create({
  gap: {
    marginTop: 14,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  amount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bar: {
    marginTop: 8,
  },
});
