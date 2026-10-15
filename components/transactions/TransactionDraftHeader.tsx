import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type TransactionDraftSourceProps = {
  inputSource?: 'voice' | 'text' | 'receipt';
  sourceText: string;
};

/** What the AI heard, quoted above its draft so a misheard word is easy to spot. */
export function TransactionDraftSource({ inputSource, sourceText }: TransactionDraftSourceProps) {
  const theme = useThemeTokens().colors;

  return (
    <View
      className="mb-3 rounded-[20px] border px-4 py-3"
      style={{ backgroundColor: theme.card, borderColor: theme.border }}>
      <View className="flex-row items-center gap-1.5">
        <MaterialCommunityIcons
          name={
            inputSource === 'receipt'
              ? 'receipt-text-outline'
              : inputSource === 'text'
                ? 'keyboard-outline'
                : 'microphone-outline'
          }
          size={13}
          color="#9CA3AF"
        />
        <ThemedText tone="muted" className="text-[10px] font-black uppercase tracking-widest">
          {inputSource === 'receipt'
            ? 'Read from your receipt'
            : inputSource === 'text'
              ? 'You typed'
              : 'You said'}
        </ThemedText>
      </View>
      <ThemedText
        testID="draft-source-text"
        className="mt-1.5 text-sm font-bold italic"
        style={{ color: theme.text }}>
        “{sourceText}”
      </ThemedText>
    </View>
  );
}

type TransactionDraftBannerProps = {
  isParsing: boolean;
  /** How many fields are still waiting for a look. */
  fieldsToCheck: number;
  /** Whether the parser sent any confidence data at all. */
  hasReviewMetadata: boolean;
  /** Names of the fields to check, listed under the chip. Empty hides the line. */
  checkList: string[];
  /** Questions the parser asked, shown under the chip. */
  clarifications?: string[];
};

/** The amber "AI draft" banner that tops a parsed entry. */
export function TransactionDraftBanner({
  isParsing,
  fieldsToCheck,
  hasReviewMetadata,
  checkList,
  clarifications,
}: TransactionDraftBannerProps) {
  return (
    <View className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="creation-outline" size={18} color="#D97706" />
          <ThemedText
            tone="warning"
            className="ml-2 text-[11px] font-black uppercase tracking-widest">
            AI draft
          </ThemedText>
        </View>
        <View className="rounded-full border border-amber-200 bg-white px-2 py-1 dark:border-amber-800 dark:bg-gray-800">
          <ThemedText tone="warning" className="text-[9px] font-black uppercase">
            {/* Mid-parse the chip has no fields to count, and
                the fallback "Review all fields" is a claim about
                a draft that does not exist yet. */}
            {isParsing
              ? 'Reading'
              : fieldsToCheck > 0
                ? `${fieldsToCheck} field${fieldsToCheck === 1 ? '' : 's'} to check`
                : hasReviewMetadata
                  ? 'No issues flagged'
                  : 'Review all fields'}
          </ThemedText>
        </View>
      </View>
      {checkList.length > 0 && (
        <ThemedText tone="warning" className="mt-3 text-sm font-bold">
          Check: {checkList.join(', ')}
        </ThemedText>
      )}
      {clarifications?.map((clarification) => (
        <View key={clarification} className="mt-2 flex-row items-start">
          <MaterialCommunityIcons name="help-circle-outline" size={16} color="#D97706" />
          <ThemedText tone="warning" className="ml-2 flex-1 text-sm">
            {clarification}
          </ThemedText>
        </View>
      ))}
      <ThemedText tone="warning" className="mt-3 text-xs">
        {isParsing
          ? 'Picking out the amount, category and account. You can review everything before it is saved.'
          : 'AI suggestions are never saved until you confirm.'}
      </ThemedText>
    </View>
  );
}
