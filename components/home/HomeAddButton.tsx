import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { FAB_BOTTOM_OFFSET, FAB_RIGHT_OFFSET, FAB_SIZE } from './home-layout';

/** The floating add button that opens manual entry. */
export function HomeAddButton({ onPress }: { onPress: () => void }) {
  const themeTokens = useThemeTokens();
  const theme = themeTokens.colors;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        {
          backgroundColor: theme.accent,
          height: FAB_SIZE,
          width: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          bottom: FAB_BOTTOM_OFFSET,
          right: FAB_RIGHT_OFFSET,
        },
        themeTokens.shadows.soft,
      ]}
      className="items-center justify-center absolute elevation-5">
      <MaterialCommunityIcons name="plus" size={32} color="white" />
    </Pressable>
  );
}
