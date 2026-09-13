import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import type { ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Segments } from '@/components/ui/Segments';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

const TText = cssInterop(ThemedText, { className: 'style' });

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
    <View
      className="mb-5 min-h-12 flex-row items-center gap-3 rounded-2xl px-4"
      style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }}>
      <MaterialCommunityIcons name="magnify" size={20} color={theme.accent} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search groups, friends, activity"
        placeholderTextColor={theme.mutedStrong}
        autoCapitalize="none"
        style={{
          flex: 1,
          color: theme.text,
          fontFamily: Fonts.body,
          minHeight: 46,
        }}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear}>
          <MaterialCommunityIcons name="close-circle" size={20} color={theme.mutedStrong} />
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
        { key: 'groups', label: 'Groups', icon: 'account-group-outline' },
        { key: 'friends', label: 'Friends', icon: 'account-outline' },
        { key: 'activity', label: 'Activity', icon: 'history', badge: activityBadge },
      ]}
      onChange={onChange}
      contentContainerStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}
    />
  );
}

export function SettledHint({
  settledCount,
  onShowSettled,
}: {
  settledCount: number;
  onShowSettled: () => void;
}) {
  const theme = useThemeTokens().colors;
  if (settledCount <= 0) return null;

  return (
    <View className="items-center px-4 py-5">
      <TText className="text-center text-sm" style={{ color: theme.muted }}>
        Hiding groups that are settled up.
      </TText>
      <Pressable
        accessibilityRole="button"
        onPress={onShowSettled}
        className="mt-4 min-h-12 items-center justify-center rounded-full px-6"
        style={{ borderColor: theme.accent, borderWidth: 1 }}>
        <TText className="text-sm" style={{ color: theme.accent, fontFamily: Fonts.title }}>
          Show {settledCount} settled-up group{settledCount === 1 ? '' : 's'}
        </TText>
      </Pressable>
    </View>
  );
}
