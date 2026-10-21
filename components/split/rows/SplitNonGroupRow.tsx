import Animated from 'react-native-reanimated';

import { GroupTile } from '@/components/split/rows/GroupTile';
import { ListRow } from '@/components/ui/ListRow';
import { formatBalance, zeroBalanceLabel } from '@/components/split/split-utils';
import { buildNonGroupSummary } from '@/lib/split-screen-model';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitNonGroupRowProps = {
  summary: ReturnType<typeof buildNonGroupSummary>;
  entranceIndex: number;
  onPress: () => void;
  divider?: boolean;
};

/** Expenses shared outside any group, as the last row of the Groups card. */
export function SplitNonGroupRow({
  summary: nonGroupSummary,
  entranceIndex,
  onPress,
  divider = false,
}: SplitNonGroupRowProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const { netBalance, billCount, detailLines, latestBill } = nonGroupSummary;
  return (
    <Animated.View entering={motion.rowEntering(entranceIndex)} layout={motion.reflow()}>
      <ListRow
        icon="receipt-text-outline"
        hue={theme.text}
        leading={<GroupTile icon="receipt-text-outline" size={36} radius={10} />}
        title="Non-group expenses"
        meta={
          detailLines.length > 0
            ? detailLines.join(' · ')
            : latestBill
              ? `${billCount} bill${billCount === 1 ? '' : 's'} • last on ${latestBill.date}`
              : 'Personal shared expenses'
        }
        amount={netBalance === 0 ? undefined : formatBalance(netBalance)}
        amountTone={netBalance > 0 ? 'positive' : 'negative'}
        status={
          netBalance > 0
            ? "you're owed"
            : netBalance < 0
              ? 'you owe'
              : zeroBalanceLabel({ hasActivity: billCount > 0 })
        }
        divider={divider}
        onPress={onPress}
      />
    </Animated.View>
  );
}
