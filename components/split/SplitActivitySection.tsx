import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SplitEmptyCard } from '@/components/split/primitives/SplitChrome';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/*
 * The Activity section's parts. The rows themselves are the Splits screen's
 * list items, each drawing its slice of its day's card (board R6-Activity),
 * so the section is an empty state in place of them and a footer below them,
 * rather than one view that mapped every row at once.
 */

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
      <View style={styles.spinner}>
        <ActivityIndicator color={theme.muted} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.empty}>
        <SplitEmptyCard
          icon="wifi-off"
          title="Activity did not load"
          message={error}
          actionLabel="Try again"
          onAction={onRetry}
        />
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <SplitEmptyCard
        icon="history"
        title={normalizedSearch ? 'No matching activity' : 'No activity yet'}
        message={
          normalizedSearch
            ? 'Try another search.'
            : 'Group, friend, bill, and settlement activity will appear here.'
        }
      />
    </View>
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
      <View style={styles.footer}>
        <ThemedText tone="muted" style={styles.caption}>
          {error}
        </ThemedText>
        <Button variant="outline" label="Try again" onPress={onRetry} style={styles.retry} />
      </View>
    );
  }
  if (hasMore || loadingMore) {
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={theme.muted} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  spinner: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  empty: {
    marginTop: 16,
  },
  footer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  retry: {
    paddingHorizontal: 18,
  },
});
