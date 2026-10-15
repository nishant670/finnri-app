import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { TText } from '@/components/split/primitives/themed-interop';
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
};

/**
 * One line of the Activity feed. Memoised: the feed is a virtualised list that
 * can run to hundreds of rows, and every row redrawing whenever the screen
 * above it changed is the cost the list exists to avoid.
 */
export const SplitActivityRow = memo(function SplitActivityRow({
  item,
  entranceIndex,
  onOpen,
}: SplitActivityRowProps) {
  const theme = useThemeTokens().colors;
  const motion = useMotion();
  return (
    <Animated.View
      entering={entranceIndex == null ? undefined : motion.rowEntering(entranceIndex)}
      layout={motion.reflow()}>
      <Card compact style={{ padding: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open activity ${item.title}`}
          onPress={() => onOpen(item.item)}
          className="flex-row items-center gap-4 p-4">
          <View
            className="h-[58px] w-[58px] items-center justify-center rounded-xl"
            style={{ backgroundColor: theme.secondary }}>
            <MaterialCommunityIcons name={item.icon} size={26} color={theme.accent} />
          </View>
          <View className="flex-1">
            <TText variant="cardTitle" style={{ color: theme.text }}>
              {item.title}
            </TText>
            <TText className="mt-1 text-xs" style={{ color: theme.muted }}>
              {item.caption} • {item.date}
            </TText>
            {item.status ? (
              <View
                className="mt-2 self-start rounded-full px-2 py-1"
                style={{
                  backgroundColor:
                    item.status === 'denied' ? `${theme.negative}1F` : theme.secondary,
                }}>
                <TText
                  className="text-[11px]"
                  style={{
                    color: item.status === 'denied' ? theme.negative : theme.accent,
                    fontFamily: Fonts.title,
                  }}>
                  {item.status === 'denied' ? 'Denied' : 'Awaiting confirmation'}
                </TText>
              </View>
            ) : null}
          </View>
          {item.amount != null ? (
            <TText
              className="text-sm"
              style={{
                color: theme.text,
                fontFamily: Fonts.title,
                textDecorationLine: item.status === 'denied' ? 'line-through' : 'none',
              }}>
              {formatBalance(item.amount)}
            </TText>
          ) : null}
        </Pressable>
      </Card>
    </Animated.View>
  );
});
