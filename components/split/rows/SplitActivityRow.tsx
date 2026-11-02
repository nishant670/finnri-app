import { memo } from 'react';
import Animated from 'react-native-reanimated';

import { ListRow } from '@/components/ui/ListRow';
import { buildRecentActivity } from '@/lib/split-screen-model';
import { formatBalance } from '@/components/split/split-utils';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { SplitActivityItem } from '@/lib/splits';

type SplitActivityRowProps = {
  item: ReturnType<typeof buildRecentActivity>[number];
  /** Omitted for rows that should simply appear — anything past the first screen. */
  entranceIndex?: number;
  /** Stable across renders, so a row only redraws when its own item changes. */
  onOpen: (activity: SplitActivityItem) => void;
  /** The rule above the row: every row in a day's card but the first. */
  divider?: boolean;
  /**
   * Whether the caption carries the date. Under a day heading a plain day
   * would repeat it, so only an "Edited …" or "Added …" note is kept.
   */
  showDate?: boolean;
};

/**
 * One line of the Activity feed, as a row of its day's card (board
 * R6-Activity). Memoised: the feed is a virtualised list that can run to
 * hundreds of rows, and every row redrawing whenever the screen above it
 * changed is the cost the list exists to avoid.
 */
export const SplitActivityRow = memo(function SplitActivityRow({
  item,
  entranceIndex,
  onOpen,
  divider = false,
  showDate = true,
}: SplitActivityRowProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const dateNote = showDate || /^(Edited|Added)\b/.test(item.date) ? item.date : '';
  return (
    <Animated.View
      entering={entranceIndex == null ? undefined : motion.rowEntering(entranceIndex)}
      layout={motion.reflow()}>
      <ListRow
        icon={item.icon}
        hue={theme.accent}
        title={item.title}
        meta={[item.caption, dateNote].filter(Boolean).join(' • ')}
        amount={item.amount != null ? formatBalance(item.amount) : undefined}
        amountTone={item.status === 'denied' ? 'muted' : 'default'}
        status={
          item.status === 'denied'
            ? 'Denied'
            : item.status
              ? 'Awaiting confirmation'
              : undefined
        }
        statusTone={item.status === 'denied' ? 'negative' : 'warning'}
        divider={divider}
        accessibilityLabel={`Open activity ${item.title}`}
        onPress={() => onOpen(item.item)}
      />
    </Animated.View>
  );
});
