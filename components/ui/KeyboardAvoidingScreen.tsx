import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentProps,
} from 'react';
import {
  ScrollView,
  TextInput,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { RevealScrollView } from '@/components/ui/RevealScrollView';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';

type KeyboardAvoidingScreenProps = ScrollViewProps & {
  /** Passed through for a form that also scrolls to sections it opens. */
  reveal?: ComponentProps<typeof RevealScrollView>['reveal'];
  /**
   * Clearance between the focused field and the keyboard.
   *
   * Generous on purpose. `measureInWindow` reports the bare `TextInput`, but
   * these fields sit inside padded, rounded containers, so clearing only the
   * input leaves its own container clipped by the keyboard — which reads as
   * "still broken" even though the scroll fired.
   */
  keyboardGap?: number;
};

/**
 * A ScrollView that keeps the focused field above the software keyboard.
 *
 * Two halves, and the first alone is not enough. Padding the content by the
 * keyboard height makes a covered field *reachable*; it does not move it, so
 * the user still lands on a field they cannot see and has to scroll by hand —
 * which is what shipping only the padding actually produced on the account
 * setup screen. The second half measures the focused input and scrolls it up.
 *
 * Android edge-to-edge is why none of this is free: `adjustResize` no longer
 * shrinks the window, so the ScrollView never learns the keyboard exists.
 * `automaticallyAdjustKeyboardInsets` is iOS-only. Measuring it ourselves is
 * the one approach that behaves the same on both platforms — the same
 * conclusion `AnimatedBottomSheet` reached for sheets.
 */
export const KeyboardAvoidingScreen = forwardRef<ScrollView, KeyboardAvoidingScreenProps>(
  function KeyboardAvoidingScreen(
    {
      children,
      contentContainerStyle,
      keyboardGap = 88,
      keyboardShouldPersistTaps,
      onScroll,
      onTouchEnd,
      ...props
    },
    ref
  ) {
    const keyboardInset = useKeyboardInset();
    const { height: windowHeight } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const offsetRef = useRef(0);
    useImperativeHandle(ref, () => scrollRef.current as ScrollView, []);

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
      onScroll?.(event);
    };

    const revealFocusedInput = useCallback(() => {
      if (keyboardInset <= 0) return;
      const focused = TextInput.State.currentlyFocusedInput?.();
      // `measureInWindow` is absent on a detached node — a field unmounted
      // between the keyboard event and this callback.
      if (!focused?.measureInWindow) return;
      focused.measureInWindow((_x: number, y: number, _width: number, height: number) => {
        const keyboardTop = windowHeight - keyboardInset;
        const overlap = y + height + keyboardGap - keyboardTop;
        if (overlap <= 0) return;
        scrollRef.current?.scrollTo({ y: offsetRef.current + overlap, animated: true });
      });
    }, [keyboardGap, keyboardInset, windowHeight]);

    // The keyboard opening is the common case. The measurement has to wait for
    // it to finish animating, or it reads the pre-keyboard layout.
    useEffect(() => {
      if (keyboardInset <= 0) return;
      // Long enough for the keyboard animation *and* the reflow caused by this
      // component's own padding change; measuring before either lands short.
      const timer = setTimeout(revealFocusedInput, 140);
      return () => clearTimeout(timer);
    }, [keyboardInset, revealFocusedInput]);

    return (
      <RevealScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
        automaticallyAdjustKeyboardInsets={false}
        scrollEventThrottle={16}
        {...props}
        onScroll={handleScroll}
        // Moving between fields while the keyboard stays up fires no keyboard
        // event on Android, so the tap that moved focus is the only signal.
        onTouchEnd={(event) => {
          onTouchEnd?.(event);
          setTimeout(revealFocusedInput, 120);
        }}
        contentContainerStyle={[
          contentContainerStyle,
          keyboardInset > 0 ? { paddingBottom: keyboardInset + keyboardGap } : null,
        ]}>
        {children}
      </RevealScrollView>
    );
  }
);
