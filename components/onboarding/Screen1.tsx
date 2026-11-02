import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

import { IllustrationPanel, SlideText, useBubbleFill } from './onboarding-ui';

/**
 * Only English and Hindi. The slide used to rotate five languages under "any
 * language", and nothing verifies that parsing beyond these two works well
 * enough to promise it. Each phrase is shown with the other as its "or" line.
 */
const SAMPLE_PROMPTS = ['लंच पर UPI से ₹250 खर्च', 'Spent ₹250 on lunch via UPI'];

const ROTATE_MS = 2600;

/** R13-Ob1: say it the way you'd say it. */
export default function Screen1() {
  const { colors } = useThemeTokens();
  const bubble = useBubbleFill();
  const motion = useMotion();
  const [promptIndex, setPromptIndex] = useState(0);
  const opacity = useSharedValue(1);
  const fadeMs = motion.duration('base');

  useEffect(() => {
    let swap: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      opacity.value = withTiming(0, { duration: fadeMs });
      swap = setTimeout(() => {
        setPromptIndex((current) => (current + 1) % SAMPLE_PROMPTS.length);
        opacity.value = withTiming(1, { duration: fadeMs });
      }, fadeMs);
    }, ROTATE_MS);
    return () => {
      clearInterval(interval);
      if (swap) clearTimeout(swap);
    };
  }, [fadeMs, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const spoken = SAMPLE_PROMPTS[promptIndex];
  const other = SAMPLE_PROMPTS[(promptIndex + 1) % SAMPLE_PROMPTS.length];

  return (
    <View style={styles.slide}>
      <IllustrationPanel testID="onboarding-panel">
        <View style={styles.stack}>
          <View style={[styles.ring, { backgroundColor: bubble }]}>
            <View style={[styles.mic, { backgroundColor: colors.accent }]}>
              <MaterialCommunityIcons name="microphone-outline" size={34} color={colors.onAccent} />
            </View>
          </View>
          <Animated.View style={[styles.phrases, fade]}>
            <View style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="waveform" size={18} color={colors.accent} />
              <ThemedText style={styles.chipText}>{spoken}</ThemedText>
            </View>
            <ThemedText tone="muted" style={styles.or}>
              {`or “${other}”`}
            </ThemedText>
          </Animated.View>
        </View>
      </IllustrationPanel>
      <SlideText
        title="Say it the way you’d say it"
        body="Speak or type what you spent, in English, Hindi or a mix of both. Finnri turns it into an entry."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
  },
  stack: {
    alignItems: 'center',
    gap: 22,
  },
  ring: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phrases: {
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 22,
  },
  chipText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  or: {
    fontSize: 13,
    lineHeight: 18,
  },
});
