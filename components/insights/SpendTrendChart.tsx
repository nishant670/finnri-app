import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useReveal } from '@/hooks/use-reveal';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import { buildSpendBuckets, type SpendBucket } from '@/lib/spend-charts';
import { formatChangeMagnitude, type DashboardResponse } from '@/lib/insights';
import { Eyebrow, InsightCard, insightText } from './insight-ui';

/**
 * Spending over time — the view the app did not have anywhere.
 *
 * One bar per day for the selected period, zero-spend days included, with the
 * daily average drawn across as a reference line. The line is the point: a bar
 * on its own says what a day cost, and a bar against the line says whether that
 * day was normal.
 *
 * Tapping a bar selects it; tapping the selected bar again — or the panel
 * underneath — opens the transaction list filtered to exactly those days. The
 * first tap does not navigate on purpose: reading across a month means touching
 * a lot of bars, and a chart that leaves the screen on every touch cannot be
 * read.
 */

const CHART_HEIGHT = 148;
const MIN_BAR_HEIGHT = 3;
const BAR_RADIUS = 3;

type SpendTrendChartProps = {
  dashboard: DashboardResponse;
  /** Opens the transaction list over the bucket's own date range. */
  onOpenRange: (bucket: SpendBucket) => void;
};

export function SpendTrendChart({ dashboard, onOpenRange }: SpendTrendChartProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const { buckets, average, averageLabel, max, granularity } = useMemo(
    () => buildSpendBuckets(dashboard.daily_spending ?? [], dashboard.summary.daily_average),
    [dashboard.daily_spending, dashboard.summary.daily_average]
  );

  // A new period is a new chart. Without this the old index survives and the
  // panel describes a day that is no longer on screen.
  useEffect(() => setSelected(null), [dashboard.period.start, dashboard.period.end]);

  if (buckets.length === 0) return null;

  // The line only has meaning inside the plot, so the plot has to contain it —
  // otherwise a month with one outlier day would push the average off the top.
  const ceiling = Math.max(max, average, 1);
  const scale = (amount: number) => (amount / ceiling) * (CHART_HEIGHT - 8);

  const gap = buckets.length > 20 ? 2 : buckets.length > 10 ? 4 : 6;
  const barWidth = Math.max(2, (width - gap * (buckets.length - 1)) / buckets.length);
  const averageY = CHART_HEIGHT - scale(average);

  const selectedBucket = selected != null ? buckets[selected] : null;
  // First, middle, last — deduped, because a one-bar period would otherwise
  // print the same date three times across the axis.
  const axisTicks = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])].map(
    (index) => buckets[index]
  );

  const handlePress = (index: number) => {
    if (selected === index) {
      onOpenRange(buckets[index]);
      return;
    }
    setSelected(index);
  };

  return (
    <InsightCard>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Spending over time</Eyebrow>
          <ThemedText style={[insightText.title, { color: theme.text }]}>
            {granularity === 'week' ? 'Each week' : 'Each day'} of {periodLabel(dashboard)}
          </ThemedText>
        </View>
        <ThemedText tone="muted" style={[insightText.caption, { marginTop: 2 }]}>
          avg {formatMoney(average)} {averageLabel}
        </ThemedText>
      </View>

      <View
        className="mt-5"
        style={{ height: CHART_HEIGHT }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && (
          <>
            <Plot
              buckets={buckets}
              width={width}
              barWidth={barWidth}
              gap={gap}
              scale={scale}
              selected={selected}
              average={average}
              averageY={averageY}
              barColor={theme.accent}
              lineColor={theme.text}
            />

            {/* Touch targets live in RN rather than on the SVG rects: a two
                pixel bar is not hittable, so each one gets the full column
                width and the whole height of the chart. */}
            <View className="absolute inset-0 flex-row">
              {buckets.map((bucket, index) => (
                <Pressable
                  key={bucket.start}
                  accessibilityRole="button"
                  accessibilityLabel={`${bucket.label}, ${formatMoney(bucket.amount)}`}
                  onPress={() => handlePress(index)}
                  style={{ width: barWidth + gap, height: CHART_HEIGHT }}
                />
              ))}
            </View>

            {/* The header chip already carries the number; this only names the
                line, so a dashed rule is not left to be guessed at. */}
            {average > 0 && (
              <View
                className="absolute rounded px-1"
                pointerEvents="none"
                style={{
                  top: Math.max(0, averageY - 15),
                  right: 0,
                  backgroundColor: theme.card,
                }}>
                <ThemedText tone="muted" style={{ fontSize: 11, lineHeight: 14 }}>
                  avg
                </ThemedText>
              </View>
            )}
          </>
        )}
      </View>

      <View className="mt-2 flex-row justify-between">
        {axisTicks.map((bucket, index) => (
          <ThemedText
            key={`${bucket.start}-${index}`}
            tone="muted"
            style={{ fontSize: 12, lineHeight: 16 }}>
            {bucket.axisLabel}
          </ThemedText>
        ))}
      </View>

      <SelectionPanel
        bucket={selectedBucket}
        average={average}
        averageLabel={averageLabel}
        onOpen={() => selectedBucket && onOpenRange(selectedBucket)}
      />
    </InsightCard>
  );
}

