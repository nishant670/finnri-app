import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnswerCard } from '@/components/home/AnswerCard';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import {
  describeParseFailure,
  isParseAnswer,
  parseEntryDraft,
  type LedgerAnswer,
} from '@/lib/parse';

type AskTurn = {
  id: number;
  question: string;
  answer?: LedgerAnswer;
  error?: string;
};

const STARTERS = [
  'How much did I spend this month?',
  'What was my biggest spend last week?',
  'Where did my money go this month?',
];

export default function AskFinnriScreen() {
  const router = useRouter();
  const theme = useThemeTokens();
  const { token } = useAuthStore();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [isSending, setIsSending] = useState(false);
  const nextID = useRef(1);
  const scrollRef = useRef<ScrollView>(null);
  /*
   * `KeyboardAvoidingView` used to hold the composer up, with `behavior`
   * set only on iOS — which on Android is the same as not mounting it at all.
   * Since edge-to-edge, `adjustResize` no longer shrinks the window either, so
   * nothing moved: the keyboard opened straight over the input and the user
   * typed a question they could not see. Measuring the keyboard is the one
   * approach that behaves the same on both platforms, and it is what
   * `KeyboardAvoidingScreen` and `AnimatedBottomSheet` already do.
   */
  const keyboardInset = useKeyboardInset();
  const insets = useSafeAreaInsets();

  // A transcript that stays put while the composer rises is the same bug one
  // step up: the answer you just asked about ends up behind the keyboard.
  useEffect(() => {
    if (keyboardInset <= 0) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 140);
    return () => clearTimeout(timer);
  }, [keyboardInset]);

  const submit = async (questionOverride?: string) => {
    const question = (questionOverride ?? input).trim();
    if (!question || isSending || !token) return;

    const id = nextID.current++;
    setTurns((current) => [...current, { id, question }]);
    setInput('');
    setIsSending(true);
    try {
      const result = await parseEntryDraft({ token, hintText: question });
      if (!isParseAnswer(result)) {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id
              ? { ...turn, error: 'That sounds like a transaction. Add it from Home instead.' }
              : turn
          )
        );
      } else {
        setTurns((current) =>
          current.map((turn) => (turn.id === id ? { ...turn, answer: result.answer } : turn))
        );
      }
    } catch (error) {
      const failure = describeParseFailure(error);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, error: `${failure.title}. ${failure.message}` } : turn
        )
      );
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return (
    /*
     * The bottom edge is handled below rather than here: the composer has to
     * sit on the safe area when the keyboard is down and on the keyboard when
     * it is up, and a SafeAreaView bottom inset would be added to both.
     */
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Ask Finnri" subtitle="Your ledger, answered" onBack={() => router.back()} />

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}>
          {turns.length === 0 ? (
            <View className="px-6">
              <View
                className="rounded-3xl border p-5"
                style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: theme.colors.secondary }}>
                  <MaterialCommunityIcons name="creation" size={21} color={theme.colors.accent} />
                </View>
                <ThemedText variant="cardTitle" style={{ marginTop: 14, color: theme.colors.text }}>
                  Ask about money you have recorded
                </ThemedText>
                <ThemedText
                  variant="caption"
                  style={{ marginTop: 6, color: `${theme.colors.text}99` }}>
                  Finnri calculates every figure from your ledger. Each question stands alone for now.
                </ThemedText>
                <View className="mt-4 gap-2">
                  {STARTERS.map((starter) => (
                    <Pressable
                      key={starter}
                      accessibilityRole="button"
                      onPress={() => void submit(starter)}
                      className="rounded-2xl border px-4 py-3"
                      style={{ borderColor: theme.colors.border }}>
                      <ThemedText variant="captionStrong" style={{ color: theme.colors.accent }}>
                        {starter}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          {turns.map((turn) => (
            <View key={turn.id}>
              <View className="mb-3 items-end px-6">
                <View
                  className="max-w-[88%] rounded-3xl rounded-br-lg px-4 py-3"
                  style={{ backgroundColor: theme.colors.accent }}>
                  <ThemedText variant="body" style={{ color: '#FFFFFF' }}>
                    {turn.question}
                  </ThemedText>
                </View>
              </View>
              {turn.answer ? (
                <AnswerCard
                  answer={turn.answer}
                  sourceText={turn.question}
                  onDismiss={() =>
                    setTurns((current) => current.filter((candidate) => candidate.id !== turn.id))
                  }
                  onAskSuggestion={(question) => void submit(question)}
                />
              ) : turn.error ? (
                <View
                  className="mx-6 mb-4 rounded-3xl border p-4"
                  style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                  <ThemedText variant="caption" style={{ color: theme.colors.text }}>
                    {turn.error}
                  </ThemedText>
                </View>
              ) : (
                <View className="mx-6 mb-4 flex-row items-center gap-3 px-2 py-3">
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <ThemedText variant="caption" style={{ color: `${theme.colors.text}99` }}>
                    Looking through your transactions…
                  </ThemedText>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <View
          className="border-t px-5 pt-3"
          style={{
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            paddingBottom: (keyboardInset > 0 ? keyboardInset : insets.bottom) + 12,
          }}>
          <View
            className="min-h-14 flex-row items-end gap-2 rounded-3xl border px-4 py-2"
            style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
            <TextInput
              accessibilityLabel="Ask Finnri a question"
              value={input}
              onChangeText={setInput}
              editable={!isSending}
              multiline
              placeholder="Ask about your spending or income"
              placeholderTextColor={`${theme.colors.text}66`}
              selectionColor={theme.colors.accent}
              style={{ flex: 1, minHeight: 40, maxHeight: 100, color: theme.colors.text, paddingTop: 10 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send question"
              disabled={!input.trim() || isSending}
              onPress={() => void submit()}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: input.trim() && !isSending ? theme.colors.accent : theme.colors.border,
              }}>
              <MaterialCommunityIcons name="arrow-up" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
