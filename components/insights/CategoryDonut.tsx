import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { CountUpMoney } from '@/components/ui/CountUpMoney';
import { useReveal } from '@/hooks/use-reveal';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { formatMoney } from '@/lib/money';
import {
  buildDonutSlices,
  formatShare,
  ringSegmentPath,
  sliceVisual,
  type DonutSlice,
} from '@/lib/spend-charts';
import {
  formatChangeMagnitude,
  previousWindowLabel,
  type DashboardCategory,
  type DashboardPeriod,
} from '@/lib/insights';
import { Eyebrow, InsightCard, insightText } from './insight-ui';

/**
 * The category breakdown, as a breakdown.
 *
 * The ring this replaces charted the top two categories and printed `Bills 49%`
 * in its centre, which reads as a progress meter towards a goal nobody set. A
 * donut whose centre holds one category's share is not showing a whole; it is
 * showing a part and implying the rest.
 *
 * This charts every category the period has, rolls the tail into `Other`, names
 * all of them in the legend with their amount and share, and puts the period
 * total in the middle — the one number the ring actually represents.
 *
 * Tapping a slice or its legend row opens the transaction list filtered to that
 * category. `Other` is not a category, so it expands to name what is inside it
 * instead of filtering by a label no entry carries.
 */

const SIZE = 168;
const RING_WIDTH = 26;
const SELECTED_GROWTH = 5;

type CategoryDonutProps = {
  categories: DashboardCategory[];
  totalSpent: number;
  /** The window every `change` on these categories is measured against. */
  period?: DashboardPeriod;
  onSelectCategory: (category: string) => void;
};

export function CategoryDonut({
  categories,
  totalSpent,
  period,
  onSelectCategory,
}: CategoryDonutProps) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [otherExpanded, setOtherExpanded] = useState(false);

  const slices = useMemo(
    () => buildDonutSlices(categories, totalSpent),
    [categories, totalSpent]
  );

  if (slices.length === 0) return null;

  const centre = SIZE / 2;
  const outer = centre - SELECTED_GROWTH;
  const inner = outer - RING_WIDTH;

  const handleSlice = (slice: DonutSlice) => {
    if (!slice.category) {
      setOtherExpanded((expanded) => !expanded);
      setHighlighted((current) => (current === slice.label ? null : slice.label));
      return;
    }
    onSelectCategory(slice.category);
  };

  return (
    <InsightCard>
      <Eyebrow>Where it went</Eyebrow>

      <View className="mt-4 items-center">
        <View style={{ width: SIZE, height: SIZE }}>
          <DonutRing
            slices={slices}
            centre={centre}
            outer={outer}
            inner={inner}
            highlighted={highlighted}
            onSlice={handleSlice}
          />

          {/* The centre is the whole the ring adds up to. Not a percentage —
              that was the bug this replaces. */}
          <View
            className="absolute inset-0 items-center justify-center"
            pointerEvents="none">
            <ThemedText tone="muted" style={insightText.caption}>
              Total
            </ThemedText>
            <CountUpMoney
              amount={totalSpent}
              style={{ fontSize: 19, lineHeight: 24, fontWeight: '700', color: theme.text }}
            />
          </View>
        </View>
      </View>

      <View className="mt-5 gap-1">
        {slices.map((slice) => (
          <LegendRow
            key={slice.label}
            slice={slice}
            expanded={!slice.category && otherExpanded}
            previousWindow={previousWindowLabel(period)}
            onPress={() => handleSlice(slice)}
            onSelectCategory={onSelectCategory}
          />
        ))}
      </View>
    </InsightCard>
  );
}

/**
 * The ring, drawing itself clockwise from twelve o'clock.
 *
 * The sweep is a single leading edge across the whole circle rather than every
 * slice growing at once: a category's share is its *arc*, and eight arcs each
 * opening from their own start would show eight shares changing, all of them
 * wrong until the last frame. Cutting one moving edge instead means every arc
 * on screen is already the right size — it is only how much of the ring has
 * been drawn that is still arriving.
 *
 * Its own component so the half-second of frames stays inside the `Svg`. The
 * legend beneath is seven rows of pressables and icons and has no reason to
 * re-render at all.
 */
