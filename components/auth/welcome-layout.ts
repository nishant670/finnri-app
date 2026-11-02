/**
 * How big the Welcome illustration is allowed to be, given the screen it is on.
 *
 * Welcome used to be a fixed 900dp of content inside a `ScrollView`, which is
 * taller than the usable height of most handsets — so on a real phone the only
 * thing above the fold was the guest button, and Google and the email/mobile
 * link were below it with nothing to suggest they were there. A sign-in screen
 * that hides half its sign-in options is not a scrolling problem, so nothing
 * here makes the scrolling nicer: the layout is sized to fit instead.
 *
 * The illustration is the part that gives, because it is the only part that
 * carries no information. Everything else on the screen — the wordmark, the two
 * lines of copy, the three actions and the two notes under them — has a height
 * it needs, and what is left over after that is what the artwork gets.
 */

/**
 * The illustration panel's height as R13-Welcome draws it, and the most it is
 * ever shown at. It is a height now, not a side: the panel spans the screen's
 * width and only its height gives.
 */
export const HERO_BASE_SIZE = 210;

/**
 * Below this the artwork reads as a smudge rather than an illustration, so it
 * is dropped entirely and its space returned to the layout. The alternative —
 * letting it shrink to nothing — spends the last of a small screen's height on
 * something the user cannot make out.
 */
const HERO_MIN_SIZE = 120;

/**
 * Everything on Welcome that is not the illustration, summed at the spacing
 * `AuthScreen1` lays out with.
 *
 * Spelled out per block rather than as one number so that changing a margin
 * there and forgetting this stays a visible mismatch instead of a screen that
 * quietly starts scrolling again.
 */
const CHROME_HEIGHT =
  20 + // top padding
  40 + // wordmark row
  24 + // gap between the wordmark and the illustration
  96 + // title (two lines) and the gap above it
  52 + // subtitle (two lines) and the gap above it
  24 + // the least room left between the copy and the actions
  223 + // Start for free, its note, Google, the bank note and the terms line
  24; // bottom padding

/**
 * The illustration's height for a screen with `available` dp of usable
 * height — that is, the window less the status bar and whatever the system
 * takes at the bottom. `0` means there is no room for it and it should not be
 * drawn at all.
 */
export function welcomeHeroSize(available: number): number {
  const leftover = available - CHROME_HEIGHT;
  if (leftover < HERO_MIN_SIZE) return 0;
  return Math.min(HERO_BASE_SIZE, leftover);
}
