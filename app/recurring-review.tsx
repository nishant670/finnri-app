import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  HueTile,
  InsightCard,
  ProgressBar,
  Tag,
  insightText,
} from '@/components/insights/insight-ui';
import { AppHeader } from '@/components/navigation/AppHeader';
import { ThemedText } from '@/components/themed-text';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { SkeletonCards, SkeletonFrame } from '@/components/ui/Skeleton';
import { StateView } from '@/components/ui/StateView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { categoryVisual } from '@/lib/categories';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title="Recurring review"
        subtitle={`${visibleCandidates.length} pattern${visibleCandidates.length === 1 ? '' : 's'} to check`}
        onBack={() => router.back()}
        style={{ paddingHorizontal: 16, paddingVertical: 10 }}
        rightNode={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reload"
            onPress={load}
            style={styles.headerIcon}>
            <MaterialCommunityIcons name="refresh" size={24} color={colors.text} />
          </Pressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ThemedText tone="muted" style={insightText.body}>
          Suggestions from repeated confirmed expenses. Nothing is added to subscriptions until you
          track it.
        </ThemedText>

        {loading ? (
          <SkeletonFrame label="Loading recurring review" testID="recurring-review-skeleton">
            <SkeletonCards count={3} lines={3} radius={16} />
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
  onTrack,
  onLater,
  onDismiss,
  saving,
}: {
  candidate: DashboardRecurringCandidate;
  onTrack: () => void;
  onLater: () => void;
  onDismiss: () => void;
  saving: boolean;
}) {
  const { colors } = useThemeTokens();
  const confidence = Math.round(candidate.confidence * 100);
  const visual = categoryVisual(candidate.category);

  return (
    <InsightCard flush>
      <View style={styles.cardHead}>
        <HueTile icon={visual.icon} hue={visual.color} />
        <View style={styles.headText}>
          <View style={styles.titleLine}>
            <ThemedText numberOfLines={1} style={[styles.title, { color: colors.text }]}>
              {candidate.label}
            </ThemedText>
            {candidate.review_due ? (
              <Tag label="Review" color={colors.warning} background={colors.warningSurface} />
            ) : null}
          </View>
          <ThemedText tone="muted" numberOfLines={2} style={insightText.caption}>
            {candidate.category} · seen {candidate.occurrences} times ·{' '}
            {intervalLabel(candidate.interval_guess).toLowerCase()}
          </ThemedText>
        </View>
        <View style={styles.amountBlock}>
          <ThemedText style={[styles.amount, { color: colors.text }]}>
            {formatMoney(candidate.average_amount)}
          </ThemedText>
          <ThemedText tone="muted" style={insightText.caption}>
            average
          </ThemedText>
        </View>
      </View>

      <DetailLine label="Last seen" value={formatDate(candidate.last_seen_date)} />
      <DetailLine label="Expected" value={formatDate(candidate.next_expected_date)} />
      <View style={[styles.detail, { borderTopColor: colors.border }]}>
        <ThemedText tone="muted" style={styles.detailLabel}>
          Match
        </ThemedText>
        <ProgressBar fraction={confidence / 100} color={colors.mutedStrong} style={styles.match} />
        <ThemedText style={[styles.detailValue, { color: colors.text }]}>{confidence}%</ThemedText>
      </View>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <PrimaryButton
          label="Track as subscription"
          loading={saving}
          disabled={saving}
          onPress={onTrack}
        />
        <View style={styles.secondary}>
          <Button
            variant="outline"
            height={44}
            label="Remind me later"
            disabled={saving}
            onPress={onLater}
            style={styles.flex}
          />
          <Button
            variant="outline"
            height={44}
            label="Not recurring"
            disabled={saving}
            onPress={onDismiss}
            style={styles.flex}
          />
        </View>
      </View>
    </InsightCard>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const { colors } = useThemeTokens();
  return (
    <View style={[styles.detail, { borderTopColor: colors.border }]}>
      <ThemedText tone="muted" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.detailValue, { color: colors.text }]}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 48,
  },
  headerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginRight: -8,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  amountBlock: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  detail: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  detailLabel: {
    width: 92,
    fontSize: 14,
    lineHeight: 20,
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  match: {
    flex: 1,
  },
  actions: {
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  secondary: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
});
