import Animated from 'react-native-reanimated';

import { GroupAvatar } from '@/components/split/GroupAvatar';
import { SwipeActionRow } from '@/components/split/rows/SwipeActionRow';
import { ListRow } from '@/components/ui/ListRow';
import { formatBalance, getGroupKindConfig, zeroBalanceLabel } from '@/components/split/split-utils';
import { type SplitGroupSummary } from '@/components/split/split-types';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitGroupCardProps = {
  summary: SplitGroupSummary;
  entranceIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onArchive: () => void;
  onOpen: () => void;
  /** The rule above the row: every row in the Groups card but the first. */
  divider?: boolean;
};

/**
 * One group as a row of the Groups card (board R6-Groups): its photo or kind
 * tile, its name, who owes whom under it, and the balance on the right — green
 * when you're owed, red when you owe, always with the words.
 */
export function SplitGroupCard({
  summary,
  entranceIndex,
  isOpen,
  onOpenChange,
  onEdit,
  onArchive,
  onOpen,
  divider = false,
}: SplitGroupCardProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const { group, detailLines, roster, kind, netBalance, billCount, latestBill } = summary;
  const kindConfig = getGroupKindConfig(kind);
  const memberNames = roster
    .filter((person) => !person.isViewer)
    .map((person) => person.name)
    .join(', ');
  const meta =
    detailLines.length > 0
      ? detailLines.join(' · ')
      : latestBill
        ? `${billCount} bill${billCount === 1 ? '' : 's'} • last on ${latestBill.date}`
        : // The status already says "No expenses yet" when there are none, so
          // this line spends itself on the next thing the user needs.
          memberNames || 'Add members or the first expense';

  return (
    <Animated.View entering={motion.rowEntering(entranceIndex)} layout={motion.reflow()}>
      <SwipeActionRow
        open={isOpen}
        onOpenChange={onOpenChange}
        actions={
          group.viewer_can_manage
            ? [
                { label: 'Edit', icon: 'pencil-outline' as const, onPress: onEdit },
                {
                  label: 'Archive',
                  icon: 'archive-outline' as const,
                  tone: 'destructive' as const,
                  onPress: onArchive,
                },
              ]
            : []
        }>
        <ListRow
          icon={kindConfig.icon}
          hue={theme.text}
          leading={
            <GroupAvatar icon={kindConfig.icon} photoUri={group.photo_url || null} size={36} radius={10} />
          }
          title={group.name}
          meta={meta}
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
          accessibilityLabel={`Open ${group.name}`}
          onPress={onOpen}
        />
      </SwipeActionRow>
    </Animated.View>
  );
}
