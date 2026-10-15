// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Currency and clock formatting live in exactly two modules. These selectors
// catch the three ways screens used to reinvent them and produce `₹2184.13`,
// `₹18000.00` and `15:58` side by side. See docs/FINNRI_UX_FIX_BACKLOG.md S6.
const formatterMessage =
  'Format money with formatMoney/formatMoneyCompact from @/lib/money (or toAmountString for payloads). Raw ₹ interpolation and .toFixed(2) are why the app showed three different number formats.';

const noHandRolledCurrency = [
  {
    // `₹${amount}` and friends.
    selector: 'TemplateLiteral > TemplateElement[value.raw=/₹\\s*$/]',
    message: formatterMessage,
  },
  {
    // JSX text ending in ₹ immediately followed by an interpolated amount.
    selector: 'JSXText[value=/₹\\s*$/] + JSXExpressionContainer',
    message: formatterMessage,
  },
  {
    // Two decimal places is always money in this codebase.
    selector: "CallExpression[callee.property.name='toFixed'][arguments.0.value=2]",
    message: formatterMessage,
  },
];

// Motion timings live in exactly one place. Before `Motion`, the bottom sheet
// entered over 240ms, the save toast over 180ms and the auth push over 400ms,
// and none of those numbers had been chosen against the others. See C1.
const motionMessage =
  'Read timings from the Motion tokens via useMotion() (@/hooks/use-motion), not from a literal. A hand-tuned duration is how the app ended up with 180/210/240/260/400ms all meaning "a moment".';

const easingMessage =
  'Build curves from Motion.ease.standard / Motion.ease.exit rather than Easing presets, so entering and leaving read the same everywhere.';

const noHandTunedMotion = [
  {
    // `{ duration: 240 }` in any animation config.
    selector: "Property[key.name='duration'][value.type='Literal']",
    message: motionMessage,
  },
  {
    // `SlideInRight.duration(400)`, and the rest of the layout-animation
    // builders. Numeric argument only — `motion.duration('sheet')` is the fix,
    // not the offence.
    selector:
      "CallExpression[callee.property.name='duration'][arguments.0.type='Literal'][arguments.0.value=/^[0-9]+$/]",
    message: motionMessage,
  },
  {
    // Navigator options and Reanimated's CSS animation API. Literals only: the
    // ban started out covering the property outright because no correct use of
    // it existed yet, and C6 wrote the first one — the root stack now reads
    // `motion.exitDuration('sheet')`, which is the fix this rule asks for and
    // was being flagged as the offence.
    selector: "Property[key.name='animationDuration'][value.type='Literal']",
    message: motionMessage,
  },
  {
    // Spring feedback belongs to Motion.spring.press.
    selector: "Property[key.name=/^(damping|stiffness)$/][value.type='Literal']",
    message: motionMessage,
  },
  {
    selector: "CallExpression[callee.object.name='Easing'][callee.property.name=/^(in|out|inOut)$/]",
    message: easingMessage,
  },
];

// Haptics go through one module, for the reason C8 found: `impactAsync` and
// friends call Android's raw `Vibrator`, which ignores the system haptic
// setting, while `performAndroidHapticsAsync` goes through
// `View.performHapticFeedback`, which honours it. That choice has to be made
// in one place or the next call site silently buzzes someone who asked for
// silence. See C8.
// Dialogs go through one themed host. `Alert.alert` renders the platform's own
// box — its type, its corner radius, its blue — which is a visible seam at the
// end of a flow that was Finnri's the whole way up to it. The rule exists
// because the convention alone did not hold: the themed dialogs were built,
// agreed on, and then bypassed a dozen times, because wiring one up by hand
// cost more than reaching for the global.
const dialogMessage =
  'Raise dialogs with useAppDialog() from @/components/ui/AppDialogProvider (alert / confirm), not Alert.alert. The system dialog carries none of the app\'s type, colour or corner radius, so a themed flow ends on a stock Android box.';

// A style callback is not a style. NativeWind wraps every Pressable and reads
// `style` as styles to merge, so `style={({ pressed }) => …}` was dropped on a
// device, layout and all: the bill-scan sheet's rows came out as stacked icons
// with no labels. PressableView takes plain styles and a `pressedStyle`.
const noStyleCallback = [
  {
    selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ArrowFunctionExpression",
    message:
      'Pass plain styles, not a function: NativeWind drops a style callback on a device, and every rule in it. Use PressableView from @/components/ui/PressableView with pressedStyle for the pressed look.',
  },
];

const hapticsMessage =
  'Fire haptics through the vocabulary in @/lib/haptics (haptics.select/toggle/saved/rejected/…), not expo-haptics directly. A direct impactAsync goes through Android\'s raw Vibrator and ignores the system haptic setting.';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // `sharedValue.value = x` is the whole of Reanimated's write API, and the
      // React Compiler reads every one of them as mutating something it was
      // promised would not change. Writes inside `useEffect` slip through and
      // writes inside `useCallback` do not, which makes the rule fire on where
      // the assignment happens to sit rather than on anything about it.
      'react-hooks/immutability': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    // lib/money.ts is the module the rule exists to protect; the onboarding
    // screens render a static illustration of a receipt, not a real amount.
    ignores: ['lib/money.ts', 'components/onboarding/*'],
    rules: {
      'no-restricted-syntax': ['error', ...noHandRolledCurrency, ...noStyleCallback],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    // Every entry names why, and most of them name the task that clears it.
    ignores: [
      // The modules the rule exists to protect.
      'constants/theme.ts',
      'hooks/use-motion.ts',
      '__tests__/**',
      // Ambient loops — a breathing gradient and a blinking caret are cadences,
      // not UI responses, and there is deliberately no token for them.
      'components/SplashScreen.tsx',
      'components/onboarding/*',
      // C1 left three files here for the tasks that replace their animations
      // outright rather than retiming them. All three are clear: C2 took
      // VoiceInputCard, C3 took TransactionFormModal, and C6 took the root
      // stack in app/_layout.tsx.
      // Expo template leftover; nothing routes to it.
      'components/hello-wave.tsx',
    ],
    rules: {
      // noStyleCallback rides along here too: for the files this block
      // matches, it replaces the block above's list (see the note below).
      'no-restricted-syntax': ['error', ...noHandTunedMotion, ...noStyleCallback],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // A separate rule name from the `no-restricted-syntax` blocks above on
      // purpose: in flat config a later block replaces an earlier one's entry
      // for the same rule, so folding this in would silently retire whichever
      // list it landed next to.
      'no-restricted-properties': [
        'error',
        { object: 'Alert', property: 'alert', message: dialogMessage },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    // The module the rule exists to protect, and the mock that stands in for
    // the library under test.
    ignores: ['lib/haptics.ts', 'jest.setup.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'expo-haptics', message: hapticsMessage }] },
      ],
    },
  },
]);
