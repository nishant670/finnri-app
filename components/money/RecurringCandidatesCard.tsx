import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import {
  saveRecurringCandidateDecision,
  trackRecurringCandidates,
  type DashboardRecurringCandidate,
} from '@/lib/insights';
import { formatMoney } from '@/lib/money';

/**
 * Netflix, the gym and the rent are already in the ledger on a monthly
 * cadence, and the backend has been detecting them since the recurring-review
 * screen shipped — but the only way to act on a detection was to open the
 * eleven-field subscription form with a few values pre-filled. This card is
 * the one-tap answer: confirm what Finnri already worked out, and the
 * subscriptions are created with no form at all.
 *
 * Nothing here computes money. The candidates arrive from the dashboard and
 * tracking sends back only their keys, so the amount and renewal date written
 * onto each subscription are the server's own detection figures — the card
 * cannot show one number and save another.
 */

const MONTHLY_MULTIPLIER: Record<DashboardRecurringCandidate['interval_guess'], number> = {
  weekly: 4,
  monthly: 1,
};

const SNOOZE_DAYS = 14;

export const candidateKeyOf = (candidate: DashboardRecurringCandidate) =>
  candidate.candidate_key ||
  `${candidate.label.trim().toLowerCase()}|${candidate.category.trim().toLowerCase()}`;

export const monthlyTotalOf = (candidates: DashboardRecurringCandidate[]) =>
  candidates.reduce(
    (total, candidate) =>
      total + candidate.average_amount * (MONTHLY_MULTIPLIER[candidate.interval_guess] ?? 1),
    0
  );

const dateAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

type RecurringCandidatesCardProps = {
  candidates: DashboardRecurringCandidate[];
  /** Called after subscriptions are created so the list behind the card reloads. */
  onTracked: (createdCount: number) => void;
  /** Called when the card should stop being shown for this session. */
  onDismissed: () => void;
};

