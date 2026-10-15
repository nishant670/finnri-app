import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BalanceFigure } from '@/components/split/BalanceFigure';
import { Card } from '@/components/ui/theme-primitives';
import { GroupAvatar } from '@/components/split/GroupAvatar';
import { SwipeActionRow } from '@/components/split/rows/SwipeActionRow';
import { TText } from '@/components/split/primitives/themed-interop';
import { getBalanceTone } from '@/lib/split-screen-helpers';
import { getGroupKindConfig } from '@/components/split/split-utils';
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
};

export function SplitGroupCard({
  summary,
  entranceIndex,
  isOpen,
  onOpenChange,
  onEdit,
  onArchive,
  onOpen,
}: SplitGroupCardProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const { group, detailLines, roster, kind, netBalance, billCount, latestBill } = summary;
  const tone = getBalanceTone(netBalance, theme, billCount > 0);
  const kindConfig = getGroupKindConfig(kind);
  const memberNames = roster
    .filter((person) => !person.isViewer)
    .map((person) => person.name)
    .join(', ');

  return (
    <Animated.View entering={motion.rowEntering(entranceIndex)} layout={motion.reflow()}>
      <SwipeActionRow
        open={isOpen}
        onOpenChange={onOpenChange}
        actions={
          group.viewer_can_manage
            ? [
                {
                  label: 'Edit',
                  icon: 'pencil-outline' as const,
                  onPress: onEdit,
                },
                {
                  label: 'Archive',
                  icon: 'archive-outline' as const,
                  tone: 'destructive' as const,
                  onPress: onArchive,
                },
              ]
            : []
        }>
        <Card compact style={{ padding: 0 }}>
          <Pressable accessibilityRole="button" onPress={onOpen} className="flex-row gap-4 p-4">
            <GroupAvatar icon={kindConfig.icon} photoUri={group.photo_url || null} />
            <View className="flex-1 justify-center">
              <TText variant="cardTitle" style={{ color: theme.text }}>
                {group.name}
              </TText>
              <View className="mt-1">
                <BalanceFigure value={netBalance} color={tone.color} hasActivity={billCount > 0} />
              </View>
              {detailLines.length > 0 ? (
                detailLines.map((line) => (
                  <TText
                    key={line}
                    className="mt-1 text-sm"
                    style={{ color: theme.muted }}
                    numberOfLines={1}>
                    {line}
                  </TText>
                ))
              ) : (
                <TText className="mt-1 text-sm" style={{ color: theme.muted }} numberOfLines={1}>
                  {latestBill
                    ? `${billCount} bill${billCount === 1 ? '' : 's'} • last on ${latestBill.date}`
                    : // The balance line above already says "No expenses yet"
                      // when there are none, so this line spends itself on
                      // the next thing the user needs instead of repeating it.
                      memberNames || 'Add members or the first expense'}
                </TText>
              )}
            </View>
          </Pressable>
        </Card>
      </SwipeActionRow>
    </Animated.View>
  );
}
