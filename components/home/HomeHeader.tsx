import { ThemedText } from '@/components/themed-text';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { FinnriLogoMark } from '@/components/FinnriLogoMark';
import { PressableView } from '@/components/ui/PressableView';
import { userDisplayName } from '@/lib/display-name';

type HomeHeaderProps = {
  unreadCount?: number;
  onNotificationsPress?: () => void;
  /**
   * Opens Ask Finnri. The capture field used to carry an "Or ask — …" link
   * for this, but typing there is for logging, and the only other way in was
   * a long-press on the mic nobody discovers. A labelled pill beside the bell
   * is always on screen (the header is pinned) and says what it does.
   */
  onAskPress?: () => void;
  /** "Hey there, welcome to Finnri!" while Home has no entries yet. */
  welcome?: boolean;
};

/** The 56dp identity row over Home: the mark, the greeting, the bell (board R1-Home-Empty). */
export function HomeHeader({
  unreadCount = 0,
  onNotificationsPress,
  onAskPress,
  welcome = false,
}: HomeHeaderProps) {
  const theme = useThemeTokens();
  const { user } = useAuthStore();
  // A brand-new Home greets rather than names (board R13-FirstEntry-Proposals).
  const displayName = welcome ? 'welcome to Finnri!' : `${userDisplayName(user?.username)}!`;
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

      {onAskPress ? (
        <PressableView
          testID="home-ask-finnri"
          accessibilityRole="button"
          accessibilityLabel="Ask Finnri about your money"
          onPress={onAskPress}
          hitSlop={6}
          style={[
            styles.ask,
            {
              backgroundColor: theme.colors.selectedFill,
              borderColor: theme.colors.selectedBorder,
            },
          ]}
          pressedStyle={styles.pressed}>
          <MaterialCommunityIcons name="creation" size={16} color={theme.colors.accent} />
          <ThemedText style={[styles.askLabel, { color: theme.colors.text }]}>Ask</ThemedText>
        </PressableView>
      ) : null}

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
  ask: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  askLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
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
