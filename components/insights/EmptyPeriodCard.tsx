import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { DashboardOverview, DashboardOverviewMonth } from '@/lib/insights';
import { formatMoney } from '@/lib/money';
import { Eyebrow, HueTile, InsightCard, insightText } from './insight-ui';

/**
 * What the tab says when the selected period holds nothing but the account
 * does not.
 *
 * The screen used to answer that case with its ordinary cards, filled with
 * zeros: "₹0 per day", "Waiting for data", four ₹0 tiles. Every one of those is
 * a true statement about an empty window and a false impression of the account,
 * and it is the state the tab is guaranteed to be in at the start of every
 * month — which is exactly when somebody opens it to plan.
 *
 * Three things instead, in the order they are useful:
 *
 *  1. Name the state plainly, so it reads as a quiet window and not a fault.
 *  2. Say what the month is measured against, so the emptiness has a size.
 *  3. Offer the one tap that leads somewhere — the last month that has data.
 */
export function EmptyPeriodCard({
  rangeLabel,
  overview,
  onOpenMonth,
  onAddTransaction,
}: {
  rangeLabel: string;
  overview: DashboardOverview;
  onOpenMonth: (month: DashboardOverviewMonth) => void;
  onAddTransaction: () => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const lastActive = overview.last_active_month ?? null;
  const typical = overview.typical_monthly_spend || overview.average_monthly_spend;
  // Same floor as the band above: below three complete months there is no
  // "typical" to quote, and quoting one anyway printed the same figure twice —
  // once here and once on the jump button — which reads as a bug.
  const canClaimTypical = (overview.baseline_months ?? 0) >= 3 && typical > 0;

  return (
    <InsightCard>
      <View style={styles.head}>
        <HueTile icon="calendar-blank-outline" hue={theme.accent} size={44} />
        <View style={styles.text}>
          <Eyebrow>Nothing yet</Eyebrow>
          <ThemedText style={[insightText.title, { color: theme.text }]}>
            No transactions in {rangeLabel}
          </ThemedText>
        </View>
      </View>

      <ThemedText tone="muted" style={[insightText.body, styles.body]}>
        {canClaimTypical
          ? `Your history is intact — a typical month runs about ${formatMoney(
              typical
            )}. Insights for this period fill in as you capture transactions.`
          : 'Your history is intact. Insights for this period fill in as you capture transactions.'}
      </ThemedText>

      {lastActive ? (
        <PressableView
          accessibilityRole="button"
          accessibilityLabel={`Show ${lastActive.label}, ${formatMoney(lastActive.spent)} spent`}
          onPress={() => onOpenMonth(lastActive)}
          style={[styles.jump, { borderColor: theme.border }]}
          pressedStyle={styles.pressed}>
          <View style={styles.text}>
            <ThemedText style={[styles.jumpTitle, { color: theme.text }]}>
              Jump to {lastActive.label}
            </ThemedText>
            <ThemedText tone="muted" style={insightText.caption} numberOfLines={1}>
              {formatMoney(lastActive.spent)} across {lastActive.count} transaction
              {lastActive.count === 1 ? '' : 's'}
            </ThemedText>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
        </PressableView>
      ) : null}

      <Button
        variant="outline"
        height={44}
        icon="plus"
        label="Add a transaction"
        onPress={onAddTransaction}
        style={styles.add}
      />
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  body: {
    marginTop: 12,
  },
  jump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  jumpTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  add: {
    marginTop: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
