import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { formatMoney } from '@/lib/money';
import { DashboardRecurringCandidate, fetchDashboard, saveRecurringCandidateDecision } from '@/lib/insights';

const toParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const formatDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const intervalLabel = (value: DashboardRecurringCandidate['interval_guess']) =>
  value === 'weekly' ? 'Weekly' : 'Monthly';

export default function RecurringReviewScreen() {
  const params = useLocalSearchParams();
  const theme = useThemeTokens();
  const colors = theme.colors;
  const muted = `${colors.text}99`;
  const { token } = useAuthStore();
  const start = toParam(params.start);
  const end = toParam(params.end);
  const initialMerchant = toParam(params.merchant);

  const [candidates, setCandidates] = useState<DashboardRecurringCandidate[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const dashboard = await fetchDashboard(token, start, end);
      setCandidates(dashboard.recurring_candidates);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, 'Unable to load recurring review.'));
    } finally {
      setLoading(false);
    }
  }, [end, start, token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const visibleCandidates = useMemo(
    () =>
      candidates
        .filter((candidate) => !dismissed.has(candidateKey(candidate)))
        .sort((a, b) => {
          if (a.merchant === initialMerchant) return -1;
          if (b.merchant === initialMerchant) return 1;
          if (a.review_due !== b.review_due) return a.review_due ? -1 : 1;
          return b.confidence - a.confidence;
        }),
    [candidates, dismissed, initialMerchant]
  );

  const hideCandidate = (candidate: DashboardRecurringCandidate) => {
    setDismissed((current) => new Set(current).add(candidateKey(candidate)));
  };

  const saveDecision = async (
    candidate: DashboardRecurringCandidate,
    decision: 'dismissed' | 'snoozed' | 'tracked'
  ) => {
    if (!token || savingKey) return;
    const key = candidateKey(candidate);
    setSavingKey(key);
    setError(null);
    try {
      const snoozedUntil =
        decision === 'snoozed' ? dateAfterDays(14) : undefined;
      await saveRecurringCandidateDecision(token, {
        candidate_key: key,
        merchant: candidate.merchant,
        category: candidate.category,
        decision,
        snoozed_until: snoozedUntil,
      });
      hideCandidate(candidate);
    } catch (decisionError) {
      setError(getFriendlyErrorMessage(decisionError, 'Unable to save recurring review decision.'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Recurring review"
        subtitle={`${visibleCandidates.length} pattern${visibleCandidates.length === 1 ? '' : 's'} to check`}
        onBack={() => router.back()}
        rightIcon="refresh"
        onRightPress={load}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 16 }}>
        <View className="rounded-[24px] border p-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.secondary }}>
              <MaterialCommunityIcons name="repeat-variant" size={21} color={colors.accent} />
            </View>
            <View className="flex-1">
              <ThemedText className="text-sm font-black">Confirm patterns before tracking</ThemedText>
              <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
                These are suggestions from repeated confirmed expenses. Nothing is added to subscriptions until you track it.
              </ThemedText>
            </View>
          </View>
        </View>

        {loading ? (
          <SkeletonFrame label="Loading recurring review" testID="recurring-review-skeleton">
            <SkeletonCards count={3} lines={3} radius={28} />
          </SkeletonFrame>
        ) : error ? (
          <StateView icon="wifi-off" title="Recurring review did not load" message={error} actionLabel="Try again" onAction={load} compact />
        ) : visibleCandidates.length === 0 ? (
          <StateView
            icon="repeat-off"
            title="No recurring patterns to review"
            message="Finnri will show suggestions here when a merchant or category repeats consistently."
            compact
          />
        ) : (
          visibleCandidates.map((candidate) => (
            <RecurringCandidateCard
              key={candidateKey(candidate)}
              candidate={candidate}
              colors={colors}
              muted={muted}
              onTrack={() =>
                router.push({
                  pathname: '/subscriptions',
                  params: {
                    candidateKey: candidateKey(candidate),
                    source: 'recurring_review',
                    name: candidate.label,
                    merchant: candidate.merchant,
                    category: candidate.category,
                    amount: String(candidate.average_amount),
                    interval: candidate.interval_guess,
                    nextDueDate: candidate.next_expected_date,
                    notes: `Detected from ${candidate.occurrences} similar transactions. Confidence ${Math.round(candidate.confidence * 100)}%.`,
                  },
                })
              }
              onLater={() => void saveDecision(candidate, 'snoozed')}
              onDismiss={() => void saveDecision(candidate, 'dismissed')}
              saving={savingKey === candidateKey(candidate)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function candidateKey(candidate: DashboardRecurringCandidate) {
  return candidate.candidate_key || `${candidate.label.trim().toLowerCase()}|${candidate.category.trim().toLowerCase()}`;
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function RecurringCandidateCard({
  candidate,
  colors,
  muted,
  onTrack,
  onLater,
  onDismiss,
  saving,
}: {
  candidate: DashboardRecurringCandidate;
  colors: ReturnType<typeof useThemeTokens>['colors'];
  muted: string;
  onTrack: () => void;
  onLater: () => void;
  onDismiss: () => void;
  saving: boolean;
}) {
  const confidence = Math.round(candidate.confidence * 100);

  return (
    <View className="rounded-[28px] border p-5 shadow-sm" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            {candidate.review_due && (
              <View className="rounded-full px-2 py-1" style={{ backgroundColor: '#FFF3D6' }}>
                <ThemedText tone="warning" className="text-[10px] font-black uppercase">Review</ThemedText>
              </View>
            )}
            <ThemedText className="text-[10px] font-black uppercase tracking-widest" style={{ color: muted }}>
              {intervalLabel(candidate.interval_guess)}
            </ThemedText>
          </View>
          <ThemedText className="mt-3 text-xl font-black" numberOfLines={1}>
            {candidate.label}
          </ThemedText>
          <ThemedText className="mt-1 text-xs" style={{ color: muted }} numberOfLines={1}>
            {candidate.category} · {candidate.occurrences} occurrences
          </ThemedText>
        </View>
        <View className="items-end">
          <ThemedText className="text-xl font-black" style={{ color: colors.accent }}>
            {formatMoney(candidate.average_amount)}
          </ThemedText>
          <ThemedText className="mt-1 text-[10px] font-bold" style={{ color: muted }}>
            avg amount
          </ThemedText>
        </View>
      </View>

      <View className="mt-5 flex-row gap-3">
        <MiniMetric label="Last seen" value={formatDate(candidate.last_seen_date)} colors={colors} />
        <MiniMetric label="Expected" value={formatDate(candidate.next_expected_date)} colors={colors} />
        <MiniMetric label="Match" value={`${confidence}%`} colors={colors} />
      </View>

      <View className="mt-5 h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.secondary }}>
        <View className="h-full rounded-full" style={{ width: `${Math.min(100, confidence)}%`, backgroundColor: colors.accent }} />
      </View>

      <View className="mt-5 gap-2">
        <Pressable disabled={saving} onPress={onTrack} className="h-12 flex-row items-center justify-center rounded-2xl" style={{ backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}>
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <MaterialCommunityIcons name="bell-check-outline" size={20} color={colors.onAccent} />
              <ThemedText tone="onAccent" className="ml-2 text-sm font-black">Track as subscription</ThemedText>
            </>
          )}
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable disabled={saving} onPress={onLater} className="h-11 flex-1 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.secondary, opacity: saving ? 0.6 : 1 }}>
            <ThemedText className="text-xs font-black" style={{ color: colors.accent }}>Remind me later</ThemedText>
          </Pressable>
          <Pressable disabled={saving} onPress={onDismiss} className="h-11 flex-1 items-center justify-center rounded-2xl border" style={{ borderColor: colors.border, opacity: saving ? 0.6 : 1 }}>
            <ThemedText className="text-xs font-black" style={{ color: muted }}>Not recurring</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MiniMetric({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeTokens>['colors'];
}) {
  return (
    <View className="flex-1 rounded-2xl border px-3 py-3" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
      <ThemedText tone="muted" className="text-[10px] font-black uppercase">{label}</ThemedText>
      <ThemedText className="mt-1 text-xs font-black" numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}
