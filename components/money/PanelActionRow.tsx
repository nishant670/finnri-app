import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import type { useThemeTokens } from '@/hooks/use-theme-tokens';

type PanelActionRowProps = {
  subtitle: string;
  actionLabel?: string;
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onAction?: () => void;
  colors: ReturnType<typeof useThemeTokens>['colors'];
};

/**
 * What a panel shows in place of its own header inside the Money tab.
 *
 * Each of these screens used to own a full `AppHeader` with a title and a back
 * arrow. Embedded, the title would repeat what the segment pill already says
 * and the back arrow would leave the tab entirely — so the panel keeps only
 * the two things the header was actually carrying: a line of state and its
 * primary action.
 *
 * The action is the outlined "+ Add" pill the boards put on this line (R5-*),
 * never an accent fill: the panel's own content may hold the screen's one
 * orange action, and an add button is not it.
 */
export function PanelActionRow({
  subtitle,
  actionLabel,
  actionIcon = 'plus',
  onAction,
  colors,
}: PanelActionRowProps) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-6 pb-1" style={{ minHeight: 36 }}>
      <ThemedText
        numberOfLines={2}
        className="min-w-0 flex-1"
        style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
        {subtitle}
      </ThemedText>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          height={36}
          icon={actionIcon}
          label={actionLabel}
          accessibilityLabel={actionLabel}
          onPress={onAction}
        />
      )}
    </View>
  );
}
