import * as matchers from '@testing-library/react-native/matchers';

expect.extend(matchers);

// The library's own mocks for its native module. Needed since the add sheet
// wraps its window in GestureHandlerRootView, which installs that module.
require('react-native-gesture-handler/jestSetup');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => {
  return {
    MaterialCommunityIcons: () => null,
  };
});

// Reanimated pulls in react-native-worklets, which reaches for a native module
// the moment it is imported and throws under Jest. The library's own `mock`
// entry re-exports the real index, so it fails the same way.
//
// This stands in for the parts the app actually uses. It is deliberately a
// *working* fake rather than a set of no-ops: shared values are real objects,
// `useAnimatedStyle` runs its worklet and returns the style, and the animation
// builders resolve to their target value immediately. That means a component
// under test renders in its settled state, which is the state assertions are
// written against — and a typo in a style worklet still throws.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const RN = require('react-native');

  /** Animations land on their target value in the same tick. */
  const settle = (toValue: unknown) => toValue;

  const interpolate = (
    value: number,
    inputRange: number[],
    outputRange: number[],
    extrapolate?: string
  ) => {
    const last = inputRange.length - 1;
    if (value <= inputRange[0]) {
      return extrapolate === 'clamp' ? outputRange[0] : outputRange[0];
    }
    if (value >= inputRange[last]) return outputRange[last];
    for (let i = 1; i <= last; i += 1) {
      if (value <= inputRange[i]) {
        const span = inputRange[i] - inputRange[i - 1];
        const ratio = span === 0 ? 0 : (value - inputRange[i - 1]) / span;
        return outputRange[i - 1] + ratio * (outputRange[i] - outputRange[i - 1]);
      }
    }
    return outputRange[last];
  };

  // The RN components stand in directly rather than through a wrapper. Building
  // one here would mean `React.createElement` inside a `jest.mock` factory,
  // which nativewind's babel transform rewrites into a reference the factory is
  // not allowed to reach. They already take style arrays and refs, and nothing
  // passes Reanimated-only props that would need stripping.
  const Animated = {
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    Image: RN.Image,
    createAnimatedComponent: (Component: unknown) => Component,
  };

  /** A chainable stand-in for `FadeInDown`, `LinearTransition` and friends. */
  const makeLayoutBuilder = (presetName: string) => {
    const build = (config: Record<string, unknown>) => ({
      presetName,
      ...config,
      duration: (durationV: number) => build({ ...config, durationV }),
      delay: (delayV: number) => build({ ...config, delayV }),
      easing: (easingV: unknown) => build({ ...config, easingV }),
      withInitialValues: (initialValues: unknown) => build({ ...config, initialValues }),
    });
    return build({});
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useReducedMotion: () => false,
    useSharedValue: (initial: unknown) => React.useRef({ value: initial }).current,
    useAnimatedStyle: (worklet: () => unknown) => worklet(),
    useAnimatedRef: () => React.useRef(null),
    useAnimatedScrollHandler: () => jest.fn(),
    useAnimatedReaction: () => undefined,
    useDerivedValue: (worklet: () => unknown) => ({ value: worklet() }),
    cancelAnimation: () => undefined,
    runOnJS: (fn: unknown) => fn,
    // Gesture Handler builds its detectors on these two rather than on the
    // public hooks. They are here so `GestureDetector` renders for real under
    // test — the pan itself cannot be performed, but a component that fails to
    // mount inside one still fails.
    useEvent: () => jest.fn(),
    useHandler: () => ({ context: {}, doDependenciesDiffer: false, useWeb: false }),
    useComposedEventHandler: () => jest.fn(),
    setGestureState: () => undefined,
    interpolate,
    withTiming: settle,
    withSpring: settle,
    withDelay: (_delay: number, animation: unknown) => animation,
    withSequence: (...animations: unknown[]) => animations[animations.length - 1],
    withRepeat: (animation: unknown) => animation,
    // Layout animations are builders rather than animations: components pass
    // them to `entering`/`layout` and Reanimated's own layout manager runs
    // them, which is native and not present here. The chain has to keep
    // returning itself so `useMotion` can build one, and the modifiers record
    // what they were given so a test can assert the entrance is staggered.
    FadeInDown: makeLayoutBuilder('FadeInDown'),
    LinearTransition: makeLayoutBuilder('LinearTransition'),
    // The screen-push builders. Onboarding and the auth flow both drive their
    // slide transitions from these, and without them here neither screen could
    // be rendered under test at all — which is why the Skip button went three
    // builds without one.
    SlideInLeft: makeLayoutBuilder('SlideInLeft'),
    SlideInRight: makeLayoutBuilder('SlideInRight'),
    SlideOutLeft: makeLayoutBuilder('SlideOutLeft'),
    SlideOutRight: makeLayoutBuilder('SlideOutRight'),
    // Easings are shapes, and nothing here is timed, so the modifiers hand back
    // whatever they were given. `out`/`in` were missing entirely, which is what
    // stopped the onboarding slides from rendering under test.
    Easing: {
      bezier: (...curve: number[]) => ({ curve }),
      linear: (t: number) => t,
      quad: (t: number) => t * t,
      cubic: (t: number) => t * t * t,
      ease: (t: number) => t,
      in: (easing: unknown) => easing,
      out: (easing: unknown) => easing,
      inOut: (easing: unknown) => easing,
    },
  };
});

