import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { SkeletonFrame, SkeletonRows } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/theme-primitives';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatTime } from '@/lib/datetime';
import { fetchAIUsage, type AIUsageEvent } from '@/lib/billing';

const actionLabels: Record<string, string> = {
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

const formatUsageDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  // The date is locale-formatted; the clock is not, or this screen would show
  // a different convention from every other timestamp in the app.
  const day = parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = formatTime(parsed);
  return time ? `${day}, ${time}` : day;
};

export default function AIUsageScreen() {
  const theme = useThemeTokens();
  const colors = theme.colors;
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}>
      <AppHeader title="AI usage" onBack={() => router.back()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 42 }}>
        <View style={{ paddingHorizontal: 24, gap: theme.spacing.lg }}>
          <Card compact style={{ padding: theme.spacing.lg }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}>
              <View>
                <ThemedText
                  style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
                  {total}
                </ThemedText>
                <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
                  AI attempts
                </ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText
                  style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
                  {totalCredits}
                </ThemedText>
                <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
                  credits in this list
                </ThemedText>
              </View>
            </View>
          </Card>

          {isLoading ? (
            <SkeletonFrame label="Loading AI usage" testID="ai-usage-skeleton">
              <SkeletonRows count={5} showAmount lines={2} />
            </SkeletonFrame>
          ) : error ? (
            <Card compact style={{ padding: theme.spacing.lg }}>
              <ThemedText style={{ color: colors.text }}>{error}</ThemedText>
            </Card>
          ) : events.length === 0 ? (
            <Card
              compact
              style={{ padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm }}>
              <MaterialCommunityIcons name="creation-outline" size={30} color={colors.accent} />
              <ThemedText
                style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
                No AI usage yet
              </ThemedText>
              <ThemedText style={{ textAlign: 'center', color: `${colors.text}99` }}>
                Text or voice capture will appear here after Finnri AI processes it.
              </ThemedText>
            </Card>
          ) : (
            events.map((event) => (
              <Card key={event.id} compact style={{ padding: theme.spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                  <View
                    style={{
                      height: 40,
                      width: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.secondary,
                    }}>
                    <MaterialCommunityIcons
                      name={event.input_kind === 'voice' ? 'microphone' : 'text-box-edit-outline'}
                      size={19}
                      color={colors.accent}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText
                      numberOfLines={1}
                      style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
                      {actionLabels[event.action_code] ?? event.action_code.replaceAll('_', ' ')}
                    </ThemedText>
                    <ThemedText
                      numberOfLines={1}
                      variant="caption"
                      style={{ color: `${colors.text}99` }}>
                      {statusLabels[event.status] ?? event.status} ·{' '}
                      {formatUsageDate(event.started_at)}
                    </ThemedText>
                    {event.error_code ? (
                      <ThemedText numberOfLines={1} variant="caption" style={{ color: '#D32F2F' }}>
                        {event.error_code.replaceAll('_', ' ')}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <ThemedText
                      style={{ fontFamily: Fonts.title, fontWeight: '800', color: colors.text }}>
                      {event.final_credits}
                    </ThemedText>
                    <ThemedText variant="micro" style={{ color: `${colors.text}88` }}>
                      credits
                    </ThemedText>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
