import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { categoryVisual } from '@/lib/categories';
import { formatRelativeDay } from '@/lib/datetime';
import { haptics } from '@/lib/haptics';
import { formatMoney } from '@/lib/money';
import type { LedgerAnswer } from '@/lib/parse';
import { openAnswerEntry, openAnswerTransactions } from '@/lib/transaction-links';

/**
 * The answer to a question asked through the capture field.
 *
 * Everything numeric on this card came out of the database and travelled here
 * as a number. The server sends figures and labels; the sentence around them is
 * assembled below, and every amount goes through `formatMoney` like every other
 * amount in the app. Nothing here was written by the model.
 *
 * The card always states its own scope. "₹4,820" alone is unfalsifiable — the
 * reader cannot tell whether it covers this month, last month or everything, so
 * they cannot tell whether it is wrong. The subject and the period sit directly
 * under the number, and the row beneath opens the transactions the number was
 * computed from, so the answer is always one tap from its own evidence.
 *
 * ## Layout
 *
 * The card is a stack, not a text column indented under an icon. The earlier
 * version hung everything off the right of a 36pt avatar and to the left of a
 * close button, which left the hero amount reading in a channel about two
 * thirds of the card wide with the figure, its scope and its call to action all
 * four points apart — a wall rather than an answer. The mark and the question
 * are a header row now; the figure owns the full width under it; and the
 * evidence sits below a rule, which is what makes it read as a destination
 * rather than as another line of the answer.
 */

type AnswerCardProps = {
  answer: LedgerAnswer;
  /** What the user actually said, shown back so a misheard word is visible. */
  sourceText?: string;
  onDismiss?: () => void;
  /** Re-asks one of the suggested questions through the same channel. */
  onAskSuggestion: (question: string) => void;
  /**
   * `card` stands alone on Home, under the capture field, so it repeats the
   * question and can be closed. `thread` is Finnri's reply in Ask Finnri
   * (board R12-AskAnswer): the question is the bubble right above it, and a
   * reply in a conversation has nothing to close.
   */
  variant?: 'card' | 'thread';
};

const metricLabels: Record<string, string> = {
  spend_total: 'Spent',
  income_total: 'Received',
  net: 'Net',
  count: 'Transactions',
  average: 'Average',
  largest: 'Largest',
  breakdown: 'Spent',
};

/** The line under the number: what was counted, over which window. */
export const describeAnswerScope = (answer: LedgerAnswer) => {
  const parts: string[] = [];
  if (answer.subject) parts.push(answer.subject);
  else if (answer.metric === 'income_total') parts.push('across all income');
  else if (answer.metric === 'net') parts.push('income minus spending');
  if (answer.period.label) parts.push(answer.period.label);
  return parts.join(' · ');
};

export const describeAnswerCount = (answer: LedgerAnswer) => {
  if (answer.metric === 'count') return null;
  if (answer.transaction_count === 1) return 'from 1 transaction';
  return `from ${answer.transaction_count} transactions`;
};

/**
 * True when the entry on the answer *is* the answer, rather than one row out of
 * many that happens to be the biggest.
 *
 * A `largest` answer names its entry because the entry is what was asked for.
 * Any other metric that resolved to a single transaction names it because there
 * was only ever one — and in both cases the row is worth showing, but only the
 * second replaces the tap-through to a list of one.
 */
export const answerHasSoleEntry = (answer: LedgerAnswer) =>
  Boolean(answer.largest_entry) && answer.transaction_count === 1;

/**
 * The thread variant's two lines around the number: the measure and its
 * window above ("Spent this month"), what was counted below ("Food & Drinks ·
 * from 4 transactions").
 */
export const describeThreadAnswer = (answer: LedgerAnswer) => {
  const label = [metricLabels[answer.metric] ?? 'Answer', answer.period.label]
    .filter(Boolean)
    .join(' ');
  const subject =
    answer.subject ||
    (answer.metric === 'income_total'
      ? 'across all income'
      : answer.metric === 'net'
        ? 'income minus spending'
        : '');
  const detail = [subject, describeAnswerCount(answer)].filter(Boolean).join(' · ');
  return { label, detail };
};

