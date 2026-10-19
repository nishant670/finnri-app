import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
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
  sourceText: string;
  onDismiss: () => void;
  /** Re-asks one of the suggested questions through the same channel. */
  onAskSuggestion: (question: string) => void;
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

export function AnswerCard({ answer, sourceText, onDismiss, onAskSuggestion }: AnswerCardProps) {
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
            onDismiss();
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
