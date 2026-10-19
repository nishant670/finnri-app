import { ThemedText } from '@/components/themed-text';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { FinnriLogoMark } from '@/components/FinnriLogoMark';
import { userDisplayName } from '@/lib/display-name';

type HomeHeaderProps = {
  unreadCount?: number;
  onNotificationsPress?: () => void;
};

/** The 56dp identity row over Home: the mark, the greeting, the bell (board R1-Home-Empty). */
export function HomeHeader({ unreadCount = 0, onNotificationsPress }: HomeHeaderProps) {
  const theme = useThemeTokens();
  const { user } = useAuthStore();
  const displayName = `${userDisplayName(user?.username)}!`;
  const visibleCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <View style={styles.header}>
      <FinnriLogoMark size={40} />

      <View style={styles.greeting}>
        <ThemedText tone="muted" style={styles.hello}>
          Hey there,
        </ThemedText>
        <ThemedText numberOfLines={1} style={[styles.name, { color: theme.colors.text }]}>
          {displayName}
        </ThemedText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={onNotificationsPress}
        style={styles.bell}
        hitSlop={4}>
        <MaterialCommunityIcons name="bell-outline" size={24} color={theme.colors.text} />
        {unreadCount > 0 && (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: theme.colors.accent,
                // Cut out of whatever the header sits on, so the badge reads
                // as lifted off the bell in both modes.
                borderColor: theme.colors.background,
              },
            ]}>
            <ThemedText tone="onAccent" style={styles.badgeLabel}>
              {visibleCount}
            </ThemedText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
    paddingLeft: 16,
    paddingRight: 8,
  },
  greeting: {
    flex: 1,
    minWidth: 0,
  },
  hello: {
    fontSize: 12,
    lineHeight: 16,
  },
  name: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 10,
    fontWeight: '900',
    includeFontPadding: false,
  },
});
