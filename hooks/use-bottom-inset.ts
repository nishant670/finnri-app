import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom padding that keeps the last thing on a screen or sheet clear of the
 * Android system navigation bar. `base` is the room the design wants above it.
 *
 * Android draws every window edge to edge, modals included, so the bar sits on
 * top of whatever reaches the bottom of the screen. A gesture bar is a thin
 * strip that a fixed 16–20dp of padding happened to clear; the three-button bar
 * is about 48dp, and it covered half of Save and "Continue to payment" for
 * testers on OnePlus, Samsung and Xiaomi phones. Any screen that leaves out the
 * `bottom` safe-area edge, and any sheet, pads its end with this instead of a
 * fixed number.
 *
 * Keep it while the keyboard is up too. React Native reports the keyboard's
 * height *minus* the system bars (`ReactRootView.checkForKeyboardEvents`), so
 * a sheet lifted by `useKeyboardInset()` still has its last nav-bar's worth
 * behind the keyboard, and this padding is what sits there.
 */
export function useBottomInset(base = 0) {
  return base + useSafeAreaInsets().bottom;
}