export function RecurringCandidatesCard({
  candidates,
  onTracked,
  onDismissed,
}: RecurringCandidatesCardProps) {
  const router = useRouter();
  const { token } = useAuthStore();
  const colors = useThemeTokens().colors;
  const muted = `${colors.text}99`;

  // Everything starts selected. The headline counts what the user is about to
  // agree to, so the default has to be the thing the headline describes.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => candidates.filter((candidate) => !excluded.has(candidateKeyOf(candidate))),
    [candidates, excluded]
  );
  const monthlyTotal = useMemo(() => monthlyTotalOf(selected), [selected]);

  if (candidates.length === 0) return null;

  const toggle = (candidate: DashboardRecurringCandidate) => {
    haptics.select();
    const key = candidateKeyOf(candidate);
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const track = async () => {
    if (!token || busy || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await trackRecurringCandidates(token, {
        candidate_keys: selected.map(candidateKeyOf),
      });
      haptics.saved();
      onTracked(result.tracked.length);
    } catch (trackError) {
      haptics.rejected();
      setError(getFriendlyErrorMessage(trackError, 'Unable to track these recurring payments.'));
    } finally {
      setBusy(false);
    }
  };

  // "Not now" snoozes rather than dismisses. Dismissing is a claim that these
  // are not recurring, and it is permanent — it should take the deliberate
  // per-row action, not the escape hatch beside the primary button.
  const snoozeAll = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const snoozedUntil = dateAfterDays(SNOOZE_DAYS);
      await Promise.all(
        candidates.map((candidate) =>
          saveRecurringCandidateDecision(token, {
            candidate_key: candidateKeyOf(candidate),
            merchant: candidate.merchant,
            category: candidate.category,
            decision: 'snoozed',
            snoozed_until: snoozedUntil,
          })
        )
      );
      onDismissed();
    } catch (snoozeError) {
      setError(getFriendlyErrorMessage(snoozeError, 'Unable to save that right now.'));
    } finally {
      setBusy(false);
    }
  };

  const dismissOne = async (candidate: DashboardRecurringCandidate) => {
    if (!token || busy) return;
    const key = candidateKeyOf(candidate);
    setBusy(true);
    setError(null);
    try {
      await saveRecurringCandidateDecision(token, {
        candidate_key: key,
        merchant: candidate.merchant,
        category: candidate.category,
        decision: 'dismissed',
      });
      haptics.removed();
      if (candidates.length === 1) {
        onDismissed();
        return;
      }
      onTracked(0);
    } catch (dismissError) {
      setError(getFriendlyErrorMessage(dismissError, 'Unable to save that right now.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      className="rounded-[28px] border p-5"
      style={{ backgroundColor: colors.card, borderColor: colors.accent }}>
      <View className="flex-row items-start gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.secondary }}>
          <MaterialCommunityIcons name="repeat-variant" size={21} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <ThemedText className="text-base font-black" style={{ fontFamily: Fonts.title }}>
            Finnri spotted {candidates.length} recurring payment
            {candidates.length === 1 ? '' : 's'}
          </ThemedText>
          <ThemedText className="mt-1 text-xs leading-5" style={{ color: muted }}>
            {selected.length === 0
              ? 'Pick at least one to track.'
              : `${formatMoney(monthlyTotal)}/month. Track them?`}
          </ThemedText>
        </View>
      </View>

      <View className="mt-4 gap-2">
        {candidates.map((candidate) => {
          const key = candidateKeyOf(candidate);
          const included = !excluded.has(key);
          return (
            <View
              key={key}
              className="flex-row items-center gap-3 rounded-2xl border px-3 py-3"
              style={{
                backgroundColor: colors.background,
                borderColor: included ? colors.accent : colors.border,
              }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: included }}
                accessibilityLabel={`Track ${candidate.label}`}
                onPress={() => toggle(candidate)}
                hitSlop={8}
                className="min-w-0 flex-1 flex-row items-center gap-3">
                <MaterialCommunityIcons
                  name={included ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={22}
                  color={included ? colors.accent : muted}
                />
                <View className="min-w-0 flex-1">
                  <ThemedText className="text-sm font-black" numberOfLines={1}>
                    {candidate.label}
                  </ThemedText>
                  <ThemedText className="mt-0.5 text-[11px]" style={{ color: muted }}>
                    {candidate.interval_guess === 'weekly' ? 'Weekly' : 'Monthly'} ·{' '}
                    {candidate.occurrences} seen
                  </ThemedText>
                </View>
                <ThemedText className="text-sm font-black" style={{ color: colors.accent }}>
                  {formatMoney(candidate.average_amount)}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${candidate.label} is not recurring`}
                onPress={() => void dismissOne(candidate)}
                hitSlop={10}>
                <MaterialCommunityIcons name="close" size={18} color={muted} />
              </Pressable>
            </View>
          );
        })}
      </View>

      {error && (
        <ThemedText className="mt-3 text-xs font-bold" style={{ color: '#D32F2F' }}>
          {error}
        </ThemedText>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={busy || selected.length === 0}
        onPress={() => void track()}
        className="mt-4 h-12 flex-row items-center justify-center rounded-2xl"
        style={{
          backgroundColor: colors.accent,
          opacity: busy || selected.length === 0 ? 0.6 : 1,
        }}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <>
            <MaterialCommunityIcons name="bell-check-outline" size={19} color={colors.onAccent} />
            <ThemedText className="ml-2 text-sm font-black" style={{ color: colors.onAccent }}>
              Track {selected.length === candidates.length ? 'all' : selected.length}
            </ThemedText>
          </>
        )}
      </Pressable>

      <View className="mt-2 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => router.push('/recurring-review')}
          className="h-11 flex-1 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.secondary, opacity: busy ? 0.6 : 1 }}>
          <ThemedText className="text-xs font-black" style={{ color: colors.accent }}>
            Review each
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void snoozeAll()}
          className="h-11 flex-1 items-center justify-center rounded-2xl border"
          style={{ borderColor: colors.border, opacity: busy ? 0.6 : 1 }}>
          <ThemedText className="text-xs font-black" style={{ color: muted }}>
            Not now
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