// The app always renders inside a `SafeAreaProvider` — Expo Router mounts one
// and the root layout seeds a nested one with `initialWindowMetrics`. A test
// that renders a screen on its own has neither, and `useSafeAreaInsets` throws
// rather than degrading, so every screen under `OnboardingScreenWrapper` would
// fail for want of a provider it will never actually be missing.
//
// Fixed non-zero insets rather than zeroes: a screen that only lays out
// correctly when the insets happen to be 0 is the bug this mock exists to let
// us keep testing around.
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 24, right: 0, bottom: 16, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

// Haptics are a real assertion target now — "did the app answer on the hand"
// is part of what C2 and C3 promise — so these are spies rather than no-ops.
//
// `performAndroidHapticsAsync` is the one C8 routes Android through, and it
// *resolves* here by default. The real one rejects for a constant the running
// API level does not have, which is the whole reason `lib/haptics.ts` carries
// fallback chains — a test that wants that path makes this spy reject.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  performAndroidHapticsAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  // Mirrors the real enum's string values, so a wrong constant name in
  // `lib/haptics.ts` shows up as a wrong string rather than as `undefined`.
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Gesture_Start: 'gesture-start',
    Gesture_End: 'gesture-end',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
    Clock_Tick: 'clock-tick',
    Context_Click: 'context-click',
    Drag_Start: 'drag-start',
    Keyboard_Tap: 'keyboard-tap',
    Keyboard_Press: 'keyboard-press',
    Keyboard_Release: 'keyboard-release',
    Long_Press: 'long-press',
    Virtual_Key: 'virtual-key',
    No_Haptics: 'no-haptics',
    Segment_Tick: 'segment-tick',
    Segment_Frequent_Tick: 'segment-frequent-tick',
    Text_Handle_Move: 'text-handle-move',
    Virtual_Key_Release: 'virtual-key-release',
  },
}));

// `File` from expo-file-system is a native SharedObject — constructing one
// under Jest reaches for a module that is not there. This fake is the surface
// the upload paths actually touch: the uri, the `name`/`type` that become the
// multipart part header, the `size` that decides whether an image is worth
// re-encoding, and `bytes()`, which is what Expo's fetch reads a part from.
//
// Sizes are dictated per-uri by the test through `__setFileSize`, because
// "is this 3.5 MB or 40 KB" is the entire input to the compression decision.
jest.mock('expo-file-system', () => {
  const sizes = new Map<string, number>();
  const deleted: string[] = [];
  const mimeByExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    pdf: 'application/pdf',
  };

  class File {
    uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }

    get name(): string {
      return this.uri.split('?')[0].split('/').pop() ?? '';
    }

    get type(): string {
      const extension = this.name.split('.').pop()?.toLowerCase() ?? '';
      return mimeByExtension[extension] ?? '';
    }

    get size(): number {
      return sizes.get(this.uri) ?? 0;
    }

    get exists(): boolean {
      return !deleted.includes(this.uri);
    }

    async bytes(): Promise<Uint8Array> {
      return new Uint8Array(this.size);
    }

    delete(): void {
      deleted.push(this.uri);
    }
  }

  return {
    File,
    __setFileSize: (uri: string, size: number) => sizes.set(uri, size),
    __deletedFiles: deleted,
    __resetFiles: () => {
      sizes.clear();
      deleted.length = 0;
    },
  };
});

