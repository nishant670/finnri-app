import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { PressableView } from '@/components/ui/PressableView';
import { mixHex, withAlpha } from '@/constants/theme';
import { useAudioLevel } from '@/hooks/use-audio-level';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AudioRecorder } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * ## The rings
 *
 * Both rings ride one clock — a single 0..1 shared value looping on the UI
 * thread — and the second is read half a period behind the first. That is what
 * "shared clock" buys: two independent timers drift apart within seconds and
 * the pair starts reading as two unrelated animations, whereas one clock keeps
 * them permanently interleaved, so a ring is always mid-flight and the mic
 * never has a dead frame.
 *
 * What the clock does *not* control is how far a ring travels or how bright it
 * gets. That is `level`, sampled from the recorder's metering — so the motion
 * is a property of the room rather than of the component, which is the whole
 * point. Silence gives a barely-there ripple; a spoken sentence pushes the
 * rings out and lights them up on the syllables.
 *
 * Idle keeps a slow single-ring breathe, because it was doing real work as an
 * affordance: it is what makes the mic look like it wants pressing. It is
 * deliberately a different *character* from the recording state — slower,
 * fixed reach, one ring — so that "it is moving" cannot be mistaken for "it is
 * hearing you". The old card ran the same ripple in both states, which is
 * precisely why it proved nothing.
 */

/**
 * How long one ring takes to travel out and fade. A loop period, not a `Motion`
 * duration — the tokens describe how fast a thing responds to you, and these
 * describe a cadence, the same reason the caret blink and the splash gradient
 * have their own numbers.
 */
const RING_PERIOD_IDLE_MS = 1800;
const RING_PERIOD_RECORDING_MS = 900;

/** How far past the button a ring reaches, as a scale delta. */
const IDLE_REACH = 0.14;
const QUIET_REACH = 0.06;
const LOUD_REACH = 0.5;

/** Peak opacity at the start of a ring's travel, before it fades outward. */
const IDLE_OPACITY = 0.16;
const QUIET_OPACITY = 0.1;
const LOUD_OPACITY = 0.42;

/** The button holds this while recording, per the spec. */
const RECORDING_BUTTON_SCALE = 1.04;

/** The mic, and the 6dp tinted halo drawn around it (board R1-Home-Empty). */
const MIC_SIZE = 64;
const MIC_HALO = 6;
const MIC_FRAME = MIC_SIZE + MIC_HALO * 2;

/** How far the halo sits from the card toward the accent. */
const HALO_TINT = 0.18;

/** How long a sample prompt stays up before the next one fades in. */
const PROMPT_ROTATE_MS = 2600;

/**
 * Reduced motion still has to answer "is it listening". Nothing moves, so the
 * rings hold at a visible radius instead — a state, not an animation, next to
 * the "Listening..." label that was already there.
 */
const STILL_REACH = 0.18;
const STILL_OPACITY = 0.2;

/**
 * One question, shown under the capture field so the other direction of the
 * channel is discoverable. It matches the first of the server's own
 * suggestions, so the app never advertises a question shape the API declines.
 */
const EXAMPLE_QUESTION = 'How much did I spend on food this month?';

type VoiceInputCardProps = {
  /**
   * Read for its metering only. The card never starts or stops it — that stays
   * with the screen that owns the permission prompt and the file.
   */
  recorder?: AudioRecorder | null;
  onMicPress: () => void;
  onMicLongPress?: () => void;
  onAskPress?: () => void;
  isRecording: boolean;
  hasRecording: boolean;
  inputText: string;
  onChangeText: (text: string) => void;
  onProcess: () => void;
  onClear: () => void;
  isProcessing?: boolean;
  /**
   * The last attempt on this recording came back as a failure.
   *
   * It changes what the card offers, not what it does: the primary action is
   * still `onProcess`, but a button labelled "Process" directly under an error
   * about the thing it just failed to process reads as though the app did not
   * notice. "Try again" is the same press, described honestly.
   */
  hasFailed?: boolean;
  isTextInputVisible?: boolean;
  onToggleTextInput?: () => void;
  /**
   * The third way in, beside speaking and typing: a photo of the bill. It sat
   * in the corner of the add sheet, where it was easy to miss and could crowd
   * the title on a narrow phone.
   */
  onScanBill?: () => void;
  /**
   * Manual entry, as the capture card's last footer action (P2). It is free,
   * so it is also what the card offers once AI credits run out.
   */
  onAddManually?: () => void;
  /**
   * AI capture can't be paid for (P1). The card says so itself instead of a
   * separate block below it: the mic greys out, manual entry becomes the
   * card's one accent action, and the way to more credits sits at its foot.
   */
  creditBlock?: CaptureCreditBlock | null;
  /**
   * A quiet status strip at the card's foot while credits are running low,
   * such as "8 AI credits left today · View plans" (P1).
   */
  creditNote?: CaptureCreditNote | null;
};

