import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { ParseFailure } from '@/lib/parse';

/**
 * The one thing on Home that explains a failed capture.
 *
 * What it replaces was a single red sentence — "I could not turn that into a
 * clean transaction" — sitting above a card that still offered to *Process* the
 * recording it had just failed on. It named no cause the user could act on, it
 * showed nothing of what was heard, and the only way forward was to retype the
 * sentence from memory and hope.
 *
 * So this is deliberately not a banner. A failed capture is a small dead end
 * and needs the three things that get someone out of one: what happened, what
 * was heard, and a press that does something. The retry is the primary action
 * because it is usually the answer — most failures here are the model producing
 * an unusable reply to a perfectly clear sentence — and it is withheld entirely
 * when the sentence itself was the problem, since spending another credit to
 * arrive back here is worse than saying so.
 *
 * The examples are tappable and land in the capture field rather than
 * submitting. A person who just had a sentence rejected should get to look at
 * the replacement before it costs them anything.
 */

const CARD_DROP = 10;

type ParseErrorCardProps = {
  failure: ParseFailure;
  onRetry: () => void;
  onDismiss: () => void;
  onUseExample: (text: string) => void;
  onAddManually: () => void;
  isRetrying?: boolean;
  style?: object;
};

export function ParseErrorCard({
  failure,
  onRetry,
  onDismiss,
  onUseExample,
  onAddManually,
  isRetrying = false,
  style,
}: ParseErrorCardProps) {
  const theme = useThemeTokens();
  const motion = useMotion();
  const isDark = theme.mode === 'dark';
  const arrival = useSharedValue(0);

  // Re-runs on a new message: a second failure with different wording is also
  // new, and a silent text swap inside a card already on screen reads as if
  // nothing happened.
  useEffect(() => {
    arrival.value = 0;
    arrival.value = withTiming(1, motion.enter('base'));
  }, [arrival, motion, failure.title, failure.message]);

  const arrivalStyle = useAnimatedStyle(() => ({
    opacity: arrival.value,
    transform: [{ translateY: interpolate(arrival.value, [0, 1], [-CARD_DROP, 0]) }],
  }));

  const dangerText = isDark ? '#FCA5A5' : '#DC2626';
  const dangerSurface = isDark ? 'rgba(127,29,29,0.18)' : '#FEF2F2';
  const dangerBorder = isDark ? 'rgba(153,27,27,0.35)' : '#FBD5D5';
  const mutedText = `${theme.colors.text}99`;

  return (
    <Animated.View
      testID="parse-error-card"
      accessibilityRole="alert"
      style={[
        {
          borderRadius: theme.radius.xxl,
          borderWidth: 1,
          borderColor: dangerBorder,
          backgroundColor: dangerSurface,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        style,
        arrivalStyle,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View
          style={{
            height: 36,
            width: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
          }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={dangerText} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <ThemedText style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>
            {failure.title}
          </ThemedText>
          <ThemedText style={{ fontSize: 13, lineHeight: 18, color: mutedText }}>
            {failure.message}
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={10}
          onPress={onDismiss}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 2 })}>
          <MaterialCommunityIcons name="close" size={18} color={mutedText} />
        </Pressable>
      </View>

      {failure.heard ? (
        <View
          style={{
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
          }}>
          <ThemedText style={{ fontSize: 11, fontWeight: '700', color: mutedText }}>
            WHAT FINNRI HEARD
          </ThemedText>
          <ThemedText
            numberOfLines={3}
            style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: theme.colors.text }}>
            {failure.heard}
          </ThemedText>
        </View>
      ) : null}

      {failure.examples.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
          <ThemedText style={{ fontSize: 11, fontWeight: '700', color: mutedText }}>
            TRY SAYING
          </ThemedText>
          {failure.examples.map((example) => (
            <Pressable
              key={example}
              accessibilityRole="button"
              onPress={() => onUseExample(example)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 10,
                opacity: pressed ? 0.8 : 1,
              })}>
              <MaterialCommunityIcons
                name="format-quote-close"
                size={14}
                color={theme.colors.accent}
              />
              <ThemedText
                numberOfLines={2}
                style={{ flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.text }}>
                {example}
              </ThemedText>
              <MaterialCommunityIcons name="arrow-top-left" size={14} color={mutedText} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {failure.canRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            disabled={isRetrying}
            style={({ pressed }) => ({
              flex: 1,
              opacity: pressed ? 0.9 : isRetrying ? 0.7 : 1,
            })}>
            <View
              style={{
                height: 40,
                borderRadius: 20,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: theme.colors.accent,
              }}>
              {isRetrying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="refresh" size={15} color="#FFFFFF" />
                  <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                    Try again
                  </ThemedText>
                </>
              )}
            </View>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onAddManually}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}>
          <View
            style={{
              height: 40,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
            }}>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={theme.colors.text} />
            <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
              Add manually
            </ThemedText>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}
