import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { Segments } from '@/components/ui/Segments';
import { SCREEN_GUTTER } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';


export type ActiveSection = 'groups' | 'friends' | 'activity';

export function SplitScreenFrame({
  embedded,
  backgroundColor,
  children,
}: {
  embedded: boolean;
  backgroundColor: string;
  children: ReactNode;
}) {
  if (embedded) {
    return <>{children}</>;
  }

  return (
    <SafeAreaView className="flex-1" edges={['top', 'left', 'right']} style={{ backgroundColor }}>
      {children}
    </SafeAreaView>
  );
}

export function SearchField({
  value,
  onChangeText,
  onClear,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <MaterialCommunityIcons name="magnify" size={20} color={theme.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search groups, friends, activity"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        style={[styles.searchInput, { color: theme.text, fontFamily: Fonts.body }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear} hitSlop={8}>
          <MaterialCommunityIcons name="close-circle" size={20} color={theme.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SegmentedSections({
  activeSection,
  onChange,
  activityBadge = false,
}: {
  activeSection: ActiveSection;
  onChange: (section: ActiveSection) => void;
  /**
   * "Somebody else did something you have not seen", not "something happened".
   *
   * The distinction is the whole design of this dot. Activity records every
   * expense, friend and group the user has ever made themselves, so a dot fed
   * by the feed would light on the first launch and stay lit for the life of
   * the account — a permanent unread marker is the same as no marker. What
   * feeds it instead is the reader's unread *split notifications*, which are
   * only ever written about them by another member and which reading clears.
   */
  activityBadge?: boolean;
}) {
  return (
    <Segments
      active={activeSection}
      options={[
        { key: 'groups', label: 'Groups', testID: 'split-section-groups' },
        { key: 'friends', label: 'Friends', testID: 'split-section-friends' },
        { key: 'activity', label: 'Activity', badge: activityBadge, testID: 'split-section-activity' },
      ]}
      onChange={onChange}
    />
  );
}

export function SettledHint({
  settledCount,
  onShowSettled,
  noun = 'group',
}: {
  settledCount: number;
  onShowSettled: () => void;
  /** What is hidden: Groups hides groups, Friends hides friends. */
  noun?: 'group' | 'friend';
}) {
  if (settledCount <= 0) return null;

  return (
    <View style={styles.settled}>
      <ThemedText tone="muted" style={styles.settledText}>
        {noun === 'friend' ? "Hiding friends you're settled up with." : 'Hiding groups that are settled up.'}
      </ThemedText>
      <Button
        variant="outline"
        height={40}
        label={`Show ${settledCount} settled-up ${noun}${settledCount === 1 ? '' : 's'}`}
        onPress={onShowSettled}
        style={styles.settledButton}
      />
    </View>
  );
}

/** The balance filter, on the right of a section's heading. Tinted while one is set. */
export function BalanceFilterButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const theme = useThemeTokens().colors;
  return (
    <PressableView
      testID="split-balance-filter"
      accessibilityRole="button"
      accessibilityLabel="Filter split balances"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.filter,
        active && { backgroundColor: theme.selectedFill, borderColor: theme.selectedBorder },
        !active && { borderColor: theme.border },
      ]}
      pressedStyle={styles.pressed}>
      <MaterialCommunityIcons name="tune-variant" size={16} color={theme.text} />
      <ThemedText style={[styles.filterLabel, { color: theme.text, fontWeight: active ? '700' : '500' }]}>
        Filter
      </ThemedText>
    </PressableView>
  );
}

/** One card holding a section's rows; each row draws its own divider. */
export function SplitListCard({ children }: { children: ReactNode }) {
  const theme = useThemeTokens().colors;
  return (
    <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

/**
 * A section with nothing in it (board R6-Empty): a tinted tile, what to do,
 * and the one button that does it. No button for a search that found nothing.
 */
export function SplitEmptyCard({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useThemeTokens().colors;
  return (
    <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.emptyHead}>
        <View style={[styles.emptyTile, { backgroundColor: theme.selectedFill }]}>
          <MaterialCommunityIcons name={icon} size={22} color={theme.text} />
        </View>
        <View style={styles.emptyText}>
          <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>{title}</ThemedText>
          <ThemedText tone="muted" style={styles.emptyMessage}>
            {message}
          </ThemedText>
        </View>
      </View>
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontSize: 15,
  },
  settled: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: 20,
  },
  settledText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  settledButton: {
    paddingHorizontal: 18,
  },
  filter: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  filterLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  listCard: {
    marginHorizontal: SCREEN_GUTTER,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  emptyCard: {
    gap: 16,
    marginHorizontal: SCREEN_GUTTER,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  emptyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emptyTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  emptyMessage: {
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
