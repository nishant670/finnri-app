import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { Card } from '@/components/ui/theme-primitives';
import { useHasPassed } from '@/hooks/use-has-passed';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  describeAccess,
  endedAccessLine,
  formatCreditDate,
  type BillingStatus,
} from '@/lib/billing';

type CreditStatusCardProps = {
  /**
   * The whole billing status, not just the credits: what to say at zero
   * depends on whether a pass is running, ran out, or was never bought.
   */
  status: BillingStatus | null;
  loading?: boolean;
  compact?: boolean;
  onPress?: () => void;
};

export function CreditStatusCard({
  status,
  loading = false,
  compact = false,
  onPress,
}: CreditStatusCardProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const credits = status?.credits ?? null;
  const dailyLimit = credits?.daily_limit ?? 0;
  const dailyRemaining = credits?.daily_credits_remaining ?? 0;
  const dailyUsed = credits?.daily_credits_used ?? 0;
  const progress = dailyLimit > 0 ? Math.min(1, Math.max(0, dailyUsed / dailyLimit)) : 0;
  const dailyRemainingRatio = dailyLimit > 0 ? dailyRemaining / dailyLimit : 1;
  const isLowDailyLimit = dailyLimit > 0 && dailyRemainingRatio < 0.2;
  const trialExpiry = formatCreditDate(credits?.trial_expires_at);
  const resetDate = formatCreditDate(credits?.reset_at);
  const totalRemaining = credits?.total_credits_remaining ?? 0;

  /**
   * An empty balance used to render as "0/50 used today" beside "0 left today"
   * — two true numbers that read as a bug, because the daily figure is capped
   * by the total and the total is gone. Once there is nothing left to spend,
   * the daily allowance is not the story: having run out is.
   */
  const isOutOfCredits = !loading && credits !== null && totalRemaining <= 0;
  // Read so the card redraws the moment the trial runs out; `describeAccess`
  // is what decides what that means.
  useHasPassed(credits?.trial_expires_at);
  const access = describeAccess(status);
  // A date in the past described in the future tense is the kind of small lie
  // that makes someone distrust every other number on the screen. So is
  // naming the trial to someone whose paid pass is what actually ran out.
  const trialLine =
    access.kind === 'ended'
      ? endedAccessLine(access.ended)
      : access.kind === 'trial' && trialExpiry
        ? `Trial expires ${trialExpiry}`
        : null;
  const passEnd = access.kind === 'pass' ? formatCreditDate(access.endsAt) : null;
  // At zero, the line under the bar says what gets AI back. Someone whose pass
  // ran out renews; someone who only ever had the trial has nothing to renew.
  // Inside a running pass, buying another one queues behind it and adds
  // nothing today, so it is not offered.
  const outOfCreditsHint =
    access.kind === 'pass'
      ? passEnd
        ? `${access.planName} runs until ${passEnd}`
        : `${access.planName} credits used up`
      : access.kind === 'ended' && access.ended.kind === 'pass'
        ? 'Renew to keep capturing by voice and text'
        : 'Choose a pass to keep capturing by voice and text';
  const needsAttention = isOutOfCredits || isLowDailyLimit;
  const isOutForToday = !loading && credits !== null && !isOutOfCredits && dailyRemaining <= 0;
  const compactTitle = loading
    ? 'AI credits'
    : isOutOfCredits
      ? 'Out of AI credits'
      : isOutForToday
        ? 'No AI credits left today'
        : isLowDailyLimit
          ? 'Daily AI credits low'
          : 'AI credits';
  const compactLines = loading
    ? ['Checking balance...']
    : isOutOfCredits
      ? [
          access.kind === 'pass'
            ? `${access.planName} credits used up`
            : access.kind === 'ended'
              ? trialLine
              : null,
          outOfCreditsHint,
        ].filter((line): line is string => Boolean(line))
      : [`${dailyUsed} of ${dailyLimit} used · ${totalRemaining} total credits left`];

  /**
   * Home's notice (boards R1-Home-CreditsLow and -Dark): one amber row with
   * the state in warning ink, the numbers under it, and "View plans" at the
   * end when there is somewhere to go. Without anything to warn about it is
   * an ordinary card.
   */
  const compactContent = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingLeft: 16,
        paddingRight: 12,
        borderRadius: 16,
        borderWidth: 1,
        backgroundColor: needsAttention ? colors.warningSurface : colors.card,
        borderColor: needsAttention ? colors.warningBorder : colors.border,
      }}>
      <MaterialCommunityIcons
        name={needsAttention ? 'alert-circle-outline' : 'creation'}
        size={20}
        color={needsAttention ? colors.warning : colors.text}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText
          style={{
            fontSize: 13,
            lineHeight: 18,
            fontWeight: '700',
            color: needsAttention ? colors.warning : colors.text,
          }}>
          {compactTitle}
        </ThemedText>
        {compactLines.map((line) => (
          <ThemedText key={line} tone="muted" style={{ fontSize: 12, lineHeight: 16 }}>
            {line}
          </ThemedText>
        ))}
      </View>
      {onPress ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 }}>
          <ThemedText style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text }}>
            View plans
          </ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.text} />
        </View>
      ) : null}
    </View>
  );

  const content = compact ? compactContent : (
    <Card
      compact
      style={{
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View
          style={{
            height: 38,
            width: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.secondary,
          }}>
          <MaterialCommunityIcons name="creation" size={19} color={colors.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText variant="captionStrong" style={{ color: colors.text }}>
            Finnri AI credits
          </ThemedText>
          <ThemedText numberOfLines={1} variant="caption" style={{ color: `${colors.text}8F` }}>
            {loading
              ? 'Checking balance...'
              : isOutOfCredits
                ? (access.kind === 'ended' && trialLine) || 'Out of credits — tap to see plans'
                : trialLine
                  ? trialLine
                  : resetDate
                    ? `Daily limit resets ${resetDate}`
                    : 'Usage refreshes daily'}
          </ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText
            variant="cardTitle"
            style={{ color: colors.text, fontSize: compact ? 18 : 22 }}>
            {credits?.total_credits_remaining ?? '—'}
          </ThemedText>
          <ThemedText variant="micro" style={{ color: `${colors.text}8F` }}>
            left
          </ThemedText>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <View
          style={{
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#F1E6E8',
          }}>
          <View
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              borderRadius: 4,
              backgroundColor: colors.accent,
            }}
          />
        </View>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
            {dailyRemaining} daily left
          </ThemedText>
          <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
            {dailyUsed}/{dailyLimit} used today
          </ThemedText>
        </View>
      </View>
    </Card>
  );

  if (onPress) {
    return (
      <PressableView
        accessibilityRole="button"
        onPress={onPress}
        style={{ marginHorizontal: compact ? 0 : 24 }}
        pressedStyle={{ opacity: 0.86 }}>
        {content}
      </PressableView>
    );
  }

  return <View style={{ marginHorizontal: compact ? 0 : 24 }}>{content}</View>;
}
