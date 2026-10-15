import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BalanceFigure } from '@/components/split/BalanceFigure';
import { Card } from '@/components/ui/theme-primitives';
import { GroupTile } from '@/components/split/rows/GroupTile';
import { TText } from '@/components/split/primitives/themed-interop';
import { buildNonGroupSummary } from '@/lib/split-screen-model';
import { getBalanceTone } from '@/lib/split-screen-helpers';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SplitNonGroupRowProps = {
  summary: ReturnType<typeof buildNonGroupSummary>;
  entranceIndex: number;
  onPress: () => void;
};

export function SplitNonGroupRow({
  summary: nonGroupSummary,
  entranceIndex,
  onPress,
}: SplitNonGroupRowProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  const tone = getBalanceTone(nonGroupSummary.netBalance, theme, nonGroupSummary.billCount > 0);
  return (
    <Animated.View entering={motion.rowEntering(entranceIndex)} layout={motion.reflow()}>
      <Card compact style={{ padding: 0 }}>
        <Pressable accessibilityRole="button" onPress={onPress} className="flex-row gap-4 p-4">
          <GroupTile icon="receipt-text-outline" />
          <View className="flex-1 justify-center">
            <TText variant="cardTitle" style={{ color: theme.text }}>
              Non-group expenses
            </TText>
            <View className="mt-1">
              <BalanceFigure
                value={nonGroupSummary.netBalance}
                color={tone.color}
                hasActivity={nonGroupSummary.billCount > 0}
              />
            </View>
            {nonGroupSummary.detailLines.length > 0 ? (
              nonGroupSummary.detailLines.map((line) => (
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
                {nonGroupSummary.latestBill
                  ? `${nonGroupSummary.billCount} bill${
                      nonGroupSummary.billCount === 1 ? '' : 's'
                    } • last on ${nonGroupSummary.latestBill.date}`
                  : 'Personal shared expenses'}
              </TText>
            )}
          </View>
        </Pressable>
      </Card>
    </Animated.View>
  );
}
