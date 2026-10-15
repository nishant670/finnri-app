import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated as RNAnimated } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { SAVE_TOAST_BOTTOM_OFFSET } from './home-layout';

/** The brief "Saved" confirmation that rises above the add button. */
export function SaveConfirmationToast({
  message,
  anim,
}: {
  message: string;
  anim: RNAnimated.Value;
}) {
  const theme = useThemeTokens().colors;

  return (
    <RNAnimated.View
      accessibilityLiveRegion="polite"
      className="absolute self-center z-50 flex-row items-center gap-2 rounded-full px-3 py-2 shadow-md"
      style={{
        bottom: SAVE_TOAST_BOTTOM_OFFSET,
        backgroundColor: theme.accent,
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
      pointerEvents="none">
      <MaterialCommunityIcons name="check" size={15} color="white" />
      <ThemedText tone="onAccent" className="text-xs font-bold">
        {message}
      </ThemedText>
    </RNAnimated.View>
  );
}
