import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { aiPriceRows } from '@/lib/ai-prices';
import { fetchBillingStatus, type BillingStatus } from '@/lib/billing';

/** What uses AI credits, and how many — reached from Profile. */
export default function AICreditsScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuthStore();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      setStatus(await fetchBillingStatus(token));
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to load AI prices right now.'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const rows = aiPriceRows(status);
  const balance = status?.credits;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title="What uses AI credits" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ThemedText tone="muted" style={styles.lede}>
          Finnri uses AI to read what you type, say, photograph or upload. Each read costs the
          credits below. Adding or editing anything by hand is always free.
        </ThemedText>

        {isLoading && !status ? (
          <SkeletonFrame label="Loading AI prices" testID="ai-credits-skeleton">
            <SkeletonRows count={5} showAmount lines={2} />
          </SkeletonFrame>
        ) : error && !status ? (
          <View style={[styles.card, styles.message, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={[styles.caption, { color: colors.text }]}>{error}</ThemedText>
            <Button variant="outline" height={40} label="Try again" onPress={() => void load()} style={styles.retry} />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {rows.map((row, index) => (
              <ListRow
                key={row.key}
                testID={`ai-price-${row.key}`}
                icon={row.icon}
                hue={row.hue}
                title={row.title}
                meta={row.meta}
                metaLines={2}
                amount={row.price}
                divider={index > 0}
              />
            ))}
          </View>
        )}

        {balance ? (
          <ThemedText tone="muted" style={styles.caption}>
            You have {balance.total_credits_remaining.toLocaleString('en-IN')} credits
            {balance.daily_limit > 0
              ? `, and can use ${balance.daily_credits_remaining.toLocaleString('en-IN')} more today`
              : ''}
            .
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          <Button variant="outline" height={44} label="Plans & credits" onPress={() => router.push('/billing')} />
          <Button variant="outline" height={44} label="AI usage history" onPress={() => router.push('/ai-usage')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  lede: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  message: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  retry: {
    paddingHorizontal: 16,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
});
