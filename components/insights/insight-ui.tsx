import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { mixHex } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryTile } from '@/lib/categories';
import { getMonogram } from '@/lib/monogram';

/*
 * The handful of pieces every Insights card is built from (boards R7-*): the
 * flat card, its muted eyebrow, the 28pt figure, a strip of small figures, a
 * card that is one big link, a tinted tile and a progress bar. Kept here
 * rather than in `components/ui` because only these screens use them yet.
 */

/** The redesign's card: `card` fill, 1dp border, radius 16, 16 inside. */
export function InsightCard({
  children,
  style,
  flush = false,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** No inner padding, for a card of rows that draw their own. */
  flush?: boolean;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        !flush && styles.cardPadded,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

/** The 13/600 muted line above a figure or a title. */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <ThemedText tone={color ? undefined : 'muted'} style={[styles.eyebrow, color ? { color } : null]}>
      {children}
    </ThemedText>
  );
}

/** A tinted 36dp (or `size`) tile with its glyph in the hue. */
export function HueTile({
  icon,
  hue,
  size = 36,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  size?: number;
}) {
  const theme = useThemeTokens();
  const tile = categoryTile({ color: hue, bgColor: mixHex('#FFFFFF', hue, 0.14) }, theme.mode);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size >= 44 ? 12 : 10, backgroundColor: tile.background },
      ]}>
      <MaterialCommunityIcons name={icon} size={Math.round(size * 0.55)} color={tile.foreground} />
    </View>
  );
}

/**
 * A card that is one link (boards R7-Weekly "Next step", R7-Analysis "What
 * stands out"): a tile, an optional eyebrow, the title, a body line, and a
 * chevron.
 */
