import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AvatarCircle } from '@/components/split/primitives/SplitPrimitives';
import { Card } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { SwipeActionRow } from '@/components/split/rows/SwipeActionRow';
import { TText } from '@/components/split/primitives/themed-interop';
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
};

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
}: SplitFriendRowProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const isReceivable = netBalance > 0;
  const isPayable = netBalance < 0;
  const amountColor = isReceivable ? theme.positive : isPayable ? theme.negative : theme.neutral;
  const balanceLabel = isReceivable ? 'owes you' : isPayable ? 'you owe' : 'settled';

  return (
    <Animated.View entering={motion.rowEntering(entranceIndex)} layout={motion.reflow()}>
      <SwipeActionRow
        open={isOpen}
        onOpenChange={onOpenChange}
        actions={[
          {
            label: 'Edit',
            icon: 'pencil-outline',
            onPress: onEdit,
          },
          {
            label: 'Archive',
            icon: 'archive-outline',
            tone: 'destructive',
            onPress: onArchive,
          },
        ]}>
        <Card compact style={{ padding: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${friend.name}`}
            onPress={onOpen}
            onLongPress={onLongPress}
            className="flex-row items-center gap-4 p-4">
            <AvatarCircle label={friend.name} size={58} />
            <View className="flex-1">
              <TText variant="cardTitle" style={{ color: theme.text }}>
                {friend.name}
              </TText>
              <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
                {[friend.phone, friend.email].filter(Boolean).join(' • ') || 'No contact saved'}
              </TText>
              <TText
                className="mt-1 text-sm"
                style={{ color: amountColor, fontFamily: Fonts.title }}>
                {formatBalance(netBalance)} {balanceLabel}
              </TText>
            </View>
          </Pressable>
        </Card>
      </SwipeActionRow>
    </Animated.View>
  );
}