/**
 * The bars, growing out of the baseline.
 *
 * A month of spending arriving as a finished shape is a chart you have to go
 * back and read; the same bars rising takes the eye across them once, in order,
 * before it settles. They grow from the axis rather than fading in because a
 * bar's meaning is its height, and a half-opacity bar at full height is a lie
 * for as long as it lasts.
 *
 * Its own component for the same reason the donut ring is: the reveal is a
 * re-render per frame, and this keeps it off the 31 touch targets, the axis and
 * the selection panel, none of which change while it runs.
 *
 * The average line does not grow. It is not part of the data being revealed —
 * it is the thing the data is being measured against, and a reference that
 * arrives late is a reference the first bars were read without.
 */
function Plot({
  buckets,
  width,
  barWidth,
  gap,
  scale,
  selected,
  average,
  averageY,
  barColor,
  lineColor,
}: {
  buckets: SpendBucket[];
  width: number;
  barWidth: number;
  gap: number;
  scale: (amount: number) => number;
  selected: number | null;
  average: number;
  averageY: number;
  barColor: string;
  lineColor: string;
}) {
  // Keyed on what the bars say rather than on the array holding them, so a
  // pull-to-refresh that comes back with the same month does not replay it.
  const grow = useReveal(buckets.map((bucket) => bucket.amount).join('|'));

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {buckets.map((bucket, index) => {
        const full = bucket.amount > 0 ? Math.max(6, scale(bucket.amount)) : MIN_BAR_HEIGHT;
        const height = full * grow;
        const isSelected = selected === index;
        return (
          <Rect
            key={bucket.start}
            x={index * (barWidth + gap)}
            y={CHART_HEIGHT - height}
            width={barWidth}
            height={height}
            rx={Math.min(BAR_RADIUS, barWidth / 2)}
            fill={barColor}
            // One rent day can be seven times the next largest, which on a
            // linear scale — the only honest scale for money — leaves ordinary
            // days as ten-pixel stubs. They have to hold their colour to stay
            // readable at that height.
            opacity={isSelected ? 1 : bucket.amount > 0 ? 0.55 : 0.2}
          />
        );
      })}
      {/* The reference line sits above the bars so it stays readable across a
          tall one — an average you cannot see through the data is not a
          reference. */}
      {average > 0 && (
        <Line
          x1={0}
          y1={averageY}
          x2={width}
          y2={averageY}
          stroke={lineColor}
          strokeOpacity={0.42}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}
    </Svg>
  );
}

function SelectionPanel({
  bucket,
  average,
  averageLabel,
  onOpen,
}: {
  bucket: SpendBucket | null;
  average: number;
  averageLabel: string;
  onOpen: () => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  if (!bucket) {
    return (
      <View style={{ marginTop: 12 }}>
        <ThemedText tone="muted" style={insightText.caption}>
          Tap a bar to see that {averageLabel === 'per week' ? 'week' : 'day'}, and again to open
          its transactions.
        </ThemedText>
      </View>
    );
  }

  const delta = average > 0 ? ((bucket.amount - average) / average) * 100 : 0;
  const above = delta > 0;
  const unit = averageLabel.replace('per ', '');
  // A short trailing bucket is genuinely below a full-length average and it is
  // not a finding, so it says which it is rather than reporting a fall.
  const partial = averageLabel === 'per week' && bucket.days < 7;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      className="mt-3 rounded-xl border px-4 py-3"
      style={{ backgroundColor: theme.background, borderColor: theme.border }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <ThemedText tone="muted" style={[insightText.caption, { fontWeight: '600' }]}>
            {bucket.label}
            {partial ? ` · ${bucket.days} of 7 days` : ''}
          </ThemedText>
          <ThemedText style={[insightText.title, { color: theme.text, fontVariant: ['tabular-nums'] }]}>
            {formatMoney(bucket.amount)}
          </ThemedText>
        </View>
        <View className="flex-row items-center">
          <ThemedText style={[insightText.caption, { fontWeight: '700', color: theme.text }]}>
            {bucket.count} transaction{bucket.count === 1 ? '' : 's'}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text} />
        </View>
      </View>
      {/* S5's rule, not a second one: past 300% a percentage stops reading as
          a quantity, so it becomes a multiplier. A rent day is genuinely 6×
          the average — "521% above" makes that look like a broken sum. */}
      <ThemedText tone="muted" style={[insightText.caption, { marginTop: 2 }]}>
        {bucket.amount === 0
          ? 'Nothing logged.'
          : average <= 0 || Math.abs(delta) < 5
            ? `Tracking close to the average ${unit}.`
            : delta > 300
              ? `${formatChangeMagnitude(delta)} the average ${unit}.`
              : `${formatChangeMagnitude(delta)} ${above ? 'above' : 'below'} the average ${unit}.`}
      </ThemedText>
    </Pressable>
  );
}

const periodLabel = (dashboard: DashboardResponse) => {
  const match = dashboard.period.start?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'this period';
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const endMatch = dashboard.period.end?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const end = endMatch
    ? new Date(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3]))
    : start;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return start.toLocaleString('en-US', { month: 'long' });
  }
  return 'the period';
};
