import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlansOfferSheet } from '@/components/billing/PlansOfferSheet';
import { AnswerCard, FinnriByline, threadStyles } from '@/components/home/AnswerCard';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ThemedText } from '@/components/themed-text';
import { useAppDialog } from '@/components/ui/AppDialogProvider';
import { PressableView } from '@/components/ui/PressableView';
import { useAuthStore } from '@/hooks/use-auth-store';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { usePlansPrompt } from '@/hooks/use-plans-prompt';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { blockedAIReason } from '@/lib/credit-gate';
import type { BlockedAIReason } from '@/lib/plans-prompt';
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

/** Questions to start from, each with the glyph of what it asks about (board R12-AskEmpty). */
const STARTERS: { question: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { question: 'How much did I spend this month?', icon: 'wallet-outline' },
  { question: 'What was my biggest spend last week?', icon: 'trophy-outline' },
  { question: 'Where did my money go this month?', icon: 'chart-pie' },
];

export default function AskFinnriScreen() {
  const router = useRouter();
  const theme = useThemeTokens();
  const { token, user } = useAuthStore();
  const dialog = useAppDialog();
  const isGuest = !!user?.is_guest;
  const plansPrompt = usePlansPrompt({ token, isGuest, isBusy: () => false });
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

  /**
   * The way past a refused question, offered on the spot: the plans sheet for
   * someone who can buy, sign-in for a guest, and a plain word for someone
   * whose pass is still running — another would only queue behind it.
   */
  const offerMoreCredits = async (blocked: BlockedAIReason) => {
    if (isGuest) {
      const signIn = await dialog.confirm({
        title: 'Sign in for more AI credits',
        message:
          'Your guest credits are used up. Sign in to keep asking Finnri — everything you have added so far comes with you.',
        confirmLabel: 'Sign in',
        cancelLabel: 'Not now',
      });
      if (signIn) router.push('/auth?mode=link');
      return;
    }
    if (await plansPrompt.offerForBlockedAI(blocked)) return;
    const seePlans = await dialog.confirm({
      title:
        blocked === 'daily_limit'
          ? 'Today’s AI credits are used up'
          : 'Your AI credits are used up',
      message:
        blocked === 'daily_limit'
          ? 'They come back tomorrow.'
          : 'Plans & Credits shows what you have and when it refreshes.',
      confirmLabel: 'View plans',
      cancelLabel: 'OK',
    });
    if (seePlans) router.push('/billing');
  };

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
      const blocked = blockedAIReason(error);
      // The capture sheet's wording ("That capture did not go through") is
      // wrong here — this was a question — so only the reason is kept.
      const message = blocked
        ? blocked === 'daily_limit'
          ? 'You have used today’s AI credits, so Finnri could not answer that.'
          : 'You are out of AI credits, so Finnri could not answer that.'
        : describeParseFailure(error).message;
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, error: message } : turn))
      );
      if (blocked) void offerMoreCredits(blocked);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  /**
   * A suggestion tapped on Insights (P32) arrives as `q` and is asked once,
   * as soon as there is a session to ask with.
   */
  const { q: suggestedQuestion } = useLocalSearchParams<{ q?: string }>();
  const askedSuggestion = useRef<string | null>(null);
  useEffect(() => {
    const question = suggestedQuestion?.trim();
    if (!question || !token || askedSuggestion.current === question) return;
    askedSuggestion.current = question;
    void submit(question);
    // `submit` is rebuilt every render; the ref keeps this to one ask per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedQuestion, token]);

  const { colors } = theme;
  const canSend = Boolean(input.trim()) && !isSending;

  return (
    /*
     * The bottom edge is handled below rather than here: the composer has to
     * sit on the safe area when the keyboard is down and on the keyboard when
     * it is up, and a SafeAreaView bottom inset would be added to both.
     */
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.screen}>
        <ScreenHeader title="Ask Finnri" onBack={() => router.back()} />

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.thread}>
          {turns.length === 0 ? (
            <>
              <View style={styles.intro}>
                <View style={[styles.introMark, { backgroundColor: colors.selectedFill }]}>
                  <MaterialCommunityIcons name="creation" size={26} color={colors.accent} />
                </View>
                <ThemedText style={[styles.introTitle, { color: colors.text }]}>Ask about your money</ThemedText>
                <ThemedText tone="muted" style={styles.introText}>
                  Finnri works out every number from what you have recorded. Each question stands on its own for now.
                </ThemedText>
              </View>
              <ThemedText tone="muted" accessibilityRole="header" style={styles.startersLabel}>
                Try asking
              </ThemedText>
              <View style={[styles.starters, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {STARTERS.map((starter, index) => (
                  <PressableView
                    key={starter.question}
                    accessibilityRole="button"
                    onPress={() => void submit(starter.question)}
                    style={styles.starter}
                    pressedStyle={styles.pressed}>
                    {index > 0 ? <View style={[styles.starterRule, { backgroundColor: colors.border }]} /> : null}
                    <View style={[styles.starterTile, { backgroundColor: colors.track }]}>
                      <MaterialCommunityIcons name={starter.icon} size={18} color={colors.text} />
                    </View>
                    <ThemedText style={[styles.starterText, { color: colors.text }]}>{starter.question}</ThemedText>
                    <MaterialCommunityIcons name="arrow-right" size={18} color={colors.muted} />
                  </PressableView>
                ))}
              </View>
            </>
          ) : null}

          {turns.map((turn) => (
            <View key={turn.id}>
              <View style={[styles.question, { backgroundColor: colors.selectedFill }]}>
                <ThemedText style={[styles.questionText, { color: colors.text }]}>{turn.question}</ThemedText>
              </View>
              {turn.answer ? (
                <AnswerCard
                  variant="thread"
                  answer={turn.answer}
                  onAskSuggestion={(question) => void submit(question)}
                />
              ) : turn.error ? (
                <View style={[threadStyles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={threadStyles.body}>
                    <FinnriByline />
                    <ThemedText style={[styles.errorText, { color: colors.text }]}>{turn.error}</ThemedText>
                  </View>
                </View>
              ) : (
                <View
                  accessibilityLiveRegion="polite"
                  style={[threadStyles.bubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={threadStyles.body}>
                    <FinnriByline label="Finnri is looking through your transactions…" />
                    {/* The answer's shape, held still: the label, the figure, the count. */}
                    <View style={styles.placeholder}>
                      <View style={[styles.bar, { width: '40%', backgroundColor: colors.track }]} />
                      <View style={[styles.bar, styles.barTall, { width: '70%', backgroundColor: colors.track }]} />
                      <View style={[styles.bar, { width: '55%', backgroundColor: colors.track }]} />
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        <View
          style={[
            styles.composerBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: (keyboardInset > 0 ? keyboardInset : insets.bottom) + 12,
            },
          ]}>
          <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
            <TextInput
              accessibilityLabel="Ask Finnri a question"
              value={input}
              onChangeText={setInput}
              editable={!isSending}
              multiline
              placeholder="Ask about your spending or income"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              style={[styles.input, { color: colors.text }]}
            />
            <PressableView
              accessibilityRole="button"
              accessibilityLabel="Send question"
              disabled={!canSend}
              onPress={() => void submit()}
              style={[styles.send, { backgroundColor: canSend ? colors.accent : colors.track }]}
              pressedStyle={styles.pressed}>
              <MaterialCommunityIcons name="arrow-up" size={20} color={canSend ? colors.onAccent : colors.muted} />
            </PressableView>
          </View>
        </View>
      </View>
      <PlansOfferSheet {...plansPrompt.sheet} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  thread: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  intro: {
    alignItems: 'center',
    marginTop: 20,
    marginHorizontal: 24,
  },
  introMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    marginTop: 14,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  introText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  startersLabel: {
    marginTop: 28,
    marginBottom: 8,
    marginHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  starters: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  starter: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 8,
  },
  starterRule: {
    position: 'absolute',
    top: 0,
    left: 62,
    right: 0,
    height: 1,
  },
  starterTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  question: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginBottom: 12,
    marginLeft: 64,
    marginRight: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 21,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
  },
  placeholder: {
    marginTop: 2,
    gap: 10,
  },
  bar: {
    height: 10,
    borderRadius: 5,
  },
  barTall: {
    height: 28,
    borderRadius: 14,
  },
  composerBar: {
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  composer: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 26,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