export function NavCard({
  icon,
  hue,
  eyebrow,
  title,
  body,
  onPress,
  accessibilityLabel,
  children,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  eyebrow?: string;
  title: string;
  body?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Under the body — a pair of buttons. */
  children?: ReactNode;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.card, styles.cardPadded, { backgroundColor: colors.card, borderColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <NavRowBody icon={icon} hue={hue} eyebrow={eyebrow} title={title} body={body}>
        {children}
      </NavRowBody>
    </PressableView>
  );
}

/** One row of a card of links: `NavCard`'s content without its own card. */
export function NavRow({
  icon,
  hue,
  eyebrow,
  title,
  body,
  onPress,
  divider = false,
  accessibilityLabel,
  children,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  eyebrow?: string;
  title: string;
  body?: string;
  onPress: () => void;
  divider?: boolean;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.navRow, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <NavRowBody icon={icon} hue={hue} eyebrow={eyebrow} title={title} body={body}>
        {children}
      </NavRowBody>
    </PressableView>
  );
}

function NavRowBody({
  icon,
  hue,
  eyebrow,
  title,
  body,
  children,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={styles.navInner}>
      <HueTile icon={icon} hue={hue} />
      <View style={styles.navText}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <ThemedText style={[styles.navTitle, { color: colors.text }]}>{title}</ThemedText>
        {body ? (
          <ThemedText tone="muted" style={styles.body}>
            {body}
          </ThemedText>
        ) : null}
        {children}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
    </View>
  );
}

/**
 * Small figures side by side under a hero (boards R7-Monthly, R7-Weekly):
 * label over value, split by thin rules. Wraps to a second line past three.
 */
export function MetricStrip({
  items,
  style,
}: {
  items: { label: string; value: ReactNode; tone?: 'default' | 'positive' | 'negative' }[];
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemeTokens();
  const rows: (typeof items)[] = [];
  for (let index = 0; index < items.length; index += 3) rows.push(items.slice(index, index + 3));
  return (
    <View style={[styles.strip, { borderTopColor: colors.border }, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.stripRow, rowIndex > 0 && styles.stripRowGap]}>
          {row.map((item, index) => (
            <View
              key={item.label}
              style={[
                styles.metric,
                index > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 12 },
              ]}>
              <ThemedText tone="muted" numberOfLines={1} style={styles.metricLabel}>
                {item.label}
              </ThemedText>
              {typeof item.value === 'string' ? (
                <ThemedText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    styles.metricValue,
                    {
                      color:
                        item.tone === 'positive'
                          ? colors.positive
                          : item.tone === 'negative'
                            ? colors.negative
                            : colors.text,
                    },
                  ]}>
                  {item.value}
                </ThemedText>
              ) : (
                item.value
              )}
            </View>
          ))}
          {/* An unfilled last row keeps its columns at the first row's width. */}
          {row.length < 3 && rows.length > 1
            ? Array.from({ length: 3 - row.length }, (_, index) => (
                <View key={`pad-${index}`} style={styles.metric} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

/** The value style a `MetricStrip` cell uses, for a counting figure passed in as a node. */
export const metricValueStyle = {
  fontSize: 16,
  lineHeight: 22,
  fontWeight: '700' as const,
  fontVariant: ['tabular-nums' as const],
};

/** A 6dp bar on the `track` colour. */
export function ProgressBar({
  fraction,
  color,
  style,
}: {
  fraction: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemeTokens();
  const width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  return (
    <View style={[styles.bar, { backgroundColor: colors.track }, style]}>
      <View style={[styles.barFill, { width, backgroundColor: color }]} />
    </View>
  );
}

/** A 36dp circle with a name's initial (boards R7-Analysis, R7-Monthly merchant rows). */
export function MonogramTile({ name }: { name: string }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.monogram, { backgroundColor: colors.track }]}>
      <ThemedText style={[styles.monogramLabel, { color: colors.text }]}>
        {getMonogram(name)}
      </ThemedText>
    </View>
  );
}

/**
 * A row with a bar under its name (boards R7-Analysis "By category",
 * R7-Monthly "Where it went"): tile, name and amount, the bar, a caption,
 * and a chevron when it opens something.
 */
export function BarRow({
  icon,
  hue,
  title,
  amount,
  fraction,
  caption,
  divider = false,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hue: string;
  title: string;
  amount: string;
  fraction: number;
  caption?: string;
  divider?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.barRow, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <HueTile icon={icon} hue={hue} />
      <View style={styles.barRowText}>
        <View style={styles.barRowLine}>
          <ThemedText numberOfLines={1} style={[styles.barRowTitle, { color: colors.text }]}>
            {title}
          </ThemedText>
          <ThemedText style={[styles.barRowAmount, { color: colors.text }]}>{amount}</ThemedText>
        </View>
        <ProgressBar fraction={fraction} color={hue} style={styles.barRowBar} />
        {caption ? (
          <ThemedText tone="muted" style={styles.body}>
            {caption}
          </ThemedText>
        ) : null}
      </View>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} /> : null}
    </PressableView>
  );
}

/** `1–12 Oct`, `28 Sep – 4 Oct`, or `1 Oct` for a single day, from two `YYYY-MM-DD`. */
export const periodRangeLabel = (start?: string | null, end?: string | null) => {
  const parse = (value?: string | null) => {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const from = parse(start);
  const to = parse(end) ?? from;
  if (!from || !to) return '';
  const month = (date: Date) => date.toLocaleString('en-US', { month: 'short' });
  if (from.toDateString() === to.toDateString()) return `${from.getDate()} ${month(from)}`;
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${to.getDate()} ${month(to)}`;
  }
  return `${from.getDate()} ${month(from)} – ${to.getDate()} ${month(to)}`;
};

/** A small rounded label — "Finnri plan", "Exceeded". */
export function Tag({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <ThemedText style={[styles.tagLabel, { color }]}>{label}</ThemedText>
    </View>
  );
}

export const insightText = StyleSheet.create({
  figure: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardPadded: {
    padding: 16,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  navInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  navTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  strip: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  stripRow: {
    flexDirection: 'row',
  },
  stripRowGap: {
    marginTop: 12,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  metricValue: metricValueStyle,
  bar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  barRowText: {
    flex: 1,
    minWidth: 0,
  },
  barRowLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  barRowTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  barRowAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  barRowBar: {
    marginTop: 6,
    marginBottom: 4,
  },
  monogram: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
