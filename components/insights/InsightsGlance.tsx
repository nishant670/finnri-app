import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { candidateKeyOf } from '@/components/money/RecurringCandidatesCard';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { withAlpha } from '@/constants/theme';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { getFriendlyErrorMessage } from '@/lib/api-error';
import { haptics } from '@/lib/haptics';
import {
  askSuggestions,
  buildQuickFacts,
  glanceComparison,
  lastMonth,
  thisWeekRange,
} from '@/lib/insight-glance';
import { insightDetailParams } from '@/lib/insight-summary';
import {
  saveRecurringCandidateDecision,
  trackRecurringCandidates,
  type DashboardRecurringCandidate,
  type DashboardResponse,
  type InsightCard as InsightCardData,
} from '@/lib/insights';
import { formatMoney } from '@/lib/money';
import { openFilteredTransactions } from '@/lib/transaction-links';
import { InsightCard, NavRow } from './insight-ui';
import { SectionHeader } from './SectionHeader';
import { SpendTrendChart } from './SpendTrendChart';

const dayLabel = (value?: string) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'short' }
  );
};

/**
 * "October at a glance" (P29, board R7-Home-Proposals): what the window has
 * cost, against the same days last month, the daily rate, and a bar per day.
 */
export function GlanceCard({
  dashboard,
  heading,
  onOpen,
}: {
  dashboard: DashboardResponse;
  /** "Spent in October so far", or the window's own name. */
  heading: string;
  onOpen: () => void;
}) {
  const { colors } = useThemeTokens();
  const comparison = glanceComparison(dashboard);
  return (
    <InsightCard testID="insights-glance">
      <PressableView
        accessibilityRole="button"
        accessibilityLabel={`${heading}, ${formatMoney(dashboard.summary.total_spent)}`}
        onPress={onOpen}
        pressedStyle={styles.pressed}>
        <View style={styles.glanceHead}>
          <ThemedText tone="muted" style={styles.eyebrow}>
            {heading}
          </ThemedText>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </View>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.glanceTotal, { color: colors.text }]}>
          {formatMoney(dashboard.summary.total_spent)}
        </ThemedText>
        <ThemedText tone="muted" style={styles.glanceLine}>
          {comparison ? (
            <>
              <ThemedText
                style={[
                  styles.glanceLine,
                  styles.strong,
                  { color: comparison.more ? colors.negative : colors.positive },
                ]}>
                {comparison.lead}
              </ThemedText>
              {` ${comparison.rest} · `}
            </>
          ) : null}
          {`${formatMoney(dashboard.summary.daily_average)} a day`}
        </ThemedText>
      </PressableView>
      <SpendTrendChart
        bare
        dashboard={dashboard}
        onOpenRange={(bucket) =>
          openFilteredTransactions({ startDate: bucket.start, endDate: bucket.end, type: 'Expense' })
        }
      />
    </InsightCard>
  );
}

