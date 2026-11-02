import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { FAB_BOTTOM_OFFSET, FAB_RIGHT_OFFSET, FAB_SIZE } from './home-layout';

/** The floating add button that opens manual entry (board R3-Home: 56dp, 16 in). */
export function HomeAddButton({ onPress }: { onPress: () => void }) {
  const theme = useThemeTokens().colors;

  return (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel="Add manually"
      onPress={onPress}
      style={[styles.fab, { backgroundColor: theme.accent }]}
      pressedStyle={styles.pressed}>
      <MaterialCommunityIcons name="plus" size={28} color={theme.onAccent} />
    </PressableView>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: FAB_BOTTOM_OFFSET,
    right: FAB_RIGHT_OFFSET,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2D2D2D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  pressed: {
    opacity: 0.85,
  },
});
