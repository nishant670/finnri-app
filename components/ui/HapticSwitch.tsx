import { Switch, type SwitchProps } from 'react-native';

import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/lib/haptics';

/**
 * React Native's `Switch`, with the tap it always deserved.
 *
 * There are nine switches in this app across seven files, and wiring each one
 * by hand is nine near-identical edits and nine chances to forget the tenth.
 * `haptic-tab.tsx` set this precedent for the tab bar and it is the right one:
 * the feedback belongs to the *control*, not to each screen that happens to
 * draw one.
 *
 * It fires on the value the switch is moving *to*, which is why `toggle` takes
 * a boolean at all — Android distinguishes `TOGGLE_ON` from `TOGGLE_OFF`, and
 * a switch that feels the same going both ways is a switch you have to look at
 * to know what you did.
 *
 * Deliberately fires before `onValueChange` rather than after: several of these
 * handlers are async and one of them prompts for biometrics, so waiting on the
 * outcome would put the tap anywhere between "immediately" and "after the
 * fingerprint sheet". The switch has already moved; the hand should say so.
 */
export function HapticSwitch({ onValueChange, ...props }: SwitchProps) {
  const { colors } = useThemeTokens();
  return (
    <Switch
      // The redesign's switch: accent when on, the quiet track when off. A
      // caller can still pass its own; most left the platform's teal showing.
      trackColor={{ false: colors.borderStrong, true: colors.accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.borderStrong}
      {...props}
      onValueChange={(next) => {
        haptics.toggle(next);
        onValueChange?.(next);
      }}
    />
  );
}
