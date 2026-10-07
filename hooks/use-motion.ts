import { useMemo, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import type Animated from 'react-native-reanimated';
import {
  Easing,
  FadeInDown,
  LinearTransition,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { EXIT_RATIO, Motion, type MotionDurationToken } from '@/constants/theme';

type MotionStaggerToken = keyof typeof Motion.stagger;

/**
 * The Reanimated-flavoured reader for the `Motion` tokens, and the single place
 * the reduced-motion degrade is applied.
 *
 * `useReducedMotion()` scattered through components is how you end up with half
 * the app honouring the setting: it is one more thing to remember at every call
 * site, and the two components that already had it each spelled the degrade
 * differently. Reading timings through this hook means a component gets the
 * degrade whether or not its author thought about it — with reduced motion on
 * every duration here is 0, so animations resolve to the state change they were
 * decorating, instantly and with their completion callbacks intact.
 *
 * Reanimated's own `reduceMotion` option would handle the Reanimated half, but
 * it is set per animation — the same scattering, one layer down — and it does
 * nothing for the legacy `Animated` sheet that 20 call sites go through, or for
 * a stagger delay, which is a `setTimeout` and not an animation at all. Zeroing
 * the numbers at the source covers all three.
 *
 * ## The setting is read once, at app start
 *
 * `useReducedMotion()` is not a subscription. It captures
 * `isReducedMotionEnabledInSystem()` into a module constant when Reanimated is
 * first imported and returns that same boolean forever — turning the setting on
 * while the app is open changes nothing until the next cold start. That is the
 * library's behaviour and it is documented, but it is easy to miss, and it
 * makes a naive "flip the setting, watch the screen" check meaningless: the app
 * carries on animating and the check appears to fail for the wrong reason.
 * Verifying this path means relaunching with the setting already on.
 */

type TimingConfig = {
  duration: number;
  easing: ReturnType<typeof Easing.bezier>;
};

/**
 * The two declarative props, spelled the way `Animated.View` spells them, so a
 * helper can never drift from what the component will accept. Both include
 * `undefined`, which is how a layout animation is switched off.
 */
type AnimatedViewProps = ComponentProps<typeof Animated.View>;
type EnteringAnimation = AnimatedViewProps['entering'];
type ReflowAnimation = AnimatedViewProps['layout'];

/**
 * How far a row travels on its way in. A distance, not a duration, which is why
 * it is not a `Motion` token — that vocabulary is timing. It is small on
 * purpose: a row sliding a screen-height reads as a screen arriving, and a feed
 * is not arriving, it is filling in.
 */
const ROW_ENTRANCE_TRAVEL = 12;

/** How far a revealed field unfolds. Shorter than a row: it has less to say. */
const REVEAL_TRAVEL = 6;


export type MotionHelpers = {
  /** Whether the OS asked for reduced motion. Exposed for the rare case that
   *  needs a different layout rather than a shorter animation. */
  reduced: boolean;
  /** Entry duration in ms, 0 when reduced. */
  duration: (token: MotionDurationToken) => number;
  /** Exit duration in ms — always shorter than the matching entry, 0 when reduced. */
  exitDuration: (token: MotionDurationToken) => number;
  /** `withTiming` config for anything entering or moving. */
  enter: (token: MotionDurationToken) => TimingConfig;
  /** `withTiming` config for anything leaving. */
  exit: (token: MotionDurationToken) => TimingConfig;
  /**
   * Press feedback — buttons, FAB, mic. Returns the *animation*, not a config,
   * because the reduced-motion degrade for a spring is a different animation
   * rather than different numbers: assign it and the degrade cannot be got
   * wrong at the call site.
   *
   * A worklet, so it can be assigned from the UI runtime as well as from the
   * JS thread. See the note on the implementation.
   */
  springTo: (toValue: number) => number;
  /** Entrance delay in ms for item `index` of a staggered group. */
  stagger: (index: number, token?: MotionStaggerToken) => number;
  /**
   * The entrance for row `index` of a list: up from 12px below, fading in, on
   * the list stagger. Feed it to `Animated.View`'s `entering` prop.
   *
   * Under reduced motion this is `undefined` rather than a zero-length
   * builder — an entering animation is the one case where zeroing the duration
   * is not the whole degrade, because the row is still handed to Reanimated's
   * layout manager to be mounted, and there is nothing to be gained from that
   * when the answer is "do not animate".
   */
  rowEntering: (index: number) => EnteringAnimation;
  /**
   * Position and size changes animate instead of snapping. Put it on anything
   * that moves because something near it appeared, disappeared or resized —
   * a filtered list, a screen whose cards come and go with the period.
   */
  reflow: () => ReflowAnimation;
  /**
   * A field or section the user just asked for — a fold opening, an "add a
   * note" chip turning into the note. It drops in from a few pixels *above*
   * rather than rising like a list row, because it is unfolding out of the
   * control that was tapped, which sits above it.
   */
  revealEntering: () => EnteringAnimation;
};

export function useMotion(): MotionHelpers {
  const reduced = useReducedMotion();

  return useMemo<MotionHelpers>(() => {
    const standard = Easing.bezier(...Motion.ease.standard);
    const exiting = Easing.bezier(...Motion.ease.exit);

    const duration = (token: MotionDurationToken) => (reduced ? 0 : Motion.duration[token]);
    const exitDuration = (token: MotionDurationToken) =>
      reduced ? 0 : Math.round(Motion.duration[token] * EXIT_RATIO);

    const staggerDelay = (index: number, token: MotionStaggerToken = 'list') => {
      if (reduced) return 0;
      const { step, max } = Motion.stagger[token];
      return Math.min(Math.max(index, 0), max - 1) * step;
    };

    return {
      reduced,
      duration,
      exitDuration,
      enter: (token) => ({ duration: duration(token), easing: standard }),
      exit: (token) => ({ duration: exitDuration(token), easing: exiting }),
      // A spring has no duration to zero, so the degrade is a different
      // animation entirely: a 0ms timing, which lands on the same value in the
      // same frame.
      //
      // ## Why this one is a worklet and the others are not
      //
      // Every other helper here produces a *config* that a call site hands to
      // `withTiming` — always from an effect, always on the JS thread. This one
      // produces the animation itself, and the place a spring is most obviously
      // wanted is the release of a gesture, which runs on the UI runtime.
      // Without the directive that assignment throws "Tried to synchronously
      // call a Remote Function" the first time a finger lets go — invisible to
      // `tsc`, invisible to Jest, and findable only on a handset. It cost C5's
      // swipe its entire snap until C8's device pass performed one.
      //
      // The directive costs the JS-thread callers nothing: a worklet is still
      // an ordinary function when called from JS. Everything it closes over —
      // `reduced`, the easing, `Motion.spring.press` — is serialisable, which
      // is the constraint that decides whether a helper *can* be one.
      springTo: (toValue) => {
        'worklet';
        return reduced
          ? withTiming(toValue, { duration: 0, easing: standard })
          : withSpring(toValue, Motion.spring.press);
      },
      stagger: staggerDelay,
      rowEntering: (index) =>
        reduced
          ? undefined
          : FadeInDown.duration(duration('base'))
              .delay(staggerDelay(index))
              .easing(standard)
              // FadeInDown's own offset is 25px, which on a list of 72px rows
              // reads as the row falling into place from a third of a row away.
              .withInitialValues({
                opacity: 0,
                transform: [{ translateY: ROW_ENTRANCE_TRAVEL }],
              }),
      reflow: () =>
        reduced ? undefined : LinearTransition.duration(duration('base')).easing(standard),
      // Not on web: Reanimated's web build plays an entering animation with
      // custom initial values on an absolutely positioned element, so the
      // revealed field stopped taking up space and the next row drew over
      // it. Web is a development target here; the phone is where this runs.
      revealEntering: () =>
        reduced || Platform.OS === 'web'
          ? undefined
          : FadeInDown.duration(duration('base'))
              .easing(standard)
              .withInitialValues({
                opacity: 0,
                transform: [{ translateY: -REVEAL_TRAVEL }],
              }),
    };
  }, [reduced]);
}
