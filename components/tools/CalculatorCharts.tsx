import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EMIYear } from '@/lib/emi';
import { formatMoneyCompact } from '@/lib/money';
import type { SIPYearBreakdown } from '@/lib/sip';

const CHART_HEIGHT = 120;

/**
 * Which years get a label under the bars: the first, the last, and one in the
 * middle once there are enough bars for three labels to fit.
 */
const labelledYears = (count: number) => {
  const marks = new Set([1, count]);
  if (count >= 5) marks.add(Math.ceil(count / 2));
  return marks;
};

/**
 * What a SIP grows to, year by year (board R11-SIP-Proposals, P52): one bar
 * per year, the part put in drawn quiet under the growth, and the final
 * value named above the last bar. The table is a tap away, not the answer.
 */
export function SIPGrowthChart({ years }: { years: SIPYearBreakdown[] }) {
  const { colors } = useThemeTokens();
  if (years.length === 0) return null;
  const top = Math.max(...years.map((year) => year.yearEndValue), 1);
  const marks = labelledYears(years.length);
  let invested = 0;
  const last = years[years.length - 1];

  return (
    <View
      testID="sip-growth-chart"
      accessible
      accessibilityLabel={`Value by year, reaching ${formatMoneyCompact(last.yearEndValue)} in year ${last.year}`}
      style={styles.chart}>
      <ThemedText style={[styles.peak, { color: colors.text }]}>
        {formatMoneyCompact(last.yearEndValue)}
      </ThemedText>
      <View style={styles.bars}>
        {years.map((year) => {
          invested += year.yearlyInvestment;
          const height = (year.yearEndValue / top) * CHART_HEIGHT;
          const putIn = Math.min(height, (invested / top) * CHART_HEIGHT);
          return (
            <View key={year.year} style={styles.barSlot}>
              <View style={[styles.bar, { height, backgroundColor: colors.positive }]}>
                <View
                  style={[
                    styles.barBase,
                    // Solid, not see-through: over the green it read as
                    // more green, not the legend's grey.
                    { height: putIn, backgroundColor: mixHex(colors.card, colors.text, 0.22) },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        {years.map((year) => (
          <ThemedText key={year.year} tone="muted" numberOfLines={1} style={styles.axisLabel}>
            {marks.has(year.year) ? `Yr ${year.year}` : ''}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

/**
 * Each year of a loan (board R11-EMI-Proposals, P52): a bar per year, the
 * interest on top in the warning hue so the early, interest-heavy years are
 * plain to see, and the interest named under each bar when they fit.
 */
export function EMIYearsChart({ years }: { years: EMIYear[] }) {
  const { colors } = useThemeTokens();
  if (years.length === 0) return null;
  const top = Math.max(...years.map((year) => year.principal + year.interest), 1);
  const showAmounts = years.length <= 6;
  const marks = labelledYears(years.length);

  return (
    <View testID="emi-years-chart" style={styles.chart}>
      <View style={styles.legendRow}>
        <View style={[styles.swatch, { backgroundColor: colors.warning }]} />
        <ThemedText tone="muted" style={styles.legendText}>
          Interest
        </ThemedText>
        <View style={[styles.swatch, { backgroundColor: mixHex(colors.card, colors.text, 0.22) }]} />
        <ThemedText tone="muted" style={styles.legendText}>
          Loan repaid
        </ThemedText>
      </View>
      <View style={styles.bars}>
        {years.map((year) => {
          const total = year.principal + year.interest;
          const height = (total / top) * CHART_HEIGHT;
          const interestHeight = total > 0 ? (year.interest / total) * height : 0;
          return (
            <View
              key={year.year}
              accessible
              accessibilityLabel={`Year ${year.year}: ${formatMoneyCompact(year.interest)} interest`}
              style={styles.barSlot}>
              <View style={[styles.bar, { height, backgroundColor: mixHex(colors.card, colors.text, 0.22) }]}>
                <View
                  style={[styles.barTop, { height: interestHeight, backgroundColor: colors.warning }]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        {years.map((year) => (
          <View key={year.year} style={styles.axisCell}>
            <ThemedText tone="muted" numberOfLines={1} style={styles.axisLabel}>
              {showAmounts || marks.has(year.year) ? `Year ${year.year}` : ''}
            </ThemedText>
            {showAmounts ? (
              <ThemedText numberOfLines={1} style={[styles.axisAmount, { color: colors.text }]}>
                {formatMoneyCompact(year.interest)}
              </ThemedText>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    gap: 6,
  },
  peak: {
    alignSelf: 'flex-end',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bars: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barSlot: {
    flex: 1,
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barBase: {
    width: '100%',
  },
  barTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  axis: {
    flexDirection: 'row',
    gap: 3,
  },
  axisCell: {
    flex: 1,
    alignItems: 'center',
  },
  axisLabel: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  axisAmount: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    lineHeight: 16,
    marginRight: 8,
  },
});
