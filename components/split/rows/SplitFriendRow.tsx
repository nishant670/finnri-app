import Animated from 'react-native-reanimated';

import { AvatarCircle } from '@/components/split/primitives/SplitPrimitives';
import { SwipeActionRow } from '@/components/split/rows/SwipeActionRow';
import { ListRow } from '@/components/ui/ListRow';
import { formatBalance } from '@/components/split/split-utils';
import { type SplitFriend } from '@/lib/splits';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitFriendRowProps = {
  friend: SplitFriend;
  /** What the friend owes the user; negative when the user owes them. */
  netBalance: number;
  entranceIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onArchive: () => void;
  onOpen: () => void;
  onLongPress: () => void;
  divider?: boolean;
};

/**
 * One friend as a row of the Friends card: initials, name and contact, and
 * the balance on the right — green and "owes you", red and "you owe".
 */
export function SplitFriendRow({
  friend,
  netBalance,
  entranceIndex,
  isOpen,
  onOpenChange,
  onEdit,
  onArchive,
  onOpen,
  onLongPress,
  divider = false,
}: SplitFriendRowProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const isReceivable = netBalance > 0;
  const isPayable = netBalance < 0;

  return (
    <Animated.View entering={motion.rowEntering(entranceIndex)} layout={motion.reflow()}>
      <SwipeActionRow
        open={isOpen}
        onOpenChange={onOpenChange}
        actions={[
          { label: 'Edit', icon: 'pencil-outline', onPress: onEdit },
          { label: 'Archive', icon: 'archive-outline', tone: 'destructive', onPress: onArchive },
        ]}>
        <ListRow
          icon="account-outline"
          hue={theme.text}
          leading={<AvatarCircle label={friend.name} size={36} />}
          title={friend.name}
          meta={[friend.phone, friend.email].filter(Boolean).join(' • ') || 'No contact saved'}
          amount={formatBalance(netBalance)}
          amountTone={isReceivable ? 'positive' : isPayable ? 'negative' : 'muted'}
          status={isReceivable ? 'owes you' : isPayable ? 'you owe' : 'settled'}
          divider={divider}
          accessibilityLabel={`Open ${friend.name}`}
          onPress={onOpen}
          onLongPress={onLongPress}
        />
      </SwipeActionRow>
    </Animated.View>
  );
}
