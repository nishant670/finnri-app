import { useMotion } from '@/hooks/use-motion';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    SlideInLeft,
    SlideInRight,
    SlideOutLeft,
    SlideOutRight
} from 'react-native-reanimated';

import { OnboardingScreenWrapper } from '@/components/onboarding/OnboardingScreenWrapper';
import { ThemedText } from '@/components/themed-text';
import { PressableView } from '@/components/ui/PressableView';
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
  const { colors } = useThemeTokens();
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

  const isLast = activeIndex === SCREENS.length - 1;

  return (
    <OnboardingScreenWrapper>
      <View style={styles.container}>
        {/* Progress and Skip, at the top as R13 draws them.

            Skip spent four builds dead in this row because the animated slide
            below reached up over it — an invisible overlap that only ever
            showed as a button that would not respond. The slide now has its
            own clipped box (`screenContainer`, `overflow: 'hidden'`) and draws
            nothing outside it, and this row sits above it by `zIndex` as a
            second guard. */}
        <View style={styles.header}>
          <View
            style={styles.progress}
            testID="onboarding-progress"
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${activeIndex + 1} of ${SCREENS.length}`}>
            {SCREENS.map((screen, index) => (
              <View
                key={screen.id}
                style={[
                  styles.progressBar,
                  index === activeIndex
                    ? { width: 24, backgroundColor: colors.text }
                    : { width: 12, backgroundColor: colors.borderStrong },
                ]}
              />
            ))}
          </View>
          {/* Not on the last slide: Get started already does what Skip does. */}
          {!isLast ? (
            <PressableView
              testID="onboarding-skip"
              accessibilityRole="button"
              onPress={handleFinish}
              hitSlop={8}
              style={styles.skip}
              pressedStyle={styles.pressed}>
              <ThemedText style={styles.skipLabel}>Skip</ThemedText>
            </PressableView>
          ) : null}
        </View>

        <View testID="onboarding-slide" style={styles.screenContainer}>
          <Animated.View
            key={activeIndex}
            entering={enteringAnimation}
            exiting={exitingAnimation}
            style={styles.slide}>
            <CurrentScreen />
          </Animated.View>
        </View>

        <View style={styles.footer}>
          {activeIndex > 0 ? (
            <PressableView
              accessibilityRole="button"
              onPress={handleBack}
              hitSlop={8}
              style={styles.back}
              pressedStyle={styles.pressed}>
              <ThemedText style={styles.backLabel}>Back</ThemedText>
            </PressableView>
          ) : (
            <View />
          )}
          <PressableView
            testID="onboarding-next"
            accessibilityRole="button"
            onPress={handleNext}
            style={[styles.next, { backgroundColor: colors.accent }]}
            pressedStyle={styles.pressed}>
            <ThemedText style={[styles.nextLabel, { color: colors.onAccent }]}>
              {isLast ? 'Get started' : 'Next'}
            </ThemedText>
            <MaterialCommunityIcons name="arrow-right" size={20} color={colors.onAccent} />
          </PressableView>
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
    zIndex: 1,
    height: 48,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 8,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  skip: {
    height: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  skipLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  screenContainer: {
    flex: 1,
    overflow: 'hidden',
    paddingTop: 8,
  },
  slide: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  back: {
    height: 48,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  backLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  next: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 26,
    paddingRight: 22,
    borderRadius: 26,
  },
  nextLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
