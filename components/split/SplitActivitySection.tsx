import { ActivityIndicator, Pressable, View } from 'react-native';

import { StateView } from '@/components/ui/StateView';
import { TText } from '@/components/split/primitives/themed-interop';
import { Fonts } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/*
 * The Activity section's parts. The rows themselves are the Splits screen's
 * list items, so the section is a heading above them, an empty state in
 * place of them and a footer below them, rather than one view that mapped
 * every row at once.
 */

/** The heading, at the foot of the list's header. Ends where the first row starts. */
export function SplitActivityHeading() {
  const theme = useThemeTokens().colors;
  return (
    <View className="mb-6 mt-9">
      <TText variant="sectionTitle" style={{ color: theme.text }}>
        Recent activity
      </TText>
    </View>
  );
}

/** Between two rows. */
export function SplitActivitySeparator() {
  return <View style={{ height: 16 }} />;
}

export function SplitActivityEmpty({
  loading,
  normalizedSearch,
  error,
  onRetry,
}: {
  /** The first page is still on its way: no claim yet that there is nothing. */
  loading: boolean;
  normalizedSearch: string;
  /** The first page failed. Saying "No activity yet" here would be a claim, not a fact. */
  error?: string | null;
  onRetry?: () => void;
}) {
  const theme = useThemeTokens().colors;
  if (loading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <StateView
        compact
        icon="wifi-off"
        title="Activity did not load"
        message={error}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }
  return (
    <StateView
      compact
      icon="history"
      title={normalizedSearch ? 'No matching activity' : 'No activity yet'}
      message={
        normalizedSearch
          ? 'Try another search.'
          : 'Group, friend, bill, and settlement activity will appear here.'
      }
    />
  );
}

/**
 * Under the last row: a spinner while more is on its way, a retry when a page
 * failed, and nothing at the end — the feed simply stops at its first event.
 */
export function SplitActivityFooter({
  hasMore,
  loadingMore,
  error,
  onRetry,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const theme = useThemeTokens().colors;
  if (error) {
    return (
      <View className="items-center gap-3 py-8">
        <TText className="text-center text-xs" style={{ color: theme.muted }}>
          {error}
        </TText>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          className="rounded-full px-4 py-2"
          style={{ backgroundColor: theme.secondary }}>
          <TText className="text-xs" style={{ color: theme.accent, fontFamily: Fonts.title }}>
            Try again
          </TText>
        </Pressable>
      </View>
    );
  }
  if (hasMore || loadingMore) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  return null;
}
