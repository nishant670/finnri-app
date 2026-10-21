import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMotion } from '@/hooks/use-motion';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    SlideInLeft,
    SlideInRight,
    SlideOutLeft,
    SlideOutRight
} from 'react-native-reanimated';

import { OnboardingScreenWrapper } from '@/components/onboarding/OnboardingScreenWrapper';
import Screen1 from '@/components/onboarding/Screen1';
import Screen2 from '@/components/onboarding/Screen2';
import Screen3 from '@/components/onboarding/Screen3';
import Screen4 from '@/components/onboarding/Screen4';
import { hasCompletedOnboarding, markOnboardingComplete } from '@/lib/onboarding';

/**
 * Four slides, one capability each: say it, Finnri reads it, split it, Finnri
 * watches it.
 *
 * Four, not five. The fifth was a "You're all set to take control!" celebration
 * for an account that did not exist yet and a user who had logged nothing — and
 * the signup flow then celebrated a second time on the screen after it. The one
 * celebration left is the one that follows an actual event.
 *
 * Staying at four through a feature refresh meant spending the slots rather
 * than adding to them. Reviewing a parsed entry had a slide of its own saying
 * what the slide before it had already said, so it became one line on that
 * slide's card, and splitting — the thing people open the app for with someone
 * else standing next to them — took the slot it left.
 */
