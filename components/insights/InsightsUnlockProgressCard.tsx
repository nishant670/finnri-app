import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/ui/Button';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { InsightCard, ProgressBar, insightText } from './insight-ui';

/** The new account's card (board R7-Insights): how far to the first insights, and Add. */
export function InsightsUnlockProgressCard({ count }: { count: number }) {
  const { colors } = useThemeTokens();
  const progress = Math.min(3, Math.max(0, count));
  return (
    <InsightCard>
      <View style={styles.head}>
        <ThemedText style={[insightText.title, styles.title, { color: colors.text }]}>
          Add 3 transactions to unlock insights
        </ThemedText>
        <ThemedText style={[styles.count, { color: colors.text }]}>{progress} of 3</ThemedText>
      </View>
      <ProgressBar fraction={progress / 3} color={colors.accent} style={styles.bar} />
      <ThemedText tone="muted" style={[insightText.body, styles.body]}>
        A few real entries are enough for Finnri to start showing useful patterns.
      </ThemedText>
      <PrimaryButton
        label="Add transaction"
        onPress={() => router.push('/(tabs)')}
        style={styles.button}
      />
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    flex: 1,
  },
  count: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bar: {
    marginTop: 12,
  },
  body: {
    marginTop: 12,
  },
  button: {
    marginTop: 16,
  },
});
