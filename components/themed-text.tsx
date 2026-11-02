import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import {
  Fonts,
  Typography,
  derivedLineHeight,
  type TypographyVariant,
} from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
  variant?: TypographyVariant;
  /**
   * Which rank of ink this text is, named rather than coloured.
   *
   * This is how colour reaches a `ThemedText` at all — a colour `className`
   * cannot, for the reason in the note on {@link ThemedText} — and it is the
   * whole vocabulary:
   *
   * - `default` — primary ink.
   * - `muted` — the caption band: eyebrows, hints, the line under a title.
   * - `mutedStrong` — secondary, but still read as prose.
   * - `onAccent` — a label *on* the accent fill: the mood's on-accent ink
   *   (dark on Finnri and Mint, white on Sky and Plum), the same in both modes
   *   because the surface under it is the accent in both.
   * - `positive` / `negative` / `warning` — outcome, error, caution.
   *
   * Each is a token, so it follows the mood and the mode; a literal colour
   * still goes through `style` or `lightColor`/`darkColor`.
   */
  tone?: ThemedTextTone;
};

export type ThemedTextTone =
  | 'default'
  | 'muted'
  | 'mutedStrong'
  | 'onAccent'
  | 'positive'
  | 'negative'
  | 'warning';

/** `default` is the theme's plain ink; every other tone names its own token. */
const toneColorNames = {
  default: 'text',
  muted: 'muted',
  mutedStrong: 'mutedStrong',
  onAccent: 'onAccent',
  positive: 'positive',
  negative: 'negative',
  warning: 'warning',
} as const;

/**
 * The line height an override needs, or `undefined` if the preset's will do.
 *
 * A preset here carries a `fontSize` *and* a `lineHeight`, but a caller's
 * override almost never carries both: `text-[30px]` compiles to `fontSize`
 * alone (Tailwind pairs a line height with its *named* sizes only, so
 * `text-lg` is safe and `text-[18px]` is not), and an inline
 * `style={{ fontSize: 18 }}` is the same trap spelled out. The preset's line
 * height then survives the override and boxes a larger glyph than it was
 * measured for, which clips — see `LineHeightRatio`.
 *
 * It only ever *grows* the box. Most overrides in the app are smaller than the
 * preset — `text-[10px]` and `text-[11px]` are 134 of the 148 — and those sit
 * in a roomy line box rather than a clipping one, so returning a derived
 * height for them would re-space a third of the app's text to fix nothing.
 * The rule is `max(preset, derived)`, expressed as "speak only when short".
 */
export function resolveLineHeight(
  preset: TextStyle | undefined,
  override: StyleProp<TextStyle>
): number | undefined {
  const presetLineHeight = preset?.lineHeight;
  // A preset without a line height leaves the platform to measure the line,
  // which it does against the font actually in use. Nothing to outgrow.
  if (typeof presetLineHeight !== 'number') return undefined;

  const flat = StyleSheet.flatten(override) as TextStyle | undefined;
  // An explicit line height is an answer, not an omission. Deliberately checked
  // before the font size: `style={{ lineHeight }}` with no size is a caller
  // re-spacing the preset, and that must survive too.
  if (typeof flat?.lineHeight === 'number') return undefined;
  if (typeof flat?.fontSize !== 'number') return undefined;

  const derived = derivedLineHeight(flat.fontSize);
  return derived > presetLineHeight ? derived : undefined;
}

/**
 * ## A colour className on this component does nothing
 *
 * `ThemedText` always passes a `color` in its `style` array, and NativeWind
 * ranks the `style` prop *above* `className` — inline rules sort after class
 * rules in `specificityCompare`, so the last colour applied is always this
 * one. A `text-white` class on this component therefore renders the theme's
 * ink, not white: near-black in light mode and near-white in dark, which is
 * how a badge on the orange accent came to be black on the light theme and
 * white on the dark one while the icon beside it — a plain `color` prop —
 * stayed white in both.
 *
 * Colour is set through props, not classes: {@link ThemedTextProps.tone} names
 * the rank of ink, `lightColor`/`darkColor` override a one-off, and
 * `style={{ color }}` takes a literal. `className` is still the right place for
 * everything that is not colour.
 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  variant,
  tone = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, toneColorNames[tone]);
  const accent = useThemeColor({}, 'tint');
  const preset: TextStyle = variant ? Typography[variant] : styles[type];
  const lineHeight = resolveLineHeight(preset, style);

  return (
    <Text
      style={[
        { color },
        preset,
        !variant && type === 'link' ? { color: accent } : undefined,
        style,
        // Last, so it wins over the preset — and only ever present when the
        // caller left the question open.
        lineHeight === undefined ? undefined : { lineHeight },
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.body,
  },
  defaultSemiBold: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    fontFamily: Fonts.title,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    // 30 until X14: the one preset that was itself clipping, at a ratio of
    // 1.07. `Typography.amountHero` is the house pair for this size.
    lineHeight: 34,
    fontFamily: Fonts.title,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.title,
  },
  link: {
    lineHeight: 22,
    fontSize: 14,
    fontFamily: Fonts.body,
  },
});
