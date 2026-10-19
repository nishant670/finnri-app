import { cssInterop } from 'nativewind';
import { useState } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type PressableViewProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Laid over `style` while a finger is down — an opacity, a scale. */
  pressedStyle?: StyleProp<ViewStyle>;
  className?: string;
};

/**
 * A Pressable whose style is always plain styles, with the pressed look as a
 * second, static style.
 *
 * NativeWind wraps every Pressable and reads its `style` as styles to merge.
 * `style={({ pressed }) => …}` is a function, not a style, so on a device it
 * was dropped — and every rule inside it went with it. The bill-scan sheet
 * lost its rows: icon and chevron stacked, the labels collapsed to nothing,
 * and Cancel slid to the left. Lint now refuses a style callback; this is
 * what to reach for instead.
 */
export function PressableView({
  style,
  pressedStyle,
  onPressIn,
  onPressOut,
  ...rest
}: PressableViewProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={pressed && pressedStyle ? [style, pressedStyle] : style}
    />
  );
}

cssInterop(PressableView, { className: 'style' });
