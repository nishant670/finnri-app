import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Shimmer } from '@/components/ui/Shimmer';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/**
 * The shapes a screen wears while it is still empty.
 *
 * `Shimmer` is one block. This is the vocabulary built out of it, and it exists
 * for the same reason `useMotion` exists: a placeholder is only worth more than
 * a spinner if it is the *right* shape, and "the right shape" is a set of
 * measurements — a 48px icon circle, a 24px card radius, a 12px gap to the next
 * row — that already live in the components being stood in for. Spelled again
 * at each call site they drift, and a skeleton that drifts is a screen that
 * jumps when the data lands, which is the failure it was added to prevent.
 *
 * ## Why a spinner was the wrong answer everywhere it was used
 *
 * A spinner says "wait". It does not say what for, it occupies none of the
 * space the answer will need, and it is identical on nine screens that look
 * nothing alike. The whole cost of the wait is then paid twice: once looking at
 * nothing, and again when the content lands and shoves the layout into place.
 *
 * ## Every skeleton is invisible to a screen reader
 *
 * A placeholder is a drawing of content that does not exist yet. Announcing
 * eight rows of nothing is worse than announcing nothing at all, so the shapes
 * are hidden and the *frame* carries one honest label — "Loading transactions"
 * — which is the one thing a screen reader user actually needs from this state.
 * `Shimmer` hides itself; `SkeletonFrame` supplies the label.
 */

/**
 * How many sweep slots one row and one card each occupy.
 *
 * `Shimmer` offsets its sweep by `index * 0.18` of a cycle, so two blocks handed
 * the same index pulse together. A row draws six blocks and a card six, and
 * giving them a *base* of anything narrower means row 2's icon shares a slot
 * with row 1's amount — the unison this offset exists to break, reintroduced
 * one row down. Callers that stack groups reserve bands in these units.
 */
export const ROW_BLOCKS = 6;
export const CARD_BLOCKS = 6;

/**
 * Widths for the text lines, so a stack of placeholders does not read as a
 * block of identical bars. Real titles are ragged and these are too.
 */
const LINE_WIDTHS = ['78%', '62%', '70%', '54%'] as const;

/** Ragged but deterministic — the same row always draws the same width. */
export const lineWidth = (seed: number) => LINE_WIDTHS[seed % LINE_WIDTHS.length];

type SkeletonFrameProps = {
  /** What is being waited for, in the words the screen would use. */
  label: string;
  testID?: string;
  style?: ViewStyle;
  children: ReactNode;
};

/**
 * The outside of a loading screen: one accessibility label for the whole thing,
 * and nothing underneath it that a screen reader can reach.
 */
export function SkeletonFrame({ label, testID, style, children }: SkeletonFrameProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={style}>
      {children}
    </View>
  );
}

type SkeletonCardProps = {
  children: ReactNode;
  radius?: number;
  padding?: number;
  style?: ViewStyle;
};

/**
 * A card-shaped hole. It draws the surface and the border for real — those are
 * the parts of a card that are already known before the data arrives, and
 * shimmering them too would make the card itself look like it was still
 * loading rather than its contents.
 */
export function SkeletonCard({ children, radius = 26, padding = 18, style }: SkeletonCardProps) {
  const theme = useThemeTokens();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: radius,
          padding,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type SkeletonRowProps = {
  /** Position in the group, which is what offsets the sweep. */
  index?: number;
  /** `card` matches `TransactionItem`'s card variant; `list` its list variant. */
  variant?: 'card' | 'list';
  /** Draws the trailing amount block. Off for rows that carry no figure. */
  showAmount?: boolean;
  /** A third line — "Last activity 3 Aug" and the like. */
  lines?: 2 | 3;
};

/**
 * Icon circle, a title, a meta line, and a figure on the right.
 *
 * This is the shape of every list the app has — transactions, accounts,
 * notifications, split activity — because they are all the same row wearing
 * different words. Its measurements are `TransactionItem`'s, so a feed of these
 * is the same height as the feed that replaces it.
 */
export function SkeletonRow({
  index = 0,
  variant = 'card',
  showAmount = true,
  lines = 2,
}: SkeletonRowProps) {
  const isList = variant === 'list';
  // The list row is the redesign's 60-tall row with a 36 tile at radius 10;
  // the card row is the older 48-circle card.
  const iconSize = isList ? 36 : 48;
  const base = index * ROW_BLOCKS;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: isList ? 14 : 16,
        ...(isList ? { height: 60 } : { paddingVertical: 16 }),
      }}>
      <Shimmer
        width={iconSize}
        height={iconSize}
        radius={isList ? 10 : iconSize / 2}
        index={base}
        style={{ marginRight: isList ? 12 : 16 }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
        <Shimmer width={lineWidth(index)} height={isList ? 11 : 13} index={base + 1} />
        <Shimmer width={lineWidth(index + 2)} height={isList ? 9 : 11} index={base + 2} />
        {lines === 3 && <Shimmer width="44%" height={9} index={base + 3} />}
      </View>
      {showAmount && (
        <View style={{ marginLeft: 10, alignItems: 'flex-end', gap: 7 }}>
          <Shimmer width={isList ? 58 : 72} height={isList ? 11 : 13} index={base + 4} />
          <Shimmer width={isList ? 34 : 44} height={9} index={base + 5} />
        </View>
      )}
    </View>
  );
}

