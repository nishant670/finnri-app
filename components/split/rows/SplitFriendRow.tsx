import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AvatarCircle } from '@/components/split/primitives/SplitPrimitives';
import { SwipeActionRow } from '@/components/split/rows/SwipeActionRow';
import { Button } from '@/components/ui/Button';
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
  /** How many groups the two share, for the caption under the name. */
  groupCount?: number;
  /** P25: shown while the friend owes the user. */
  onRemind?: () => void;
  /** P24: shown while either owes the other. */
  onSettle?: () => void;
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
  groupCount = 0,
  onRemind,
  onSettle,
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
          meta={
            groupCount > 0
              ? `In ${groupCount} group${groupCount === 1 ? '' : 's'}`
              : [friend.phone, friend.email].filter(Boolean).join(' • ') || 'No contact saved'
          }
          amount={formatBalance(netBalance)}
          amountTone={isReceivable ? 'positive' : isPayable ? 'negative' : 'muted'}
          status={isReceivable ? 'owes you' : isPayable ? 'you owe' : 'settled'}
          divider={divider}
          accessibilityLabel={`Open ${friend.name}`}
          onPress={onOpen}
          onLongPress={onLongPress}>
          {/* Board R6-Balances-Proposals: the two things to do about a
              balance, under it, without opening the friend first. */}
          {(isReceivable && onRemind) || ((isReceivable || isPayable) && onSettle) ? (
            <View style={styles.actions}>
              {isReceivable && onRemind ? (
                <Button
                  label="Remind"
                  icon="bell-outline"
                  variant="outline"
                  height={36}
                  accessibilityLabel={`Remind ${friend.name}`}
                  onPress={onRemind}
                  style={styles.action}
                />
              ) : null}
              {(isReceivable || isPayable) && onSettle ? (
                <Button
                  label="Settle up"
                  icon="hand-coin-outline"
                  variant="outline"
                  height={36}
                  accessibilityLabel={`Settle up with ${friend.name}`}
                  onPress={onSettle}
                  style={styles.action}
                />
              ) : null}
            </View>
          ) : null}
        </ListRow>
      </SwipeActionRow>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  action: {
    flex: 1,
  },
});