const SCREENS = [
  { id: 1, component: Screen1 },
  { id: 2, component: Screen2 },
  { id: 3, component: Screen3 },
  { id: 4, component: Screen4 },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);

  const CurrentScreen = SCREENS[activeIndex].component;

  useEffect(() => {
    let isMounted = true;

    const guardCompletedOnboarding = async () => {
      if (await hasCompletedOnboarding()) {
        router.replace('/auth');
        return;
      }

      if (isMounted) {
        setIsCheckingOnboarding(false);
      }
    };

    guardCompletedOnboarding();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleNext = () => {
    if (activeIndex < SCREENS.length - 1) {
      setDirection('forward');
      setTimeout(() => setActiveIndex(activeIndex + 1), 0);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (activeIndex > 0) {
      setDirection('back');
      setTimeout(() => setActiveIndex(activeIndex - 1), 0);
    }
  };

  const handleFinish = async () => {
    // The flag is a convenience, not a gate. If the write fails the user has
    // still asked to leave, and an unhandled rejection here would strand them
    // on the screen whose only exit they just pressed — the same dead button,
    // arrived at from the other side. Worst case onboarding shows once more.
    try {
      await markOnboardingComplete();
    } catch {
      // Deliberately swallowed; see above.
    }
    router.replace('/auth');
  };

  const motion = useMotion();

  // A screen push, on the `sheet` token. These used to run 400ms flat in both
  // directions and honoured nothing — the outgoing screen is already gone as
  // far as the user is concerned, and reduced motion could not switch them off.
  const enterMs = motion.duration('sheet');
  const exitMs = motion.exitDuration('sheet');
  const enteringAnimation =
    direction === 'forward' ? SlideInRight.duration(enterMs) : SlideInLeft.duration(enterMs);
  const exitingAnimation =
    direction === 'forward' ? SlideOutLeft.duration(exitMs) : SlideOutRight.duration(exitMs);

  if (isCheckingOnboarding) {
    return null;
  }

  return (
    <OnboardingScreenWrapper>
      <View style={styles.container}>
        {/* Progress Bar. Decorative only, and above the slide by `zIndex`
            because the slide reaches up into this row.

            That reach is what four builds of a dead Skip button were actually
            about. It was read as the dots covering Skip, and the three fixes
            aimed at the dots — absolute positioning, `zIndex: -1`,
            `pointerEvents="none"` — all missed, because the thing on top was
            the animated slide below: giving `screenContainer` a background
            tints this whole row, and swapping `Animated.View` for a plain
            `View` brings the button back to life. The slide has no background
            of its own, so the overlap was invisible and only ever showed up as
            a control that would not respond. Skip now lives in the footer,
            which the slide does not reach, and this keeps the dots out from
            under it too. */}
        <View style={styles.header} pointerEvents="none">
            <View style={styles.progressContainer} testID="onboarding-progress">
                {SCREENS.map((_, index) => (
                    <View 
                        key={index} 
                        style={[
                            styles.progressDot, 
                            { 
                                backgroundColor: index === activeIndex ? theme.accent : theme.border,
                                width: index === activeIndex ? 20 : 6
                            }
                        ]} 
                    />
                ))}
            </View>
        </View>

        {/* Content Area */}
        <Animated.View 
            key={activeIndex} 
            entering={enteringAnimation} 
            exiting={exitingAnimation}
            style={styles.screenContainer}
        >
            <CurrentScreen />
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
            <View style={styles.navRow}>
                {activeIndex > 0 ? (
                    <Pressable onPress={handleBack} style={styles.backButton} accessibilityRole="button" hitSlop={12}>
                        <Text style={[styles.footerBtnText, { color: theme.text, opacity: 0.6 }]}>Back</Text>
                    </Pressable>
                ) : <View style={styles.footerBtnPlaceholder} />}

                <Pressable
                    onPress={handleNext}
                    accessibilityRole="button"
                    style={[
                        styles.primaryButton,
                        { backgroundColor: activeIndex === SCREENS.length - 1 ? theme.accent : theme.text }
                    ]}
                >
                    <Text style={[styles.primaryButtonText, { color: activeIndex === SCREENS.length - 1 ? theme.onAccent : theme.background }]}>
                        {activeIndex === SCREENS.length - 1 ? 'Get started' : 'Next'}
                    </Text>
                    <MaterialCommunityIcons
                        name="arrow-right"
                        size={18}
                        color={activeIndex === SCREENS.length - 1 ? theme.onAccent : theme.background}
                        style={{ marginLeft: 8 }}
                    />
                </Pressable>
            </View>

            {/* Skip lives here, on its own row under the nav, because this is
                the part of the screen whose buttons demonstrably work: the same
                `handleFinish` reached through "Get started" has always taken
                people to Welcome. Down here it is also thumb-reachable on a
                tall phone, which top-left never was.

                Hidden on the last slide: "Get started" already runs
                `handleFinish`, and two controls doing the same thing a finger's
                width apart is a worse offer than one. */}
            {activeIndex < SCREENS.length - 1 ? (
                <Pressable
                    onPress={handleFinish}
                    style={styles.skipButton}
                    accessibilityRole="button"
                    hitSlop={12}>
                    <Text style={[styles.skipText, { color: theme.text, opacity: 0.5 }]}>Skip</Text>
                </Pressable>
            ) : (
                // Holding the row keeps "Get started" where "Next" was standing
                // a moment ago, rather than dropping it 48px on the last slide.
                <View style={styles.skipButton} />
            )}
        </View>

      </View>
    </OnboardingScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
      // Above the animated slide, which overlaps this row from below.
      zIndex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 10,
  },
  // 48 tall and full-width across the footer: a target you cannot miss with a
  // thumb, where the old one was 60x33 in the corner hardest to reach.
  skipButton: {
      alignSelf: 'stretch',
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
  },
  skipText: {
      fontSize: 14,
      fontWeight: '600',
  },
  progressContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      justifyContent: 'center',
  },
  progressDot: {
      height: 4,
      borderRadius: 2,
  },
  screenContainer: {
      flex: 1,
  },
  footer: {
      paddingHorizontal: 24,
      paddingBottom: 24,
  },
  navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
  },
  footerBtnPlaceholder: {
      width: 60,
  },
  backButton: {
      minHeight: 48,
      width: 60,
      justifyContent: 'center',
  },
  footerBtnText: {
      fontSize: 16,
      fontWeight: '600',
  },
  primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 30,
      paddingVertical: 16,
      borderRadius: 30,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 4,
  },
  primaryButtonText: {
      fontSize: 16,
      fontWeight: 'bold',
  },
});