export function AnswerCard({
  answer,
  sourceText = '',
  onDismiss,
  onAskSuggestion,
  variant = 'card',
}: AnswerCardProps) {
  const themeTokens = useThemeTokens();
  const colors = themeTokens.colors;
  const motion = useMotion();
  const muted = `${colors.text}99`;
  const isDark = themeTokens.mode === 'dark';

  const enter = motion.reduced ? undefined : FadeIn.duration(motion.duration('base'));
  const exit = motion.reduced ? undefined : FadeOut.duration(motion.exitDuration('instant'));

  const scope = describeAnswerScope(answer);
  const countLine = describeAnswerCount(answer);
  const answered = answer.status === 'answered';
  const entry = answer.largest_entry;
  const soleEntry = answerHasSoleEntry(answer);
  // A list of one is a list the reader has to tap twice to get through, and the
  // row above it already is that one. Everything else keeps its tap-through.
  const canOpenList =
    answered && !soleEntry && Object.keys(answer.filters ?? {}).length > 0;

  const openList = () => {
    haptics.select();
    openAnswerTransactions(answer.filters);
  };

  const openEntry = () => {
    if (!entry) return;
    haptics.select();
    openAnswerEntry(entry.entry_id);
  };

  const visual = entry ? categoryVisual(entry.category, answer.entry_type) : null;

  if (variant === 'thread') {
    const { label, detail } = describeThreadAnswer(answer);
    return (
      <Animated.View
        entering={enter}
        exiting={exit}
        accessibilityLabel="Answer"
        style={[threadStyles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={threadStyles.body}>
          <FinnriByline />
          {answer.status === 'unsupported' || answer.status === 'no_data' ? (
            <ThemedText style={[threadStyles.message, { color: colors.text }]}>
              {answer.status === 'unsupported'
                ? (answer.message ?? 'Finnri cannot answer that one yet.')
                : `Nothing recorded${scope ? ` for ${scope}` : ''}.`}
            </ThemedText>
          ) : (
            <>
              <ThemedText tone="muted" style={threadStyles.label}>
                {label}
              </ThemedText>
              <ThemedText numberOfLines={1} adjustsFontSizeToFit style={[threadStyles.amount, { color: colors.text }]}>
                {answer.metric === 'count'
                  ? String(answer.transaction_count)
                  : formatMoney(answer.amount ?? 0)}
              </ThemedText>
              {detail ? (
                <ThemedText tone="muted" style={threadStyles.label}>
                  {detail}
                </ThemedText>
              ) : null}
              {answer.breakdown.length > 0 ? (
                <View style={threadStyles.breakdown}>
                  {answer.breakdown.map((slice) => (
                    <View key={slice.label} style={threadStyles.slice}>
                      <ThemedText numberOfLines={1} style={[threadStyles.sliceLabel, { color: colors.text }]}>
                        {slice.label}
                      </ThemedText>
                      <ThemedText style={[threadStyles.sliceAmount, { color: colors.text }]}>
                        {formatMoney(slice.amount)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
          {!answered && answer.suggestions.length > 0 ? (
            <View style={threadStyles.suggestions}>
              {answer.suggestions.slice(0, 3).map((suggestion) => (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  onPress={() => {
                    haptics.select();
                    onAskSuggestion(suggestion);
                  }}
                  style={[threadStyles.suggestion, { borderColor: colors.borderStrong }]}>
                  <ThemedText style={[threadStyles.suggestionLabel, { color: colors.text }]}>
                    {suggestion}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {answered && entry && visual ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${entry.title || entry.merchant || 'this transaction'}`}
            onPress={openEntry}
            style={[threadStyles.entry, { borderTopColor: colors.border }]}>
            <View style={[threadStyles.entryTile, { backgroundColor: visual.bgColor }]}>
              <MaterialCommunityIcons name={visual.icon} size={18} color={visual.color} />
            </View>
            <View style={threadStyles.entryText}>
              <ThemedText numberOfLines={1} style={[threadStyles.entryTitle, { color: colors.text }]}>
                {entry.title || entry.merchant || 'Transaction'}
              </ThemedText>
              <ThemedText tone="muted" numberOfLines={1} style={threadStyles.entryMeta}>
                {[entry.category, formatRelativeDay(entry.date)].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
            <ThemedText style={[threadStyles.entryAmount, { color: colors.text }]}>
              {formatMoney(entry.amount)}
            </ThemedText>
          </Pressable>
        ) : null}
        {canOpenList ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See the ${answer.transaction_count} transactions behind this`}
            onPress={openList}
            style={[threadStyles.link, { borderTopColor: colors.border }]}>
            <ThemedText style={[threadStyles.linkLabel, { color: colors.text }]}>
              {`See the ${answer.transaction_count} transactions`}
            </ThemedText>
            <MaterialCommunityIcons name="chevron-right" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      className="mx-4 mb-3 rounded-2xl border p-5"
      style={{
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF8F4',
        borderColor: colors.border,
      }}>
      {/* Header: the mark, the question as Finnri heard it, and the way out.
          A wrong answer is usually a misheard word, and this is the only place
          that shows. */}
      <View className="flex-row items-center gap-3">
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.secondary }}>
          <MaterialCommunityIcons name="creation" size={18} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          {sourceText ? (
            <ThemedText variant="caption" style={{ color: muted }} numberOfLines={2}>
              “{sourceText}”
            </ThemedText>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss answer"
          hitSlop={12}
          onPress={() => {
            haptics.select();
            onDismiss?.();
          }}>
          <MaterialCommunityIcons name="close" size={18} color={muted} />
        </Pressable>
      </View>

      {answer.status === 'unsupported' || answer.status === 'no_data' ? (
        <ThemedText variant="bodyStrong" style={{ marginTop: 14, color: colors.text }}>
          {answer.status === 'unsupported'
            ? (answer.message ?? 'Finnri cannot answer that one yet.')
            : `Nothing recorded${scope ? ` for ${scope}` : ''}.`}
        </ThemedText>
      ) : (
        <View style={{ marginTop: 16 }}>
          <ThemedText
            variant="micro"
            style={{ color: muted, textTransform: 'uppercase', letterSpacing: 1 }}>
            {metricLabels[answer.metric] ?? 'Answer'}
          </ThemedText>
          {/* amountHero carries its own line height. A bare text-[Npx]
              would clip the comma out of ₹40,486. */}
          <ThemedText variant="amountHero" style={{ marginTop: 4, color: colors.text }}>
            {answer.metric === 'count'
              ? String(answer.transaction_count)
              : formatMoney(answer.amount ?? 0)}
          </ThemedText>
          {scope ? (
            <ThemedText variant="caption" style={{ marginTop: 6, color: muted }}>
              {scope}
              {countLine ? ` · ${countLine}` : ''}
            </ThemedText>
          ) : null}

          {answer.breakdown.length > 0 ? (
            <View className="mt-4 gap-2.5">
              {answer.breakdown.map((slice) => (
                <View key={slice.label} className="flex-row items-center justify-between gap-3">
                  <ThemedText
                    variant="caption"
                    numberOfLines={1}
                    style={{ flex: 1, color: colors.text }}>
                    {slice.label}
                  </ThemedText>
                  <ThemedText variant="captionStrong" style={{ color: colors.text }}>
                    {formatMoney(slice.amount)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {/* Questions Finnri can answer, offered wherever it could not answer
          this one — a decline that names no alternative teaches people to
          stop asking. */}
      {!answered && answer.suggestions.length > 0 ? (
        <View className="mt-4 gap-2">
          {answer.suggestions.slice(0, 3).map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityRole="button"
              onPress={() => {
                haptics.select();
                onAskSuggestion(suggestion);
              }}
              className="self-start rounded-full border px-3 py-2"
              style={{ borderColor: colors.border }}>
              <ThemedText variant="captionStrong" style={{ color: colors.text }}>
                {suggestion}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* The evidence, below a rule so it reads as somewhere to go rather than
          as one more line of the answer. */}
      {answered && (entry || canOpenList) ? (
        <View className="mt-4 border-t pt-4" style={{ borderColor: colors.border }}>
          {/*
           * The transaction, shown rather than described. "See the
           * transaction" was a button asking the reader to go and find out
           * what it was, and where the answer covers a single row the
           * destination was a list holding exactly that row. So the row is
           * here — with the category it was filed under and the day it
           * happened, which is what makes a figure checkable — and the tap
           * opens the entry rather than a list of one.
           */}
          {entry && visual ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${entry.title || entry.merchant || 'this transaction'}`}
              onPress={openEntry}
              className="flex-row items-center gap-3">
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: visual.bgColor }}>
                <MaterialCommunityIcons name={visual.icon} size={19} color={visual.color} />
              </View>
              <View className="min-w-0 flex-1">
                <ThemedText variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
                  {entry.title || entry.merchant || 'Transaction'}
                </ThemedText>
                <ThemedText
                  variant="caption"
                  numberOfLines={1}
                  style={{ marginTop: 2, color: muted }}>
                  {[entry.category, formatRelativeDay(entry.date)].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <ThemedText variant="captionStrong" style={{ color: colors.text }}>
                {formatMoney(entry.amount)}
              </ThemedText>
            </Pressable>
          ) : null}

          {canOpenList ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`See the ${answer.transaction_count} transactions behind this`}
              onPress={openList}
              className={`flex-row items-center justify-between gap-3 ${entry ? 'mt-4' : ''}`}>
              <ThemedText variant="button" style={{ color: colors.text }}>
                {`See the ${answer.transaction_count} transactions`}
              </ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Who is speaking, at the top of each of Finnri's replies: the mark and the name. */
export function FinnriByline({ label = 'Finnri' }: { label?: string }) {
  const { colors } = useThemeTokens();
  return (
    <View style={threadStyles.byline}>
      <View style={[threadStyles.mark, { backgroundColor: colors.selectedFill }]}>
        <MaterialCommunityIcons name="creation" size={14} color={colors.accent} />
      </View>
      <ThemedText tone="muted" style={threadStyles.bylineLabel}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Finnri's side of the Ask thread: a bubble squared at its top left (board R12-AskAnswer). */
export const threadStyles = StyleSheet.create({
  bubble: {
    marginLeft: 16,
    marginRight: 64,
    marginBottom: 12,
    borderWidth: 1,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
  },
  body: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bylineLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  amount: {
    marginTop: 2,
    marginBottom: 2,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  breakdown: {
    marginTop: 12,
    gap: 8,
  },
  slice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sliceLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  sliceAmount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  suggestions: {
    marginTop: 12,
    gap: 8,
  },
  suggestion: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  suggestionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  entry: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  entryTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  entryTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  entryMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  entryAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  link: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 12,
    borderTopWidth: 1,
  },
  linkLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
