import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';

import { useMotion } from '@/hooks/use-motion';

/** Room left above or below a section once it has been brought into view. */
const REVEAL_MARGIN = 12;

/**
 * How long a tap keeps waiting for its section to appear. A tap can ask for a
 * section that turns out not to apply (the EMI card on a form that has none),
 * and without a limit the next unrelated layout would scroll the sheet.
 */
const EXPECT_WINDOW_MS = 1500;

type RevealOptions = {
  /**
   * `top` brings the start of the section to the top of the scroll area, for a
   * section the user is about to fill in. `end` only scrolls if the section's
   * last line is cut off, for a row added to something already on screen.
   */
  align?: 'top' | 'end';
};

type RevealTarget = {
  ref: (node: View | null) => void;
  onLayout: () => void;
  collapsable: false;
};

export type ScrollReveal = {
  /** The tapped section is about to open: scroll to it once it has grown. */
  expect: (key: string, options?: RevealOptions) => void;
  /** The section is already on the page: scroll to it now. */
  now: (key: string, options?: RevealOptions) => void;
  /** Spread onto the `View` that wraps a section. */
  target: (key: string) => RevealTarget;
};

type ScrollRevealController = ScrollReveal & {
  attach: (node: ScrollView | null) => void;
  noteOffset: (y: number) => void;
};

const ScrollRevealContext = createContext<ScrollRevealController | null>(null);

/** The surrounding scroll area, for a section that opens itself. */
export const useScrollReveal = (): ScrollReveal | null => useContext(ScrollRevealContext);

/**
 * Owns the reveal behaviour for a {@link RevealScrollView}. Only needed by a
 * form that scrolls from outside the scroll view, such as on a refused save.
 *
 * `bottomInset` is how much of the scroll area a keyboard is covering.
 */
export function useScrollRevealController({ bottomInset = 0 }: { bottomInset?: number } = {}) {
  const motion = useMotion();
  const liveRef = useRef({ bottomInset, animated: !motion.reduced });
  liveRef.current = { bottomInset, animated: !motion.reduced };

  const scrollRef = useRef<ScrollView | null>(null);
  const offsetRef = useRef(0);
  const nodesRef = useRef(new Map<string, View>());
  const targetsRef = useRef(new Map<string, RevealTarget>());
  const pendingRef = useRef<{ key: string; options?: RevealOptions; until: number } | null>(null);

  return useMemo<ScrollRevealController>(() => {
    const now = (key: string, options?: RevealOptions) => {
      const scroll = scrollRef.current;
      const host = scroll?.getNativeScrollRef?.();
      const node = nodesRef.current.get(key);
      if (!scroll || !host || !node) return;
      requestAnimationFrame(() => {
        host.measureInWindow((_hostX, hostTop, _hostWidth, hostHeight) => {
          node.measureInWindow((_nodeX, nodeTop, _nodeWidth, nodeHeight) => {
            const { animated, bottomInset: inset } = liveRef.current;
            if (options?.align === 'end') {
              const visibleBottom = hostTop + hostHeight - inset;
              const cutOff = nodeTop + nodeHeight - visibleBottom + REVEAL_MARGIN;
              if (cutOff > 0) scroll.scrollTo({ y: offsetRef.current + cutOff, animated });
              return;
            }
            const y = Math.max(0, offsetRef.current + nodeTop - hostTop - REVEAL_MARGIN);
            scroll.scrollTo({ y, animated });
          });
        });
      });
    };

    const consume = (key: string) => {
      const pending = pendingRef.current;
      if (!pending || pending.key !== key) return;
      pendingRef.current = null;
      if (Date.now() <= pending.until) now(key, pending.options);
    };

    return {
      now,
      expect: (key, options) => {
        pendingRef.current = { key, options, until: Date.now() + EXPECT_WINDOW_MS };
      },
      target: (key) => {
        let target = targetsRef.current.get(key);
        if (!target) {
          // Kept per key: a new callback each render would detach and
          // re-attach the ref on every keystroke.
          target = {
            collapsable: false,
            onLayout: () => consume(key),
            ref: (node) => {
              if (node) nodesRef.current.set(key, node);
              else nodesRef.current.delete(key);
            },
          };
          targetsRef.current.set(key, target);
        }
        return target;
      },
      attach: (node) => {
        scrollRef.current = node;
      },
      noteOffset: (y) => {
        offsetRef.current = y;
      },
    };
  }, []);
}

type RevealScrollViewProps = ScrollViewProps & {
  ref?: Ref<ScrollView>;
  /** Pass one from {@link useScrollRevealController} to scroll from outside. */
  reveal?: ReturnType<typeof useScrollRevealController>;
};

/**
 * A ScrollView that takes the user to whatever just opened inside it.
 *
 * Forms here sit in sheets with a keypad or keyboard under them, so a section
 * that opens at the bottom of the form appears off screen and looks as though
 * the tap did nothing. A `FormDisclosure` inside one of these scrolls to itself
 * on opening; anything else wraps its section in `reveal.target(key)`.
 */
export function RevealScrollView({ ref, reveal, onScroll, ...props }: RevealScrollViewProps) {
  const own = useScrollRevealController();
  const controller = reveal ?? own;

  const setRef = useCallback(
    (node: ScrollView | null) => {
      controller.attach(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as { current: ScrollView | null }).current = node;
    },
    [controller, ref]
  );

  return (
    <ScrollRevealContext.Provider value={controller}>
      <ScrollView
        scrollEventThrottle={32}
        {...props}
        ref={setRef}
        onScroll={(event) => {
          controller.noteOffset(event.nativeEvent.contentOffset.y);
          onScroll?.(event);
        }}
      />
    </ScrollRevealContext.Provider>
  );
}
