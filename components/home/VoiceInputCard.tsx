import { ThemedText } from '@/components/themed-text';
import { TextAction } from '@/components/ui/theme-primitives';
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
}: VoiceInputCardProps) {
  const theme = useThemeTokens();
  const colors = theme.colors;
  const isDark = theme.mode === 'dark';
  const trimmedInput = inputText.trim();
  const canSubmitText = trimmedInput.length > 0 && !isRecording && !isProcessing;
  const shouldShowTextInput = isTextInputVisible || trimmedInput.length > 0;
  const textInputRef = useRef<TextInput>(null);
  const motion = useMotion();
  const level = useAudioLevel(recorder, isRecording);
  const clock = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const textEntryAnim = useSharedValue(shouldShowTextInput ? 1 : 0);
  const micSizeAnim = useSharedValue(shouldShowTextInput ? 0 : 1);
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
    micSizeAnim.value = withTiming(shouldShowTextInput ? 0 : 1, motion.enter('base'));

    if (shouldShowTextInput) {
      const focusTimeout = setTimeout(() => textInputRef.current?.focus(), 160);
      return () => clearTimeout(focusTimeout);
    }

    return undefined;
  }, [micSizeAnim, motion, shouldShowTextInput, textEntryAnim]);

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

  const micFrameStyle = useAnimatedStyle(() => ({
    height: interpolate(micSizeAnim.value, [0, 1], [78, 124]),
    width: interpolate(micSizeAnim.value, [0, 1], [78, 124]),
    borderRadius: interpolate(micSizeAnim.value, [0, 1], [39, 62]),
  }));

  const micSurfaceStyle = useAnimatedStyle(() => ({
    borderWidth: interpolate(micSizeAnim.value, [0, 1], [6, 9]),
  }));

  const micIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(micSizeAnim.value, [0, 1], [0.8, 1.16]) }],
  }));

  const promptStyle = useAnimatedStyle(() => ({ opacity: promptFade.value }));

  const textEntryStyle = useAnimatedStyle(() => ({
    opacity: textEntryAnim.value,
    transform: [{ translateY: interpolate(textEntryAnim.value, [0, 1], [-8, 0]) }],
  }));
  const cardGap = shouldShowTextInput || isRecording ? theme.spacing.md : theme.spacing.lg;

  // Success State UI
  if (hasRecording && !isRecording) {
    return (
      <View
        style={{
          marginHorizontal: 24,
          borderRadius: theme.radius.xxl,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.xxl,
          paddingBottom: theme.spacing.xl,
          minHeight: 282,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xl,
          backgroundColor: isDark ? colors.card : colors.secondary,
        }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
          <View
            style={{
              height: 64,
              width: 64,
              borderRadius: 32,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <MaterialCommunityIcons
              name={hasFailed ? 'microphone-message' : 'waveform'}
              size={30}
              color={hasFailed ? (isDark ? '#FCA5A5' : '#DC2626') : colors.accent}
            />
          </View>
          <ThemedText variant="cardTitle" style={{ color: colors.text }}>
            {hasFailed ? 'Recording kept' : 'Recording ready'}
          </ThemedText>
        </View>

        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: theme.spacing.sm,
            rowGap: theme.spacing.sm,
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <Pressable
            onPress={onProcess}
            disabled={isProcessing}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 132,
              minWidth: 0,
              opacity: pressed ? 0.9 : isProcessing ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}>
            <View
              style={{
                height: 38,
                width: '100%',
                borderRadius: 19,
                paddingHorizontal: 6,
                backgroundColor: colors.accent,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}>
              {isProcessing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name={hasFailed ? 'refresh' : 'flash'}
                    size={14}
                    color="#FFFFFF"
                  />
                  <ThemedText
                    numberOfLines={1}
                    style={{
                      color: '#FFFFFF',
                      fontSize: 12,
                      lineHeight: 14,
                      fontFamily: theme.typography.button.fontFamily,
                      fontWeight: theme.typography.button.fontWeight,
                    }}>
                    {hasFailed ? 'Try again' : 'Use this'}
                  </ThemedText>
                </>
              )}
            </View>
          </Pressable>

          <Pressable
            onPress={onClear}
            disabled={isProcessing}
            style={({ pressed }) => ({
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 132,
              minWidth: 0,
              opacity: pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}>
            <View
              style={{
                height: 38,
                width: '100%',
                borderRadius: 19,
                paddingHorizontal: 6,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}>
              <MaterialCommunityIcons
                name="close"
                size={14}
                color={isDark ? 'rgba(255,255,255,0.72)' : '#5E6C84'}
              />
              <ThemedText
                numberOfLines={1}
                style={{
                  color: isDark ? 'rgba(255,255,255,0.72)' : '#5E6C84',
                  fontSize: 12,
                  lineHeight: 14,
                  fontFamily: theme.typography.button.fontFamily,
                  fontWeight: theme.typography.button.fontWeight,
                }}>
                Cancel
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  // Initial / Recording State UI
  return (
    <View
      style={{
        marginHorizontal: 24,
        borderRadius: theme.radius.xxl,
        paddingHorizontal: theme.spacing.xxl,
        paddingTop: theme.spacing.xxl,
        paddingBottom: theme.spacing.xl,
        minHeight: 286,
        alignItems: 'center',
        gap: cardGap,
        backgroundColor: isDark ? colors.card : colors.secondary,
      }}>
      <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
        <ThemedText
          numberOfLines={1}
          variant="cardTitle"
          style={{
            textAlign: 'center',
            color: colors.text,
          }}>
          Tap and speak
        </ThemedText>
        <Animated.Text
          style={[
            {
              color: isDark ? 'rgba(255,255,255,0.58)' : 'rgba(45,45,45,0.56)',
              ...theme.typography.caption,
            },
            promptStyle,
          ]}>
          {samplePrompts[promptIndex]}
        </Animated.Text>
      </View>

      {/* Mic Button */}
      <Animated.View
        style={[
          {
            alignItems: 'center',
            justifyContent: 'center',
          },
          micFrameStyle,
          buttonScaleStyle,
          theme.shadows.accent,
        ]}>
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
          style={{
            height: '100%',
            width: '100%',
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Animated.View
            style={[
              {
                alignSelf: 'stretch',
                flex: 1,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
              },
              micSurfaceStyle,
            ]}>
            <Animated.View style={micIconStyle}>
              <MaterialCommunityIcons
                name={isRecording ? 'stop' : 'microphone'}
                size={38}
                color="#FFFFFF"
              />
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {isRecording ? (
        <ThemedText
          variant="micro"
          style={{
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            color: colors.accent,
          }}>
          Listening…
        </ThemedText>
      ) : null}

      <TextAction
        label="Type instead"
        onPress={onToggleTextInput}
        disabled={isProcessing || isRecording}
        style={styles.writeToggle}
      />

      {shouldShowTextInput ? (
        <Animated.View style={[{ width: '100%' }, textEntryStyle]}>
          <View
            style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'flex-end',
              backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : '#FFFFFF',
              borderRadius: theme.radius.lg,
              paddingLeft: 14,
              paddingRight: 8,
              paddingVertical: 7,
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 1,
            }}>
            <MaterialCommunityIcons
              name="pencil"
              size={18}
              color={trimmedInput ? colors.accent : '#A0A0A0'}
              style={styles.inputIcon}
            />
            <TextInput
              ref={textInputRef}
              placeholder="spent 250 on food via UPI"
              placeholderTextColor="#A0A0A0"
              value={inputText}
              onChangeText={onChangeText}
              editable={!isProcessing && !isRecording}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => {
                if (canSubmitText) {
                  onProcess();
                }
              }}
              style={{
                flex: 1,
                minHeight: 38,
                maxHeight: 82,
                fontSize: 14,
                fontFamily: theme.typography.body.fontFamily,
                color: colors.text,
                paddingTop: 9,
                paddingBottom: 9,
              }}
            />
            {trimmedInput ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear typed expense"
                onPress={onClear}
                disabled={isProcessing}
                style={styles.iconButton}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#A0A0A0" />
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
                  backgroundColor: canSubmitText ? colors.accent : '#E5E7EB',
                  opacity: isProcessing ? 0.7 : 1,
                },
              ]}>
              {isProcessing && trimmedInput ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <MaterialCommunityIcons
                  name="send"
                  size={17}
                  color={canSubmitText ? '#FFFFFF' : '#A0A0A0'}
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
              disabled={isProcessing || isRecording}
              hitSlop={6}
              style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <ThemedText variant="caption" style={{ color: `${colors.text}99` }}>
                Or ask — <ThemedText variant="caption" style={{ color: colors.accent }}>
                  “{EXAMPLE_QUESTION}”
                </ThemedText>
              </ThemedText>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pulseRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
  },
  writeToggle: {
    minHeight: 24,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  inputIcon: {
    marginRight: 9,
    marginBottom: 10,
  },
  iconButton: {
    height: 38,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    height: 38,
    width: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
