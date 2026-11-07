import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type TabHeaderAction = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
};

/**
 * A tab's own header (boards R5-*, R6-*, R7-*): the tab's name at 22/700 on
 * the left, and up to two plain 44dp icon buttons on the right. Pushed
 * screens keep `AppHeader`, which has a back arrow.
 */
export function TabHeader({
  title,
  actions = [],
  busy = false,
  onBack,
}: {
  title: string;
  actions?: TabHeaderAction[];
  /** A small spinner before the actions while the tab refreshes. */
  busy?: boolean;
  /** A back chevron before the title, for a full list opened inside a tab. */
  onBack?: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.header, onBack ? styles.headerWithBack : null]}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={4}
          style={styles.back}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
        </Pressable>
      ) : null}
      <ThemedText
        accessibilityRole="header"
        numberOfLines={1}
        style={[styles.title, { color: colors.text }]}>
        {title}
      </ThemedText>
      <View style={styles.actions}>
        {busy ? <ActivityIndicator color={colors.muted} style={styles.busy} /> : null}
        {actions.map((action) => (
          <Pressable
            key={action.accessibilityLabel}
            testID={action.testID}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={styles.button}>
            <MaterialCommunityIcons name={action.icon} size={24} color={colors.text} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
  },
  headerWithBack: {
    paddingLeft: 4,
  },
  back: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  busy: {
    marginRight: 6,
  },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
