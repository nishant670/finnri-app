import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View, type PressableProps } from 'react-native';

import { PressableView } from '@/components/ui/PressableView';

import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SheetCloseButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Read out instead of "Close" when the sheet needs to say what closes. */
  accessibilityLabel?: string;
};

/**
 * A sheet's ×: a 44 tap target holding a 32 circle in the segmented-control
 * track colour, so it reads as part of the sheet's chrome rather than as a
 * button competing with Save (boards R2-Entry, R2-Category, R2-Date).
 */
export function SheetCloseButton({ accessibilityLabel = 'Close', ...props }: SheetCloseButtonProps) {
  const { colors } = useThemeTokens();

  return (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={styles.target}
      pressedStyle={{ opacity: 0.7 }}
      {...props}>
      <View style={[styles.circle, { backgroundColor: colors.track }]}>
        <MaterialCommunityIcons name="close" size={18} color={colors.text} />
      </View>
    </PressableView>
  );
}

const styles = StyleSheet.create({
  target: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
