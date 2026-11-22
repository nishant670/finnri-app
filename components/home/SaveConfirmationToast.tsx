import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated as RNAnimated } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { SAVE_TOAST_BOTTOM_OFFSET } from './home-layout';

/**
 * The brief "Saved" confirmation that rises above the add button. With an
 * action (a spoken day's Undo, P115) it takes touches; without one it lets
 * them through to whatever is underneath.
 */
export function SaveConfirmationToast({
  message,
  anim,
  actionLabel,
  onAction,
}: {
  message: string;
  anim: RNAnimated.Value;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useThemeTokens().colors;
  const hasAction = !!actionLabel && !!onAction;

  return (
    <RNAnimated.View
      accessibilityLiveRegion="polite"
      className="absolute self-center z-50 flex-row items-center gap-2 rounded-full px-3 py-2 shadow-md"
      style={{
        bottom: SAVE_TOAST_BOTTOM_OFFSET,
        backgroundColor: theme.accent,
        opacity: anim,
        paddingRight: hasAction ? 4 : undefined,
        paddingVertical: hasAction ? 2 : undefined,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
      pointerEvents={hasAction ? 'box-none' : 'none'}>
      <MaterialCommunityIcons name="check" size={15} color={theme.onAccent} />
      <ThemedText tone="onAccent" className="text-xs font-bold">
        {message}
      </ThemedText>
      {hasAction ? (
        <PressableView
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${message}`}
          onPress={onAction}
          style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center' }}
          pressedStyle={{ opacity: 0.6 }}>
          <ThemedText tone="onAccent" className="text-xs font-bold" style={{ textDecorationLine: 'underline' }}>
            {actionLabel}
          </ThemedText>
        </PressableView>
      ) : null}
    </RNAnimated.View>
  );
}