export type CaptureCreditBlock = {
  title: string;
  message: string;
  /** "950 total credits left", or null when there is nothing to report. */
  footnote?: string | null;
  actionLabel: string;
  onAction: () => void;
  /** A refused capture can be put away; a balance that is gone cannot. */
  onDismiss?: () => void;
};

export type CaptureCreditNote = {
  text: string;
  actionLabel: string;
  onAction: () => void;
};

export function VoiceInputCard({
  recorder,
  onMicPress,
  onMicLongPress,
  onAskPress,
  isRecording,
  hasRecording,
  inputText,
  onChangeText,
  onProcess,
  onClear,
  isProcessing = false,
  hasFailed = false,
  isTextInputVisible = false,
  onToggleTextInput,
  onScanBill,
  onAddManually,
  creditBlock,
  creditNote,
}: VoiceInputCardProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const trimmedInput = inputText.trim();
  const canSubmitText = trimmedInput.length > 0 && !isRecording && !isProcessing;
  const shouldShowTextInput = isTextInputVisible || trimmedInput.length > 0;
  const textInputRef = useRef<TextInput>(null);
  const motion = useMotion();
  const level = useAudioLevel(recorder, isRecording);
  const clock = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const textEntryAnim = useSharedValue(shouldShowTextInput ? 1 : 0);
  const promptFade = useSharedValue(1);
  const samplePrompts = useMemo(
    () => [
      `Spent 250 on food via UPI`,
      `Got 2000 from freelance`,
      `Paid 1200 rent by bank`,
      `Coffee 180 using card`,
    ],
    []
  );
  const [promptIndex, setPromptIndex] = useState(0);
  // The rotation runs off one long-lived interval, so the completion worklet
  // would otherwise close over whichever index was current when the effect last
  // ran and rotate 0 → 1 → 0 forever.
  const promptIndexRef = useRef(promptIndex);
  const micLongPressHandled = useRef(false);
  promptIndexRef.current = promptIndex;

  // One clock, running on the UI thread, restarted only when the state it is
  // paced by changes. Linear on purpose: an eased ring speeds up and slows down
  // within its own travel, which reads as a heartbeat rather than a level.
  useEffect(() => {
    if (motion.reduced) {
      cancelAnimation(clock);
      clock.value = 0;
      return undefined;
    }

    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, {
        duration: isRecording ? RING_PERIOD_RECORDING_MS : RING_PERIOD_IDLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => cancelAnimation(clock);
  }, [clock, isRecording, motion.reduced]);

  // Scales up on record and *holds* — it is a state the button is in, not a
  // flourish it performs, so it springs to 1.04 and stays until recording ends.
  useEffect(() => {
    buttonScale.value = motion.springTo(isRecording ? RECORDING_BUTTON_SCALE : 1);
  }, [buttonScale, isRecording, motion]);

  useEffect(() => {
    textEntryAnim.value = withTiming(shouldShowTextInput ? 1 : 0, motion.enter('base'));

    if (shouldShowTextInput) {
      const focusTimeout = setTimeout(() => textInputRef.current?.focus(), 160);
      return () => clearTimeout(focusTimeout);
    }

    return undefined;
  }, [motion, shouldShowTextInput, textEntryAnim]);

  useEffect(() => {
    if (isRecording) return undefined;

    // Both configs and the next index are resolved out here, on the JS thread.
    // A `withTiming` completion callback is a worklet running on the UI
    // runtime, so anything it reaches for has to be a value captured at
    // creation — calling `motion.enter()` or reading a ref from inside it
    // throws "Tried to synchronously call a Remote Function".
    const fadeOut = motion.exit('base');
    const fadeIn = motion.enter('base');

    const interval = setInterval(() => {
      const nextIndex = (promptIndexRef.current + 1) % samplePrompts.length;
      promptFade.value = withTiming(0, fadeOut, (finished) => {
        'worklet';
        if (!finished) return;
        runOnJS(setPromptIndex)(nextIndex);
        promptFade.value = withTiming(1, fadeIn);
      });
    }, PROMPT_ROTATE_MS);

    return () => clearInterval(interval);
  }, [isRecording, motion, promptFade, promptIndexRef, samplePrompts.length]);

  /**
   * A ring's whole appearance, from the clock and the level. `phase` is where
   * this ring is in its travel; ring 1 sits half a period behind ring 0, which
   * is what keeps one of them always visible.
   */
  const useRingStyle = (phaseOffset: number) =>
    useAnimatedStyle(() => {
      if (motion.reduced) {
        return {
          opacity: isRecording ? STILL_OPACITY : 0,
          transform: [{ scale: isRecording ? 1 + STILL_REACH : 1 }],
        };
      }

      const phase = (clock.value + phaseOffset) % 1;
      const reach = isRecording
        ? interpolate(level.value, [0, 1], [QUIET_REACH, LOUD_REACH])
        : IDLE_REACH;
      // Idle shows one ring: a second one adds motion without adding meaning,
      // and the pair is what the recording state uses to say "still hearing".
      const peak = isRecording
        ? interpolate(level.value, [0, 1], [QUIET_OPACITY, LOUD_OPACITY])
        : phaseOffset === 0
          ? IDLE_OPACITY
          : 0;

      return {
        opacity: (1 - phase) * peak,
        transform: [{ scale: 1 + phase * reach }],
      };
    }, [isRecording, motion.reduced]);

  const innerRingStyle = useRingStyle(0);
  const outerRingStyle = useRingStyle(0.5);

  const buttonScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const promptStyle = useAnimatedStyle(() => ({ opacity: promptFade.value }));

  const textEntryStyle = useAnimatedStyle(() => ({
    opacity: textEntryAnim.value,
    transform: [{ translateY: interpolate(textEntryAnim.value, [0, 1], [-8, 0]) }],
  }));
  const halo = mixHex(colors.card, colors.accent, HALO_TINT);
  const busy = isProcessing || isRecording;

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];

  const creditLink = (text: string | null | undefined, actionLabel: string, onAction: () => void) => (
    <PressableView
      accessibilityRole="button"
      accessibilityLabel={text ? `${text}. ${actionLabel}` : actionLabel}
      onPress={onAction}
      style={[styles.creditLink, { borderTopColor: colors.border }]}
      pressedStyle={styles.pressed}>
      <ThemedText tone="muted" numberOfLines={1} style={[styles.caption, styles.creditLinkText]}>
        {text ?? ''}
      </ThemedText>
      <View style={styles.creditLinkAction}>
        <ThemedText style={[styles.creditLinkLabel, { color: colors.text }]}>{actionLabel}</ThemedText>
        <MaterialCommunityIcons name="chevron-right" size={16} color={colors.text} />
      </View>
    </PressableView>
  );

  // Out of AI credits (P1, board R1-Home-UsedUp-Proposals). Not shown over a
  // recording or a parse already under way: those finish first.
  if (creditBlock && !isRecording && !isProcessing && !hasRecording) {
    return (
      <View style={cardStyle} accessibilityRole="alert">
        <View style={styles.hero}>
          <View style={[styles.micFrame, { backgroundColor: mixHex(colors.card, colors.track, 0.5) }]}>
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Voice capture paused"
              accessibilityState={{ disabled: true }}
              style={[styles.mic, { backgroundColor: colors.track }]}>
              <MaterialCommunityIcons
                name="microphone-off"
                size={28}
                color={withAlpha(colors.text, 0.5)}
              />
            </View>
          </View>
          <View style={styles.heroText}>
            <ThemedText style={[styles.title, { color: colors.text }]}>{creditBlock.title}</ThemedText>
            <ThemedText tone="muted" style={styles.body}>
              {creditBlock.message}
            </ThemedText>
          </View>
          {creditBlock.onDismiss ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={creditBlock.onDismiss}
              hitSlop={8}
              style={[styles.iconButton, styles.dismiss]}>
              <MaterialCommunityIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {onAddManually ? (
          <View style={styles.blockedAction}>
            <Button label="Add manually" icon="plus" height={48} onPress={onAddManually} />
          </View>
        ) : null}
        {creditLink(creditBlock.footnote, creditBlock.actionLabel, creditBlock.onAction)}
      </View>
    );
  }

  // A finished clip, waiting to be used or dropped.
  if (hasRecording && !isRecording) {
    return (
      <View style={cardStyle}>
        <View style={styles.hero}>
          <View style={[styles.micFrame, { backgroundColor: halo }]}>
            <View style={[styles.mic, { backgroundColor: colors.card }]}>
              <MaterialCommunityIcons
                name={hasFailed ? 'microphone-message' : 'waveform'}
                size={28}
                color={hasFailed ? colors.negative : colors.text}
              />
            </View>
          </View>
          <View style={styles.heroText}>
            <ThemedText style={[styles.title, { color: colors.text }]}>
              {hasFailed ? 'Recording kept' : 'Recording ready'}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.footerActions, { borderTopColor: colors.border }]}>
          <Button
            label={hasFailed ? 'Try again' : 'Use this'}
            icon={hasFailed ? 'refresh' : 'flash'}
            height={44}
            loading={isProcessing}
            onPress={onProcess}
            style={styles.footerButton}
          />
          <Button
            label="Cancel"
            variant="outline"
            icon="close"
            height={44}
            disabled={isProcessing}
            onPress={onClear}
            style={styles.footerButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      <View style={styles.hero}>
        {/* Mic Button */}
        <Animated.View style={[styles.micFrame, buttonScaleStyle]}>
          <View pointerEvents="none" style={[styles.micHalo, { backgroundColor: halo }]} />
          <Animated.View
            pointerEvents="none"
            style={[styles.pulseRing, { backgroundColor: colors.accent }, outerRingStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.pulseRing, { backgroundColor: colors.accent }, innerRingStyle]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Record an expense'}
            accessibilityState={{ busy: isRecording }}
            onPressIn={() => {
              micLongPressHandled.current = false;
            }}
            onLongPress={() => {
              if (!onMicLongPress || isRecording) return;
              micLongPressHandled.current = true;
              onMicLongPress();
            }}
            delayLongPress={450}
            onPress={() => {
              if (micLongPressHandled.current) {
                micLongPressHandled.current = false;
                return;
              }
              onMicPress();
            }}
            style={[styles.mic, { backgroundColor: colors.accent }]}>
            <MaterialCommunityIcons
              name={isRecording ? 'stop' : 'microphone'}
              size={28}
              color={colors.onAccent}
            />
          </Pressable>
        </Animated.View>

        <View style={styles.heroText}>
          <ThemedText
            numberOfLines={1}
            accessibilityLiveRegion="polite"
            style={[styles.title, { color: colors.text }]}>
            {isRecording ? 'Listening…' : 'Tap and speak'}
          </ThemedText>
          <ThemedText tone="muted" style={styles.body}>
            Talk the way you normally would. Finnri sorts it out.
          </ThemedText>
          <Animated.Text
            numberOfLines={1}
            style={[styles.body, styles.sample, { color: colors.text }, promptStyle]}>
            {`“${samplePrompts[promptIndex]}”`}
          </Animated.Text>
        </View>
      </View>

      {shouldShowTextInput ? (
        <Animated.View style={[styles.typeArea, { borderTopColor: colors.border }, textEntryStyle]}>
          <View style={[styles.field, { borderColor: colors.text, backgroundColor: colors.card }]}>
            <TextInput
              ref={textInputRef}
              accessibilityLabel="Type what you spent or earned"
              placeholder="spent 250 on food via UPI"
              placeholderTextColor={colors.muted}
              value={inputText}
              onChangeText={onChangeText}
              editable={!busy}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => {
                if (canSubmitText) {
                  onProcess();
                }
              }}
              style={[styles.input, { color: colors.text }]}
            />
            {/* With words in it the × clears them; empty, it folds the field
                away again — the same toggle "Type instead" opened it with. */}
            {trimmedInput || onToggleTextInput ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={trimmedInput ? 'Clear typed expense' : 'Close typing'}
                onPress={trimmedInput ? onClear : onToggleTextInput}
                disabled={isProcessing}
                hitSlop={4}
                style={styles.iconButton}>
                <MaterialCommunityIcons
                  name={trimmedInput ? 'close-circle' : 'close'}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Parse typed expense"
              onPress={onProcess}
              disabled={!canSubmitText}
              style={[
                styles.sendButton,
                {
                  backgroundColor: canSubmitText ? colors.accent : colors.track,
                  opacity: isProcessing ? 0.7 : 1,
                },
              ]}>
              {isProcessing && trimmedInput ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <MaterialCommunityIcons
                  name="send-outline"
                  size={18}
                  color={canSubmitText ? colors.onAccent : withAlpha(colors.text, 0.45)}
                />
              )}
            </Pressable>
          </View>

          {/* The field takes questions as well as captures, and nothing else on
              the screen says so. A worked example is the only reliable way to
              tell someone that — and tapping it asks it, so the first question
              costs a tap rather than a sentence they have to compose. */}
          {!trimmedInput ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ask ${EXAMPLE_QUESTION}`}
              onPress={() => (onAskPress ? onAskPress() : onChangeText(EXAMPLE_QUESTION))}
              disabled={busy}
              hitSlop={6}
              style={styles.askLine}>
              <ThemedText tone="muted" style={styles.caption}>
                Or ask —{' '}
                <ThemedText
                  style={[
                    styles.caption,
                    styles.askLink,
                    { color: colors.text, textDecorationColor: withAlpha(colors.text, 0.3) },
                  ]}>
                  “{EXAMPLE_QUESTION}”
                </ThemedText>
              </ThemedText>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <PressableView
            accessibilityRole="button"
            onPress={onToggleTextInput}
            disabled={busy}
            style={[styles.footerAction, busy && styles.inactive]}
            pressedStyle={styles.pressed}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.muted} />
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.footerLabel, { color: colors.text }]}>
              Type instead
            </ThemedText>
          </PressableView>
          {onScanBill ? (
            <>
              <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
              <PressableView
                testID="scan-bill-home"
                accessibilityRole="button"
                accessibilityHint="Photograph a bill or pick a photo, and Finnri fills in the entry."
                onPress={onScanBill}
                disabled={busy}
                style={[styles.footerAction, busy && styles.inactive]}
                pressedStyle={styles.pressed}>
                <MaterialCommunityIcons name="camera-outline" size={18} color={colors.muted} />
                <ThemedText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.footerLabel, { color: colors.text }]}>
                  Scan a bill
                </ThemedText>
              </PressableView>
            </>
          ) : null}
          {onAddManually ? (
            <>
              <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
              <PressableView
                testID="add-manually-home"
                accessibilityRole="button"
                onPress={onAddManually}
                disabled={busy}
                style={[styles.footerAction, busy && styles.inactive]}
                pressedStyle={styles.pressed}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.muted} />
                <ThemedText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.footerLabel, { color: colors.text }]}>
                  Add manually
                </ThemedText>
              </PressableView>
            </>
          ) : null}
        </View>
      )}
      {creditNote && !shouldShowTextInput
        ? creditLink(creditNote.text, creditNote.actionLabel, creditNote.onAction)
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Not clipped: on a loud sentence the mic's rings travel past the card's
  // left edge, and cutting them off there reads as a rendering fault.
  card: {
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 16,
  },
  micFrame: {
    width: MIC_FRAME,
    height: MIC_FRAME,
    borderRadius: MIC_FRAME / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHalo: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: MIC_FRAME / 2,
  },
  mic: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  sample: {
    fontWeight: '500',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  // Equal shares, so two or three ways in sit evenly across the card
  // (board R1-Home-Empty-Proposals).
  footerAction: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  footerDivider: {
    width: 1,
    height: 24,
  },
  footerLabel: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  dismiss: {
    alignSelf: 'flex-start',
  },
  blockedAction: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  creditLink: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 22,
    paddingRight: 12,
    borderTopWidth: 1,
  },
  creditLinkText: {
    flex: 1,
    minWidth: 0,
  },
  creditLinkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  creditLinkLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
  },
  typeArea: {
    gap: 8,
    padding: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
  },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 14,
    paddingRight: 6,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 82,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  iconButton: {
    height: 36,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askLine: {
    alignSelf: 'flex-start',
    paddingLeft: 4,
  },
  askLink: {
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  inactive: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.7,
  },
});