function DonutRing({
  slices,
  centre,
  outer,
  inner,
  highlighted,
  onSlice,
}: {
  slices: DonutSlice[];
  centre: number;
  outer: number;
  inner: number;
  highlighted: string | null;
  onSlice: (slice: DonutSlice) => void;
}) {
  // Keyed on what the ring says rather than on the array holding it. Pulling to
  // refresh builds a new `slices` every time, and a period that has not changed
  // since the last fetch should not redraw itself to say so — the same rule the
  // counting figures follow, which key on the amount.
  const sweep = useReveal(slices.map((slice) => `${slice.label}:${slice.amount}`).join('|'));

  return (
    <Svg width={SIZE} height={SIZE}>
      <G>
        {slices.map((slice) => {
          const edge = Math.min(slice.endFraction, sweep);
          // Not yet reached. Rendering it with an empty `d` would be the same
          // picture and one more native view per frame.
          if (edge <= slice.startFraction) return null;
          const isHighlighted = highlighted === slice.label;
          return (
            <Path
              key={slice.label}
              d={ringSegmentPath(
                centre,
                isHighlighted ? outer + SELECTED_GROWTH : outer,
                inner,
                slice.startFraction,
                edge
              )}
              fill={slice.color}
              opacity={highlighted && !isHighlighted ? 0.45 : 1}
              onPress={() => onSlice(slice)}
            />
          );
        })}
      </G>
    </Svg>
  );
}

function LegendRow({
  slice,
  expanded,
  previousWindow,
  onPress,
  onSelectCategory,
}: {
  slice: DonutSlice;
  expanded: boolean;
  previousWindow: string;
  onPress: () => void;
  onSelectCategory: (category: string) => void;
}) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;
  const visual = sliceVisual(slice.category);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${slice.label}, ${formatMoney(slice.amount)}, ${formatShare(slice.percentage)}`}
        onPress={onPress}
        className="flex-row items-center rounded-xl py-2">
        <View
          className="mr-3 h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${slice.color}22` }}>
          <MaterialCommunityIcons name={visual.icon} size={15} color={slice.color} />
        </View>
        <View className="flex-1 pr-2">
          <ThemedText style={{ fontSize: 15, lineHeight: 20, color: theme.text }} numberOfLines={1}>
            {slice.label}
          </ThemedText>
          {/* S5's per-category comparison used to live on the card this donut
              replaced. It is only ever present when the backend judged the
              baseline thick enough to divide by, and small moves are noise, so
              this shows the ones worth reading and nothing else. */}
          {slice.change != null && Math.abs(slice.change) >= 20 && (
            <ThemedText
              style={{
                fontSize: 12,
                lineHeight: 16,
                color: slice.change > 0 ? theme.negative : theme.positive,
              }}>
              {formatChangeMagnitude(slice.change)} {slice.change > 0 ? 'more' : 'less'} than{' '}
              {previousWindow}
            </ThemedText>
          )}
        </View>
        <ThemedText tone="muted" style={{ fontSize: 13, lineHeight: 18, minWidth: 38, textAlign: 'right' }}>
          {formatShare(slice.percentage)}
        </ThemedText>
        <ThemedText
          style={{
            marginLeft: 12,
            fontSize: 15,
            lineHeight: 20,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            color: theme.text,
          }}>
          {formatMoney(slice.amount)}
        </ThemedText>
        <MaterialCommunityIcons
          name={slice.category ? 'chevron-right' : expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.muted}
        />
      </Pressable>

      {expanded && (
        <View className="mb-2 ml-10 gap-1">
          {slice.rolledUp.length === 0 ? (
            <ThemedText tone="muted" style={insightText.caption}>
              Categories too small to chart individually.
            </ThemedText>
          ) : (
            // Everything named here is a real category, so it filters like one.
            // Being too small to draw is not a reason to be unreachable.
            slice.rolledUp.map((item) => (
              <Pressable
                key={item.category}
                accessibilityRole="button"
                accessibilityLabel={`${item.category}, ${formatMoney(item.amount)}`}
                onPress={() => onSelectCategory(item.category)}
                className="flex-row items-center py-1">
                <ThemedText style={[insightText.caption, { flex: 1, color: theme.text }]} numberOfLines={1}>
                  {item.category}
                </ThemedText>
                <ThemedText tone="muted" style={insightText.caption}>
                  {formatMoney(item.amount)}
                </ThemedText>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={14}
                  color={theme.muted}
                />
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}
