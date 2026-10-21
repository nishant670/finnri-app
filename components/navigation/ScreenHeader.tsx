import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '../themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  onBack: () => void;
  rightIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  rightText?: string;
  onRightPress?: () => void;
  /** What the right icon does, for a screen reader: "Account actions". */
  rightAccessibilityLabel?: string;
}

/**
 * A pushed flow's header (board R5-Account1): a plain back chevron, the step
 * or title centred in quiet ink, and an optional plain icon on the right.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightIcon,
  rightText,
  onRightPress,
  rightAccessibilityLabel,
}: ScreenHeaderProps) {
  const { colors } = useThemeTokens();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={styles.button}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
      </Pressable>

      <View style={styles.center}>
        {subtitle && (
          <ThemedText
            tone="muted"
            numberOfLines={1}
            style={title ? styles.eyebrow : styles.subtitle}>
            {subtitle}
          </ThemedText>
        )}
        {title && (
          <ThemedText numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {title}
          </ThemedText>
        )}
      </View>

      {rightIcon || rightText ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rightAccessibilityLabel ?? rightText}
          onPress={onRightPress}
          style={[styles.button, rightText ? styles.textButton : null]}>
          {rightIcon ? (
            <MaterialCommunityIcons name={rightIcon} size={24} color={colors.text} />
          ) : (
            <ThemedText style={[styles.rightText, { color: colors.text }]}>{rightText}</ThemedText>
          )}
        </Pressable>
      ) : (
        <View style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  button: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    paddingHorizontal: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  // Above a title the subtitle is a caption, not the header's main line.
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  rightText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
});
