import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { NeutralTile } from '@/components/profile/SettingsRow';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatTime } from '@/lib/datetime';
import { fetchAIUsage, type AIUsageEvent } from '@/lib/billing';

const actionLabels: Record<string, string> = {
  // Bill scans read "transaction parse receipt" before this label existed
  // (a fix on board R8-Usage).
  transaction_parse_receipt: 'Bill scan',
  transaction_parse_text: 'Text capture',
  transaction_parse_voice_short: 'Short voice capture',
  transaction_parse_voice_medium: 'Voice capture',
  transaction_parse_voice_long: 'Long voice capture',
};

const statusLabels: Record<string, string> = {
  succeeded: 'Charged',
  failed_after_provider: 'Charged after provider attempt',
  failed_before_provider: 'Refunded',
  cancelled: 'Cancelled',
  reserved: 'Processing',
};

/** Each kind of action's glyph and hue, so a scan and a typed note are told apart at a glance. */
const actionVisual = (event: AIUsageEvent): { icon: keyof typeof MaterialCommunityIcons.glyphMap; hue: string } => {
  if (event.action_code.includes('receipt')) return { icon: 'receipt-text-outline', hue: '#6A4BBC' };
  if (event.input_kind === 'voice' || event.action_code.includes('voice')) return { icon: 'microphone-outline', hue: '#16825D' };
  return { icon: 'keyboard-outline', hue: '#1E6FB8' };
};

const localDayKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
};

/** "Today", "Yesterday", "18 Oct" — the day heading over its card. */
const dayTitle = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const today = new Date();
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start(today) - start(parsed)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function AIUsageScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuthStore();
  const [events, setEvents] = useState<AIUsageEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchAIUsage(token, 1, 50);
      setEvents(payload.events);
      setTotal(payload.total);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Unable to load AI usage right now.'));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void loadUsage();
    }, [loadUsage])
  );

  const totalCredits = events.reduce((sum, event) => sum + event.final_credits, 0);
  const days: { key: string; title: string; events: AIUsageEvent[] }[] = [];
  events.forEach((event) => {
    const key = localDayKey(event.started_at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.events.push(event);
    else days.push({ key, title: dayTitle(event.started_at), events: [event] });
  });

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScreenHeader title="AI usage" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.card, styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.figureLine}>
            <ThemedText style={[styles.figure, { color: colors.text }]}>{totalCredits.toLocaleString('en-IN')}</ThemedText>
            <ThemedText tone="muted" style={styles.figureUnit}>
              credits used
            </ThemedText>
          </View>
          <ThemedText tone="muted" style={styles.caption}>
            On {total.toLocaleString('en-IN')} AI action{total === 1 ? '' : 's'}
            {total > events.length ? ` · the latest ${events.length} are below` : ''}.
          </ThemedText>
        </View>

        {isLoading && events.length === 0 ? (
          <SkeletonFrame label="Loading AI usage" testID="ai-usage-skeleton">
            <SkeletonRows count={5} showAmount lines={2} />
          </SkeletonFrame>
        ) : error ? (
          <View style={[styles.card, styles.message, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={[styles.caption, { color: colors.text }]}>{error}</ThemedText>
            <Button variant="outline" height={40} label="Try again" onPress={() => void loadUsage()} style={styles.retry} />
          </View>
        ) : events.length === 0 ? (
          <View style={[styles.card, styles.message, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <NeutralTile icon="creation-outline" />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>No AI usage yet</ThemedText>
            <ThemedText tone="muted" style={[styles.caption, styles.center]}>
              Text, voice or a bill scan will appear here after Finnri AI processes it.
            </ThemedText>
          </View>
        ) : (
          days.map((day) => (
            <View key={day.key}>
              <ThemedText tone="muted" style={styles.dayTitle}>
                {day.title}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {day.events.map((event, index) => {
                  const visual = actionVisual(event);
                  const statusLabel = statusLabels[event.status] ?? event.status;
                  const meta = [
                    event.status === 'succeeded' ? null : statusLabel,
                    formatTime(new Date(event.started_at)),
                    event.error_code ? event.error_code.replaceAll('_', ' ') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ListRow
                      key={event.id}
                      icon={visual.icon}
                      hue={visual.hue}
                      title={actionLabels[event.action_code] ?? event.action_code.replaceAll('_', ' ')}
                      meta={meta}
                      amount={`${event.final_credits} credit${event.final_credits === 1 ? '' : 's'}`}
                      divider={index > 0}
                    />
                  );
                })}
              </View>
            </View>
          ))
        )}
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
  card: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  summary: {
    padding: 16,
  },
  figureLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  figure: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  figureUnit: {
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  center: {
    textAlign: 'center',
  },
  dayTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  message: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  retry: {
    paddingHorizontal: 16,
  },
});
