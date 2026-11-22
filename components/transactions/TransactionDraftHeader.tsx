import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TransactionDraftSourceProps = {
  inputSource?: 'voice' | 'text' | 'receipt';
  sourceText: string;
};

/**
 * About two lines of the quote on a phone. Longer than this, the quote starts
 * clamped with "Show more".
 */
export const DRAFT_SOURCE_CLAMP_CHARS = 80;
const DRAFT_SOURCE_CLAMP_LINES = 2;

/**
 * What the AI heard, quoted above its draft so a misheard word is easy to spot
 * (board R2-Draft: a 32dp tile, "You said", then the words).
 *
 * Clamped to two lines (device feedback 2026-11-17): a 7-line voice note pushed
 * the amount and every field half a screen down. The start of the quote is
 * enough to spot a misheard word; "Show more" opens the rest in place. The
 * receipt and typed headers share this, so they behave the same. A new quote
 * (the next draft in the same sheet) starts clamped again.
 */
export function TransactionDraftSource({ inputSource, sourceText }: TransactionDraftSourceProps) {
  const { colors } = useThemeTokens();
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const long = sourceText.trim().length > DRAFT_SOURCE_CLAMP_CHARS;
  const expanded = long && expandedText === sourceText;

  return (
    <View style={[styles.source, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.sourceTile, { backgroundColor: colors.selectedFill }]}>
        <MaterialCommunityIcons
          name={
            inputSource === 'receipt'
              ? 'receipt-text-outline'
              : inputSource === 'text'
                ? 'keyboard-outline'
                : 'microphone-outline'
          }
          size={18}
          color={colors.text}
        />
      </View>
      <View style={styles.sourceText}>
        <ThemedText tone="muted" style={styles.caption}>
          {inputSource === 'receipt'
            ? 'Read from your receipt'
            : inputSource === 'text'
              ? 'You typed'
              : 'You said'}
        </ThemedText>
        <ThemedText
          testID="draft-source-text"
          numberOfLines={long && !expanded ? DRAFT_SOURCE_CLAMP_LINES : undefined}
          style={[styles.quote, { color: colors.text }]}>
          “{sourceText}”
        </ThemedText>
        {long ? (
          <PressableView
            testID="draft-source-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={
              expanded ? 'Show less of what was read' : 'Show all of what was read'
            }
            onPress={() => setExpandedText(expanded ? null : sourceText)}
            hitSlop={8}
            style={styles.toggle}
            pressedStyle={styles.pressed}>
            <ThemedText style={[styles.toggleLabel, { color: colors.text }]}>
              {expanded ? 'Show less' : 'Show more'}
            </ThemedText>
          </PressableView>
        ) : null}
      </View>
    </View>
  );
}

type TransactionDraftStatusProps = {
  isParsing: boolean;
  /** How many fields are still waiting for a look. */
  fieldsToCheck: number;
  /** Whether the parser sent any confidence data at all. */
  hasReviewMetadata: boolean;
  /** Questions the parser asked, shown under the count. */
  clarifications?: string[];
};

/**
 * The line under a draft's amount (board R2-Draft): how many fields want a
 * look, in warning ink, with the parser's own questions beneath it. Each of
 * those fields carries its own "Check" tag in the form below.
 */
export function TransactionDraftStatus({
  isParsing,
  fieldsToCheck,
  hasReviewMetadata,
  clarifications,
}: TransactionDraftStatusProps) {
  const { colors } = useThemeTokens();

  const line = isParsing ? (
    <>
      <ActivityIndicator size="small" color={colors.muted} />
      <ThemedText tone="muted" style={styles.status}>
        Reading your entry…
      </ThemedText>
    </>
  ) : fieldsToCheck > 0 ? (
    <>
      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.warning} />
      <ThemedText tone="warning" style={styles.status}>
        {`${fieldsToCheck} field${fieldsToCheck === 1 ? '' : 's'} to check`}
      </ThemedText>
    </>
  ) : hasReviewMetadata ? (
    <>
      <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.positive} />
      <ThemedText tone="positive" style={styles.status}>
        No issues flagged
      </ThemedText>
    </>
  ) : (
    // Mid-parse or without confidence data there is nothing to count, and
    // "No issues" would be a claim the parser never made.
    <ThemedText tone="muted" style={styles.status}>
      Review all fields
    </ThemedText>
  );

  return (
    <View accessibilityRole="summary" style={styles.statusBlock}>
      <View style={styles.statusLine}>{line}</View>
      {!isParsing &&
        clarifications?.map((clarification) => (
          <View key={clarification} style={styles.question}>
            <MaterialCommunityIcons name="help-circle-outline" size={16} color={colors.warning} />
            <ThemedText style={[styles.questionText, { color: colors.text }]}>
              {clarification}
            </ThemedText>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  sourceTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: {
    flex: 1,
    minWidth: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  quote: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  toggle: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  toggleLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.6,
  },
  statusBlock: {
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  status: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  question: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 8,
  },
  questionText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
