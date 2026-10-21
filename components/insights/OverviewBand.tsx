import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { DashboardOverview, DashboardOverviewMonth } from '@/lib/insights';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { Eyebrow, InsightCard, insightText } from './insight-ui';

/**
 * The standing band at the top of Insights: what is true whatever period is
 * selected.
 *
 * Insights was period-scoped end to end, so it went blank on a schedule —
 * every month, from the 1st until the first transaction was captured, an
 * account with a year of history rendered ₹0 four times over "Waiting for
 * data". That is not an insight about the user's money; it is the lens
 * reporting on itself.
 *
 * Two jobs, in this order:
 *
 *  1. **A floor.** Once there is any history the tab always has something real
 *     at the top, so opening it on the 1st of a month is never a dead screen.
 *  2. **A baseline.** A month in isolation says almost nothing — ₹42,000 is
 *     high or low only against the months around it. The strip is what makes
 *     the selected period legible, which is the more valuable of the two even
 *     in a month that is full.
 *
 * Tapping a bar moves the whole screen to that month, so the band is also the
 * fastest way to navigate the history it is describing.
 */

const CHART_HEIGHT = 64;
const MIN_BAR_HEIGHT = 3;
const BAR_RADIUS = 3;
const BAR_GAP = 4;

export function OverviewBand({
  overview,
  /** YYYY-MM of the period on screen, when it is a single month. */
  selectedMonth,
  onSelectMonth,
}: {
  overview: DashboardOverview;
  selectedMonth: string | null;
  onSelectMonth: (month: DashboardOverviewMonth) => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const [width, setWidth] = useState(0);

  const months = useMemo(() => overview.recent_months ?? [], [overview.recent_months]);
  const ceiling = useMemo(
    () => Math.max(1, ...months.map((month) => month.spent)),
    [months]
  );

  if (!overview.has_history || months.length === 0) return null;

  const barWidth =
    width > 0 ? Math.max(4, (width - BAR_GAP * (months.length - 1)) / months.length) : 0;

  // A median rather than a mean: one holiday or one insurance renewal drags a
  // six-month average far enough to make every ordinary month look frugal
  // against it, which is the opposite of what a baseline is for.
  const typical = overview.typical_monthly_spend || overview.average_monthly_spend;

  /**
   * Whether there is enough history to call anything "typical".
   *
   * Two complete months is a sample, not a habit — and with one holiday in it
   * the median swings further than the figure it replaces. Below the floor the
   * band leads with what is simply true instead: how much has been tracked.
   */
  const baselineMonths = overview.baseline_months ?? 0;
  const canClaimTypical = baselineMonths >= 3 && typical > 0;

  const categoryMonths = overview.top_category_months ?? 0;

  const caption = canClaimTypical
    ? `last ${baselineMonths} months · ${formatMoneyCompact(
        overview.lifetime_spent
      )} over ${overview.months_tracked} month${overview.months_tracked === 1 ? '' : 's'}`
    : `${overview.lifetime_transaction_count} transaction${
        overview.lifetime_transaction_count === 1 ? '' : 's'
      } in ${overview.months_tracked} month${overview.months_tracked === 1 ? '' : 's'}`;

  return (
    <InsightCard>
      <Eyebrow>{canClaimTypical ? 'A typical month' : 'Tracked so far'}</Eyebrow>
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[insightText.figure, { color: theme.text }]}>
        {formatMoney(canClaimTypical ? typical : overview.lifetime_spent)}
      </ThemedText>
      <ThemedText tone="muted" style={insightText.body}>
        {caption}
      </ThemedText>

      <View
        style={{ marginTop: 16 }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        {barWidth > 0 ? (
          <>
            <Svg width={width} height={CHART_HEIGHT}>
              {months.map((month, index) => {
                const height =
                  month.spent > 0
                    ? Math.max(MIN_BAR_HEIGHT, (month.spent / ceiling) * CHART_HEIGHT)
                    : MIN_BAR_HEIGHT;
                const selected = month.month === selectedMonth;
                return (
                  <Rect
                    key={month.month}
                    x={index * (barWidth + BAR_GAP)}
                    y={CHART_HEIGHT - height}
                    width={barWidth}
                    height={height}
                    rx={BAR_RADIUS}
                    // A month with nothing in it is drawn as an empty slot
                    // rather than dropped. Dropping it compresses time, and a
                    // gap then reads as a decline.
                    fill={
                      selected
                        ? theme.accent
                        : month.spent > 0
                          ? mixHex(theme.card, theme.accent, 0.35)
                          : theme.track
                    }
                  />
                );
              })}
            </Svg>
            {/* Touch targets are separate from the bars: a two-pixel-wide
                quiet month still has to be reachable, and a bar is only as
                tall as its own amount. */}
            <View className="absolute inset-0 flex-row" style={{ gap: BAR_GAP }}>
              {months.map((month) => (
                <Pressable
                  key={month.month}
                  accessibilityRole="button"
                  accessibilityLabel={`${month.label}, ${
                    month.count > 0 ? formatMoney(month.spent) : 'no transactions'
                  }`}
                  onPress={() => onSelectMonth(month)}
                  style={{ width: barWidth, height: CHART_HEIGHT }}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={{ height: CHART_HEIGHT }} />
        )}

        <View style={{ marginTop: 8, flexDirection: 'row', gap: BAR_GAP }}>
          {months.map((month) => (
            <ThemedText
              key={month.month}
              numberOfLines={1}
              // fontSize lives in `style`, not in an arbitrary `text-[9px]`
              // class. Those do not survive a release build — they fall back to
              // ThemedText's 14px preset — and twelve month labels at 14px do
              // not fit the strip's width. Style-driven sizes are unaffected.
              style={{
                width: barWidth,
                textAlign: 'center',
                fontSize: 12,
                lineHeight: 16,
                fontWeight: month.month === selectedMonth ? '700' : '400',
                color: month.month === selectedMonth ? theme.text : theme.muted,
              }}>
              {month.label.slice(0, 1)}
            </ThemedText>
          ))}
        </View>
      </View>

      {overview.top_category ? (
        <ThemedText tone="muted" style={[insightText.body, { marginTop: 14 }]}>
          {/* The window asks for six months; an account three months old has
              three, and "over six months" would describe a period half of which
              it was not being used for. */}
          {overview.top_category} is your biggest category
          {categoryMonths > 1 ? ` over ${categoryMonths} months` : ''} —{' '}
          {formatMoney(overview.top_category_amount)}, {Math.round(overview.top_category_share)}% of
          what you spent.
        </ThemedText>
      ) : null}
    </InsightCard>
  );
}