// The image manipulator is native too. Deliberately plain functions rather than
// `jest.fn()`s: suites that call `jest.resetAllMocks()` in `afterEach` would
// otherwise strip the implementations out from under the next test. What a test
// needs to assert on is recorded in `__manipulatorState` instead.
jest.mock('expo-image-manipulator', () => {
  const state = {
    /** Dimensions the source image decodes to. */
    source: { width: 4000, height: 3000 },
    /** What `saveAsync` writes to the cache directory. */
    output: { uri: 'file:///cache/manipulated.jpg', width: 1600, height: 1200 },
    /** Every `resize` scheduled, in order. */
    resizes: [] as { width?: number | null; height?: number | null }[],
    /** Options the render was saved with. */
    saveOptions: null as { compress?: number; format?: string } | null,
    /** Set to make the next `manipulate` throw, as an unreadable image does. */
    failNext: false,
  };

  const makeImage = (dimensions: { width: number; height: number }) => ({
    ...dimensions,
    saveAsync: async (options: { compress?: number; format?: string }) => {
      state.saveOptions = options;
      return { ...state.output };
    },
  });

  const makeContext = (dimensions: { width: number; height: number }) => {
    const context = {
      resize(size: { width?: number | null; height?: number | null }) {
        state.resizes.push(size);
        return context;
      },
      async renderAsync() {
        return makeImage(dimensions);
      },
    };
    return context;
  };

  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate(source: string | { width: number; height: number }) {
        if (state.failNext) {
          state.failNext = false;
          throw new Error('cannot decode image');
        }
        return makeContext(
          typeof source === 'string'
            ? state.source
            : { width: source.width, height: source.height }
        );
      },
    },
    __manipulatorState: state,
    __resetManipulator: () => {
      state.source = { width: 4000, height: 3000 };
      state.output = { uri: 'file:///cache/manipulated.jpg', width: 1600, height: 1200 };
      state.resizes = [];
      state.saveOptions = null;
      state.failNext = false;
    },
  };
});

jest.mock('@react-native-community/datetimepicker', () => {
  return {
    __esModule: true,
    default: () => null,
    DateTimePickerAndroid: {
      open: jest.fn(),
    },
  };
});

/**
 * React Native's `View` mock hands every instance a `measureInWindow` that
 * accepts a callback and never calls it.
 *
 * That is fine for a component that only decorates itself with a measurement,
 * and fatal for one that *waits* on it: C9's row press measures its icon and
 * amount before navigating, so a callback that never fires is a row that never
 * opens — and the symptom in a test is a five-second timeout rather than an
 * assertion, which says nothing about what broke.
 *
 * This is a default, not a fixture. It answers with a frame at the origin so
 * anything measuring gets *an* answer; the tests that care what the answer is
 * (C6's tab marker, C9's travel arithmetic) spy over it with their own table.
 */
beforeEach(() => {
  const { View } = require('react-native');
  // Installed unconditionally. React Native's own mock already makes this a
  // `jest.fn()` — one that accepts the callback and drops it — so checking
  // whether it *is* a mock says yes and skips the fix. The test files that need
  // real frames spy again in their own `beforeEach`, which runs after this one.
  jest
    .spyOn(View.prototype, 'measureInWindow')
    .mockImplementation((...args: unknown[]) => {
      const callback = args[0] as (x: number, y: number, w: number, h: number) => void;
      callback(0, 0, 1, 1);
    });
});