type SkeletonRowsProps = {
  count?: number;
  variant?: 'card' | 'list';
  showAmount?: boolean;
  lines?: 2 | 3;
  /** Draws each row on its own card surface, the way a feed of cards reads. */
  carded?: boolean;
  /** Offsets the sweep so a group below another group does not restart it. */
  startIndex?: number;
};

/**
 * A run of rows.
 *
 * The count is the caller's, because "how many rows fit" is a property of the
 * screen and not of the row: a full-height feed that draws three placeholders
 * leaves most of the frame blank, which is the thing being fixed.
 */
export function SkeletonRows({
  count = 5,
  variant = 'card',
  showAmount = true,
  lines = 2,
  carded = true,
  startIndex = 0,
}: SkeletonRowsProps) {
  const theme = useThemeTokens();

  return (
    <View style={{ gap: carded ? 12 : 0 }}>
      {Array.from({ length: count }, (_, row) =>
        carded ? (
          <View
            key={row}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 24,
            }}>
            <SkeletonRow
              index={startIndex + row}
              variant={variant}
              showAmount={showAmount}
              lines={lines}
            />
          </View>
        ) : (
          <SkeletonRow
            key={row}
            index={startIndex + row}
            variant={variant}
            showAmount={showAmount}
            lines={lines}
          />
        )
      )}
    </View>
  );
}

type SkeletonTextCardProps = {
  index?: number;
  /** How many body lines under the heading. */
  lines?: number;
  /** Draws a leading icon chip, the way the insight and alert cards do. */
  withIcon?: boolean;
  radius?: number;
};

/**
 * A card of prose — a takeaway, an alert, a budget row, a plan. Heading, a
 * couple of lines, and optionally the icon chip the real card leads with.
 */
export function SkeletonTextCard({
  index = 0,
  lines = 2,
  withIcon = true,
  radius = 26,
}: SkeletonTextCardProps) {
  const base = index * CARD_BLOCKS;

  return (
    <SkeletonCard radius={radius}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {withIcon && <Shimmer width={40} height={40} radius={14} index={base} />}
        <View style={{ flex: 1, gap: 8 }}>
          <Shimmer width="52%" height={13} index={base + 1} />
          <Shimmer width="32%" height={10} index={base + 2} />
        </View>
      </View>
      <View style={{ marginTop: 16, gap: 9 }}>
        {Array.from({ length: lines }, (_, line) => (
          <Shimmer key={line} width={lineWidth(index + line)} height={10} index={base + 3 + line} />
        ))}
      </View>
    </SkeletonCard>
  );
}

type SkeletonCardsProps = {
  count?: number;
  lines?: number;
  withIcon?: boolean;
  radius?: number;
  gap?: number;
};

/** A stack of `SkeletonTextCard`s — the shape most non-list screens load into. */
export function SkeletonCards({
  count = 3,
  lines = 2,
  withIcon = true,
  radius = 26,
  gap = 16,
}: SkeletonCardsProps) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }, (_, card) => (
        <SkeletonTextCard
          key={card}
          index={card}
          lines={lines}
          withIcon={withIcon}
          radius={radius}
        />
      ))}
    </View>
  );
}

/**
 * A figure and its label, side by side or in a grid. The label is drawn short
 * and the figure wide, because that is how a stat reads and a placeholder that
 * inverts it looks like a paragraph.
 */
export function SkeletonStat({ index = 0, width }: { index?: number; width?: ViewStyle['width'] }) {
  return (
    <View style={{ width, flex: width === undefined ? 1 : undefined, gap: 9 }}>
      <Shimmer width="54%" height={9} index={index * 2} />
      <Shimmer width="82%" height={20} radius={8} index={index * 2 + 1} />
    </View>
  );
}
