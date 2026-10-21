import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryVisual } from '@/lib/categories';
import {
  formatChangeMagnitude,
  previousWindowLabel,
  type DashboardResponse,
} from '@/lib/insights';
import { formatMoney } from '@/lib/money';

/**
 * The month, at the top of Home.
 *
 * Home held no money at all — no balance, no month-to-date, no budget, just a
 * microphone. There was nothing to open the app for on a day you had nothing to
 * log. Three figures, one line each: what you have spent, how that compares
 * with the same days of last month, and where most of it went.
 *
 * Every number comes from `/v1/dashboard` over its default range, which is the
 * 1st to today — the same window the Insights tab opens on, so tapping through
 * cannot land on a different period than the strip described.
 *
 * The comparison obeys S5's floor: below ₹500 or 5 transactions in the previous
 * window the backend sends no percentage, and this says why instead of printing
 * a 0% that would read as "flat".
 */

const monthLabel = (isoDate?: string) => {
  const match = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'This month';
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleString('en-US', {
    month: 'long',
  });
};

type MonthStripProps = {
  dashboard: DashboardResponse | null;
  loading: boolean;
  onPress: () => void;
};

export function MonthStrip({ dashboard, loading, onPress }: MonthStripProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  // A secondary widget must not report a failure on the primary screen. With
  // nothing to show, Home is exactly what it was before this strip existed —
  // less the strip, but not the air between the header and capture.
  if (!dashboard && !loading) return <View style={styles.gapOnly} />;

  const month = monthLabel(dashboard?.period?.start);

  /**
   * A month with nothing in it is a line, not a panel.
   *
   * This used to be the full card — border, chevron, 24px headline — wrapped
   * around the words "Nothing logged yet". A card is a promise that there is
   * something inside it worth the space and worth a tap, and on a brand-new
   * account both are false: the chevron opened an Insights screen as empty as
   * the card, and the panel pushed the capture field the user actually needs a
   * third of the way down the screen. One quiet sentence says the same thing
   * and gets out of the way; the card comes back with the first expense.
   */
  if (dashboard && dashboard.summary.transaction_count === 0) {
    return (
      <ThemedText tone="muted" style={styles.emptyLine}>
        Nothing logged in {month} yet — your first expense starts the story.
      </ThemedText>
    );
  }

  const body = () => {
    if (!dashboard) {
      return (
        <ThemedText tone="muted" style={styles.line}>
          Adding up your month…
        </ThemedText>
      );
    }

    const { summary, top_categories: topCategories, period } = dashboard;

    const previousWindow = previousWindowLabel(period);
    const change = summary.spend_change ?? 0;
    const increased = change >= 0;
    const changeColor = increased ? theme.negative : theme.positive;
    const topCategory = topCategories?.[0];
    const categoryIcon = topCategory ? categoryVisual(topCategory.category) : null;

    return (
      <>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.amount, { color: theme.text }]}>
          {formatMoney(summary.total_spent)}
        </ThemedText>

        <View style={styles.factRow}>
          {summary.spend_change_comparable ? (
            <>
              <MaterialCommunityIcons
                name={increased ? 'trending-up' : 'trending-down'}
                size={16}
                color={changeColor}
              />
              <ThemedText tone="muted" style={styles.factText} numberOfLines={1}>
                <ThemedText style={[styles.line, styles.strong, { color: changeColor }]}>
                  {`${formatChangeMagnitude(change)} ${increased ? 'more' : 'less'}`}
                </ThemedText>
                {` than ${previousWindow}`}
              </ThemedText>
            </>
          ) : (
            <ThemedText tone="muted" style={styles.factText} numberOfLines={1}>
              {(summary.previous_total_spent ?? 0) > 0
                ? `Too little in ${previousWindow} to compare`
                : `Nothing logged in ${previousWindow} to compare`}
            </ThemedText>
          )}
        </View>

        {topCategory && categoryIcon && (
          <View style={styles.factRow}>
            <MaterialCommunityIcons name={categoryIcon.icon} size={16} color={categoryIcon.color} />
            <ThemedText tone="muted" style={styles.factText} numberOfLines={1}>
              <ThemedText style={[styles.line, styles.strong, { color: theme.text }]}>
                {`${topCategory.category} ${formatMoney(topCategory.amount)}`}
              </ThemedText>
              {' · most of your spend'}
            </ThemedText>
          </View>
        )}
      </>
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${month} so far. Open insights.`}
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.titleRow}>
        <ThemedText tone="muted" style={[styles.line, styles.strong]}>
          {month} so far
        </ThemedText>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
      </View>
      {body()}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gapOnly: {
    height: 12,
  },
  emptyLine: {
    marginTop: 6,
    marginBottom: 14,
    marginHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    marginTop: 8,
    marginBottom: 12,
    marginHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 12,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  line: {
    fontSize: 13,
    lineHeight: 18,
  },
  strong: {
    fontWeight: '600',
  },
  amount: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  factText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
