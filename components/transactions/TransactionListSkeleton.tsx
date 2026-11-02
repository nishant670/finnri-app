import { StyleSheet, View } from 'react-native';

import { Shimmer } from '@/components/ui/Shimmer';
import {
  ROW_BLOCKS,
  SkeletonCard,
  SkeletonFrame,
  SkeletonRows,
  SkeletonStat,
  lineWidth,
} from '@/components/ui/Skeleton';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * What the transaction feed is about to look like: two day headings with their
 * running total, and rows under each.
 *
 * The headings matter more than they look. The feed's rows are grouped by date
 * and the group heading is the tallest single jump the layout makes when data
 * lands — a skeleton of rows alone would settle correctly and *then* have every
 * row pushed down by a heading it did not account for.
 */

/** Rows per day. Two days of four fills a handset screen without overrunning it. */
const DAY_SHAPE = [4, 3] as const;

const TOTAL_ROWS = DAY_SHAPE.reduce((total, rows) => total + rows, 0);

/**
 * The headings take their sweep slots from past the end of the rows'.
 *
 * A heading is two blocks and a row is `ROW_BLOCKS`, so the two counts are in
 * different units and cannot be interleaved by accident — starting the headings
 * at 0 alongside the rows is how a day label ends up pulsing in time with the
 * icon of the row beneath it.
 */
const HEADING_BAND = TOTAL_ROWS * ROW_BLOCKS;

export function TransactionListSkeleton() {
  const { colors } = useThemeTokens();
  return (
    <SkeletonFrame label="Loading transactions" testID="transaction-list-skeleton">
      {DAY_SHAPE.map((rows, day) => (
        <View key={day}>
          <View style={styles.dayHeading}>
            <Shimmer width={72} height={12} index={HEADING_BAND + day * 2} />
            <Shimmer width={56} height={12} index={HEADING_BAND + day * 2 + 1} />
          </View>
          <View style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SkeletonRows
              count={rows}
              variant="list"
              carded={false}
              startIndex={DAY_SHAPE.slice(0, day).reduce((total, count) => total + count, 0)}
            />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

/**
 * Category Detail and Merchant History, which are the same screen twice: a
 * centred hero, two metric cards, a search field, and then the feed.
 *
 * They share one shape because they share one layout — the alternative was two
 * near-identical placeholders that would each have to be remembered whenever
 * either screen moved a card.
 */
export function HistoryDetailSkeleton({ label }: { label: string }) {
  return (
    <SkeletonFrame label={label} testID="history-detail-skeleton">
      <View className="items-center px-5 py-8">
        <Shimmer width={96} height={96} radius={32} index={0} />
        <Shimmer width={220} height={30} radius={10} index={1} style={{ marginTop: 24 }} />
        <Shimmer width={168} height={44} radius={22} index={2} style={{ marginTop: 20 }} />
      </View>

      <View className="mx-5 mb-7 flex-row gap-3">
        {[0, 1].map((metric) => (
          <SkeletonCard key={metric} radius={24} padding={16} style={{ flex: 1 }}>
            <SkeletonStat index={metric + 2} />
          </SkeletonCard>
        ))}
      </View>

      {/* The search field is real on the screen this replaces, so it is drawn
          at its own height rather than as a row of text lines. */}
      <Shimmer height={62} radius={24} index={7} style={{ marginHorizontal: 20, marginBottom: 28 }} />

      <View className="px-5">
        <SkeletonRows count={4} startIndex={2} />
      </View>
    </SkeletonFrame>
  );
}

/**
 * One transaction opened up: the hero — icon, amount, title — and the details
 * card of labelled rows under it.
 *
 * This screen is reached by tapping a row that is already on screen, so the
 * wait is short and the shape is mostly what makes it bearable: the amount the
 * user just tapped lands exactly where the placeholder held it.
 */
export function EntryDetailSkeleton() {
  const { colors } = useThemeTokens();
  return (
    <SkeletonFrame label="Loading transaction" testID="entry-detail-skeleton">
      <View style={styles.hero}>
        <Shimmer width={48} height={48} radius={14} index={0} />
        <Shimmer width={140} height={36} radius={10} index={1} style={{ marginTop: 12 }} />
        <Shimmer width={148} height={16} radius={8} index={2} style={{ marginTop: 8 }} />
        <Shimmer width={200} height={12} radius={6} index={3} style={{ marginTop: 8 }} />
      </View>

      <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[0, 1, 2].map((row) => (
          <View
            key={row}
            style={[styles.detailRow, row > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Shimmer width={64} height={12} index={4 + row * 2} />
            <Shimmer width={lineWidth(row)} height={14} index={5 + row * 2} style={{ flex: 1 }} />
          </View>
        ))}
      </View>
    </SkeletonFrame>
  );
}

const styles = StyleSheet.create({
  dayHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
    marginHorizontal: SCREEN_GUTTER,
  },
  dayCard: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: SCREEN_GUTTER,
  },
  detailCard: {
    marginTop: 20,
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    paddingHorizontal: 14,
  },
});