/** The four quick facts under the glance, two by two (P29). */
export function QuickFacts({ dashboard }: { dashboard: DashboardResponse }) {
  const { colors } = useThemeTokens();
  const facts = buildQuickFacts(dashboard);
  if (facts.length === 0) return null;
  return (
    <View style={styles.facts} testID="insights-quick-facts">
      {facts.map((fact) => {
        const content = (
          <>
            <ThemedText tone="muted" numberOfLines={1} style={styles.factLabel}>
              {fact.label}
            </ThemedText>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.factValue, { color: colors.text }]}>
              {fact.value}
            </ThemedText>
            <ThemedText tone="muted" numberOfLines={1} style={styles.factCaption}>
              {fact.caption}
            </ThemedText>
          </>
        );
        const cardStyle = [styles.fact, { backgroundColor: colors.card, borderColor: colors.border }];
        return fact.entryId ? (
          <PressableView
            key={fact.key}
            accessibilityRole="button"
            accessibilityLabel={`${fact.label}, ${fact.value}, ${fact.caption}`}
            onPress={() =>
              router.push({ pathname: '/entry/[id]', params: { id: String(fact.entryId) } })
            }
            style={cardStyle}
            pressedStyle={styles.pressed}>
            {content}
          </PressableView>
        ) : (
          <View key={fact.key} style={cardStyle}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const INSIGHT_ICONS: Record<InsightCardData['kind'], keyof typeof MaterialCommunityIcons.glyphMap> = {
  period_comparison: 'chart-line',
  category_increase: 'trending-up',
  top_merchant: 'storefront-outline',
  account_usage: 'credit-card-outline',
  unusual_spending: 'alarm-light-outline',
  recurring_candidate: 'repeat',
  budget_watch: 'target',
  budget_exceeded: 'target',
};

/** Newest first, and anything that wants attention before that (P30). */
const rankInsights = (cards: InsightCardData[]) =>
  [...cards]
    .filter((card) => card.kind !== 'recurring_candidate')
    .sort((a, b) => Number(b.severity === 'warning') - Number(a.severity === 'warning'));

/**
 * "What stands out" (P30): one line each, with its number, and any payment
 * that looks monthly asked about right there — Track it or Not recurring
 * (P34).
 */
export function StandsOut({
  dashboard,
  rangeLabel,
  onChanged,
}: {
  dashboard: DashboardResponse;
  rangeLabel: string;
  onChanged: () => void;
}) {
  const { colors } = useThemeTokens();
  const [showAll, setShowAll] = useState(false);
  const insights = rankInsights(dashboard.insights);
  const candidates = dashboard.recurring_candidates ?? [];
  type Item =
    | { kind: 'insight'; card: InsightCardData }
    | { kind: 'candidate'; candidate: DashboardRecurringCandidate };
  // The first suspected subscription sits second, after the lead insight, so
  // the question it asks is seen without scrolling.
  const items: Item[] = [
    ...insights.slice(0, 1).map((card) => ({ kind: 'insight' as const, card })),
    ...candidates.map((candidate) => ({ kind: 'candidate' as const, candidate })),
    ...insights.slice(1).map((card) => ({ kind: 'insight' as const, card })),
  ];
  if (items.length === 0) return null;
  const shown = showAll ? items : items.slice(0, 3);

  return (
    <SectionHeader
      title="What stands out"
      actionLabel={items.length > 3 && !showAll ? 'All' : undefined}
      onAction={() => setShowAll(true)}>
      <InsightCard flush>
        {shown.map((item, index) =>
          item.kind === 'insight' ? (
            <NavRow
              key={`insight-${item.card.kind}-${index}`}
              icon={INSIGHT_ICONS[item.card.kind] ?? 'creation'}
              hue={
                item.card.severity === 'warning'
                  ? colors.warning
                  : item.card.severity === 'success'
                    ? colors.positive
                    : colors.accent
              }
              title={item.card.title}
              body={item.card.body}
              divider={index > 0}
              onPress={() =>
                router.push({
                  pathname: '/insight-detail',
                  params: insightDetailParams(item.card, dashboard, rangeLabel),
                })
              }
            />
          ) : (
            <CandidateRow
              key={`candidate-${candidateKeyOf(item.candidate)}`}
              candidate={item.candidate}
              divider={index > 0}
              onChanged={onChanged}
            />
          )
        )}
      </InsightCard>
    </SectionHeader>
  );
}

function CandidateRow({
  candidate,
  divider,
  onChanged,
}: {
  candidate: DashboardRecurringCandidate;
  divider: boolean;
  onChanged: () => void;
}) {
  const { colors } = useThemeTokens();
  const { token } = useAuthStore();
  const [busy, setBusy] = useState<'track' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = dayLabel(candidate.next_expected_date);
  const body = [
    candidate.label || candidate.merchant,
    `about ${formatMoney(candidate.average_amount)} a ${candidate.interval_guess === 'weekly' ? 'week' : 'month'}`,
    next ? `next around ${next}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const decide = async (decision: 'track' | 'dismiss') => {
    if (!token || busy) return;
    setBusy(decision);
    setError(null);
    try {
      if (decision === 'track') {
        await trackRecurringCandidates(token, { candidate_keys: [candidateKeyOf(candidate)] });
        haptics.saved();
      } else {
        await saveRecurringCandidateDecision(token, {
          candidate_key: candidateKeyOf(candidate),
          merchant: candidate.merchant,
          category: candidate.category,
          decision: 'dismissed',
        });
        haptics.removed();
      }
      onChanged();
    } catch (decideError) {
      haptics.rejected();
      setError(getFriendlyErrorMessage(decideError, 'Unable to save that right now.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View
      testID="insights-recurring-candidate"
      style={[styles.candidate, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={[styles.candidateTile, { backgroundColor: withAlpha(colors.accent, 0.14) }]}>
        <MaterialCommunityIcons name="repeat" size={20} color={colors.text} />
      </View>
      <View style={styles.flex}>
        <ThemedText style={[styles.candidateTitle, { color: colors.text }]}>
          {candidate.interval_guess === 'weekly' ? 'Looks like a weekly payment' : 'Looks like a monthly payment'}
        </ThemedText>
        <ThemedText tone="muted" style={styles.candidateBody}>
          {body}
        </ThemedText>
        <View style={styles.candidateActions}>
          <Button
            label="Track it"
            variant="outline"
            height={36}
            loading={busy === 'track'}
            disabled={busy !== null}
            accessibilityLabel={`Track ${candidate.label || candidate.merchant} as recurring`}
            onPress={() => void decide('track')}
          />
          <PressableView
            accessibilityRole="button"
            accessibilityLabel={`${candidate.label || candidate.merchant} is not recurring`}
            disabled={busy !== null}
            onPress={() => void decide('dismiss')}
            style={styles.textButton}
            pressedStyle={styles.pressed}>
            <ThemedText style={[styles.textButtonLabel, { color: colors.text }]}>Not recurring</ThemedText>
          </PressableView>
        </View>
        {error ? (
          <ThemedText tone="negative" style={styles.candidateBody}>
            {error}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/** "Ask Finnri" suggestions (P32): each one asks, so the section says it costs. */
export function AskSuggestions({ monthName }: { monthName: string }) {
  const { colors } = useThemeTokens();
  const questions = askSuggestions(monthName, lastMonth().name);
  return (
    <View>
      <View style={styles.askHead}>
        <ThemedText accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
          Ask Finnri
        </ThemedText>
        <ThemedText tone="muted" style={styles.factCaption}>
          Uses AI credits
        </ThemedText>
      </View>
      <View style={styles.askList}>
        {questions.map((question) => (
          <PressableView
            key={question}
            accessibilityRole="button"
            accessibilityLabel={`Ask Finnri: ${question}`}
            onPress={() => router.push({ pathname: '/ask', params: { q: question } })}
            style={[styles.askRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="creation-outline" size={18} color={colors.text} />
            <ThemedText style={[styles.askLabel, { color: colors.text }]}>{question}</ThemedText>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
          </PressableView>
        ))}
      </View>
    </View>
  );
}

/**
 * One Reviews section (P31): this week, and last month in review, both
 * opening the same review screen on its Week or Month side.
 */
export function ReviewsSection({ dashboard }: { dashboard: DashboardResponse }) {
  const week = thisWeekRange();
  const month = lastMonth();
  const months = dashboard.overview?.recent_months ?? [];
  const index = months.findIndex((candidate) => candidate.month === month.key);
  const monthData = index >= 0 ? months[index] : null;
  const before = index > 0 ? months[index - 1] : null;
  const change =
    monthData && before && before.spent > 0
      ? Math.round(((monthData.spent - before.spent) / before.spent) * 100)
      : null;
  const monthCaption = monthData
    ? [
        `${monthData.count} ${monthData.count === 1 ? 'entry' : 'entries'}`,
        change !== null && change !== 0
          ? `${Math.abs(change)}% ${change < 0 ? 'under' : 'over'} ${before?.label ?? 'the month before'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'The finished month, and what changed';

  return (
    <SectionHeader title="Reviews">
      <InsightCard flush>
        <ReviewRow
          icon="calendar-week"
          title="This week"
          caption={week.caption}
          trailing="Open"
          onPress={() =>
            router.push({
              pathname: '/weekly-review',
              params: { start: week.start, end: week.end, label: 'This week' },
            })
          }
        />
        <ReviewRow
          icon="file-document-outline"
          title={`${month.name} in review`}
          caption={monthCaption}
          trailing={monthData ? formatMoney(monthData.spent) : 'Open'}
          divider
          onPress={() => router.push({ pathname: '/monthly-review', params: { month: month.key } })}
        />
      </InsightCard>
    </SectionHeader>
  );
}

function ReviewRow({
  icon,
  title,
  caption,
  trailing,
  divider = false,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  caption: string;
  trailing: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${caption}`}
      onPress={onPress}
      style={[styles.reviewRow, divider && { borderTopWidth: 1, borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <View style={[styles.candidateTile, { backgroundColor: withAlpha(colors.text, 0.06) }]}>
        <MaterialCommunityIcons name={icon} size={20} color={colors.text} />
      </View>
      <View style={styles.flex}>
        <ThemedText style={[styles.reviewTitle, { color: colors.text }]}>{title}</ThemedText>
        <ThemedText tone="muted" numberOfLines={1} style={styles.candidateBody}>
          {caption}
        </ThemedText>
      </View>
      <ThemedText style={[styles.reviewTrailing, { color: colors.text }]}>{trailing}</ThemedText>
    </PressableView>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  glanceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  glanceTotal: {
    marginTop: 2,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  glanceLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  strong: {
    fontWeight: '700',
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fact: {
    width: '48.5%',
    flexGrow: 1,
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  factLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  factValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  factCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  candidate: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  candidateTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  candidateBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  candidateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  textButton: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  textButtonLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  askHead: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  askList: {
    gap: 8,
  },
  askRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 24,
  },
  askLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  reviewRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reviewTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  reviewTrailing: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
