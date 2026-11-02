import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useSegments } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';

import { useMotion } from '@/hooks/use-motion';

/**
 * The active-tab pill, as one pill that travels.
 *
 * There were five of them before — one per tab, transparent until its tab was
 * focused — so switching tabs made one vanish and another appear two hundred
 * pixels away. Nothing connected the two, and the eye had to find the new one
 * rather than follow the old one. It is a single view now, drawn once for the
 * whole bar and moved to whichever tab is focused.
 *
 * ## It rides in `tabBarBackground`, and the tabs post their own coordinates
 *
 * The pill has to be drawn in the tab bar's coordinate space to move across it,
 * and the only public seam into that space is `tabBarBackground` — an absolute
 * fill that React Navigation renders behind the tab items and above the bar's
 * own colour, with pointer events already off. The alternative was replacing
 * the whole `tabBar`, which means importing `BottomTabBar` from inside
 * `expo-router/build`, and reimplementing what the default bar does with
 * labels, insets and accessibility.
 *
 * That leaves the pill unable to see where the tabs are — `tabBarBackground` is
 * a sibling of the tab list, not its parent. So the measurement runs the other
 * way: each tab's icon reports its own frame, the bar reports its own, and the
 * difference between the focused tab's and the bar's is where the pill goes. **Nothing here
 * assumes the tabs are equally wide, or that the icon sits a particular
 * distance down the bar.** Both were tempting to hardcode and both are laid out
 * by React Navigation rather than by us — a guess would have been a number that
 * looked right on one device.
 *
 * A screen with no tab of its own (App Mood, which is `href: null`) simply does
 * not ask for the background, so the pill is absent there rather than left
 * hovering under the tab the user came from.
 *
 * ## Focus comes from the router, not from the icons (X15)
 *
 * The icons used to claim focus themselves — each one called `focusTab` when
 * React Navigation handed it `focused: true`. On the handset that turned out to
 * be two separate lies at once, and the pill sat under **Profile** whatever tab
 * was active, including a cold launch onto Home.
 *
 * Instrumenting a cold start showed every tab claiming focus in turn on mount —
 * five `focusTab` calls, in tree order, so the last one (Profile) won — and then
 * **not a single call on any subsequent tab change**. It also showed ten frames
 * arriving for five tabs, in pairs with identical coordinates: each tab's icon
 * is rendered twice, and only the first of each pair ever reported focus. So
 * the instances that claimed focus were transient, and the ones that persist in
 * the bar never claim at all. The pill was placed once, wrongly, and then had
 * nothing left to move it.
 *
 * The fix is to stop asking the icons. `useSegments()` names the active tab
 * directly and re-renders this provider on every change, which is the signal
 * the icons were being used as a proxy for. An icon now only reports *where it
 * is*, keyed by its route name — the one thing it actually knows first-hand.
 */

/**
 * The marker itself: a 28×3 bar hanging from the tab bar's top edge, rounded
 * only on its lower corners so it reads as attached to that edge (board
 * R3-Home). It used to be an 18×3 pill floating over the icon.
 */
export const MARKER_WIDTH = 28;
const MARKER_HEIGHT = 3;

/** A frame in window coordinates. Only `x`, `y` and `width` are ever used. */
export type Frame = { x: number; y: number; width: number };

/**
 * Where the pill sits inside the bar, given the two measured frames.
 *
 * Both are in window coordinates — the tab reports its own and so does the
 * bar — so the subtraction is what turns them into a position inside the bar.
 * It is pulled out here because it is the whole of the geometry, and the rest
 * of this file is plumbing that a test cannot reach.
 *
 * Only the horizontal half depends on the tab. The marker hangs from the bar's
 * top edge whatever the icon's height, so `y` is always the top of the bar.
 */
export function markerOffset(tab: Frame, bar: Frame) {
  return {
    x: tab.x - bar.x + tab.width / 2 - MARKER_WIDTH / 2,
    y: 0,
  };
}

type TabMarkerStore = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 until both frames have landed, so the pill never flashes at the origin. */
  shown: SharedValue<number>;
  /** Every tab reports, keyed by its route name; the focused one is looked up. */
  reportTab: (name: string, frame: Frame) => void;
  focusTab: (name: string, source?: FocusSource) => void;
  reportBar: (frame: Frame) => void;
};

/**
 * Who is naming the focused tab.
 *
 * `navigator` is the tab navigator's own state — the same value React
 * Navigation hands each icon as `focused`, so a pill drawn from it cannot
 * disagree with the icon it is sitting under. `url` is `useSegments()`, which
 * is a different question with a usually-identical answer: the URL and the
 * navigator's index diverge on a `replace` into the group, on a restored
 * state, and for the whole time a stacked route is on top — and `useSegments()`
 * then names a route the bar has no tab for.
 *
 * The navigator wins whenever it is present. It is not always present: it can
 * only be read from inside the navigator, and the pill is also rendered in
 * tests and could be rendered elsewhere, so the URL stays as the fallback
 * rather than as a second opinion.
 */
export type FocusSource = 'url' | 'navigator';

const TabMarkerContext = createContext<TabMarkerStore | null>(null);

function useTabMarkerStore(): TabMarkerStore {
  const store = useContext(TabMarkerContext);
  if (!store) {
    throw new Error('Tab marker used outside <TabMarkerProvider>. Wrap the tab navigator in one.');
  }
  return store;
}

/**
 * Holds the pill's position. Wraps the tab navigator, because the two halves
 * that report into it — the icons and the bar background — are on different
 * branches of what the navigator renders.
 */
/**
 * The tab the router says is active, as the route name the layout spells.
 *
 * This provider is rendered by `app/(tabs)/_layout.tsx`, so the segments always
 * open with that group and the one after it is the tab. Home is the group's
 * `index`, which contributes no segment of its own — `["(tabs)"]` *is* Home.
 * Taking the segment straight after the group rather than the last one keeps a
 * nested screen inside a tab (`money/…`) attributed to the tab it belongs to.
 */
export function activeTabName(segments: string[]): string {
  const group = segments.indexOf('(tabs)');
  const name = group === -1 ? segments[0] : segments[group + 1];
  return name ?? 'index';
}

export function TabMarkerProvider({ children }: { children: ReactNode }) {
  const motion = useMotion();
  const segments = useSegments() as string[];
  const active = activeTabName(segments);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const shown = useSharedValue(0);

  /**
   * Every tab's frame, by route name — not "the last frame anybody reported".
   *
   * The single-frame version left the pill parked under a tab the user was not
   * on. `measureInWindow` answers asynchronously, so a frame arrives some time
   * after the focus change that asked for it, and any `place()` in between —
   * the bar re-reporting its own layout, a second tab settling — redrew the
   * pill from whatever frame happened to be in the box. Recording focus as a
   * *name* and looking the frame up at draw time makes the wrong tab
   * unrepresentable rather than unlikely.
   *
   * The key is the route name rather than a `useId()`, which is what makes the
   * map bounded by the number of tabs. Under `useId` the same tab reported
   * under a fresh key every time its icon remounted, so the map grew and
   * entries went stale — the handset showed ten of them for five tabs. A name
   * cannot go stale: a remounted icon overwrites its own entry, and there is no
   * eviction to get wrong.
   */
  const tabFrames = useRef(new Map<string, Frame>());
  const focusedTab = useRef<string | null>(null);
  /** True from the first `navigator`-sourced report onward. See `FocusSource`. */
  const hasNavigatorFocus = useRef(false);
  const barFrame = useRef<Frame | null>(null);
  // The first placement is a jump, every one after it is a journey: a pill that
  // slid in from the left edge on launch would be announcing a tab change that
  // never happened.
  const hasPlaced = useRef(false);

  const place = useCallback(() => {
    const tab = focusedTab.current ? tabFrames.current.get(focusedTab.current) : null;
    const bar = barFrame.current;
    if (!tab || !bar) return;

    const next = markerOffset(tab, bar);
    // Constant across tabs, so it is assigned rather than animated — springing
    // a value to itself is a frame of work to move nothing.
    y.value = next.y;
    shown.value = 1;

    if (!hasPlaced.current) {
      hasPlaced.current = true;
      x.value = next.x;
      return;
    }
    // The press spring, the same one the icon uses, so the pill and the icon it
    // is under arrive together — they are one answer to one tap.
    x.value = motion.springTo(next.x);
  }, [motion, shown, x, y]);

  const store = useMemo<TabMarkerStore>(
    () => ({
      x,
      y,
      shown,
      reportTab: (name, frame) => {
        tabFrames.current.set(name, frame);
        // Only the focused tab moves the pill, but all of them are worth
        // storing: the frame is then already known when focus arrives, so the
        // pill leaves on the same frame as the tap instead of after a round
        // trip through the native measurement.
        if (name === focusedTab.current) place();
      },
      focusTab: (name, source = 'url') => {
        // Once the navigator has spoken, the URL is no longer consulted —
        // otherwise the two would take turns and the pill would follow
        // whichever re-rendered last.
        if (source === 'navigator') hasNavigatorFocus.current = true;
        else if (hasNavigatorFocus.current) return;
        if (focusedTab.current === name) return;
        focusedTab.current = name;
        place();
      },
      reportBar: (frame) => {
        barFrame.current = frame;
        place();
      },
    }),
    [place, shown, x, y]
  );

  // The router is the only thing that knows which tab is showing. It re-renders
  // this provider on every change, so one effect covers the cold launch and
  // every switch after it with the same line.
  useEffect(() => {
    store.focusTab(active);
  }, [active, store]);

  return <TabMarkerContext value={store}>{children}</TabMarkerContext>;
}

/**
 * Attaches a tab's icon to the marker: spread the result onto the view the
 * marker should centre over, and pass the tab's route name.
 *
 * Every tab measures itself, focused or not, so the frame is already known when
 * focus arrives and the pill leaves on the same frame as the tap. It reports
 * *only* its frame: which tab is focused is the router's answer, not an icon's
 * (see X15 above). That also makes the double render harmless — React
 * Navigation mounts each icon twice, and both instances now write the same
 * frame to the same key instead of racing under two different ones.
 */
export function useTabMarkerAnchor(name: string) {
  const { reportTab } = useTabMarkerStore();
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, width) => reportTab(name, { x, y, width }));
  }, [name, reportTab]);

  useEffect(measure, [measure]);

  return { ref, onLayout: measure };
}

/**
 * Names the focused tab from the tab navigator's own state.
 *
 * Rendered *inside* `tabBarBackground` and nowhere else, because
 * `useNavigationState` can only be read from within the navigator — which is
 * the whole reason this is a component rather than a hook in the provider. The
 * provider wraps the navigator; only the bar is inside it.
 *
 * `state.routes[state.index]` is the same route React Navigation marks
 * `focused: true` on when it builds each icon, so the pill and the icon it sits
 * under now come from one value. The URL fallback in the provider stays for
 * the renders this component is not part of.
 */
export function TabRouteFocus() {
  const { focusTab } = useTabMarkerStore();
  const active = useNavigationState((state) => state.routes[state.index]?.name);

  useEffect(() => {
    if (active) focusTab(active, 'navigator');
  }, [active, focusTab]);

  return null;
}

/** The pill. Give this to `tabBarBackground`. */
export function TabMarker({ color }: { color: string }) {
  const { x, y, shown, reportBar } = useTabMarkerStore();
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    ref.current?.measureInWindow((left, top, width) => reportBar({ x: left, y: top, width }));
  }, [reportBar]);

  const markerStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <View
      ref={ref}
      onLayout={measure}
      testID="tab-marker"
      style={StyleSheet.absoluteFill}
      pointerEvents="none">
      <Animated.View
        style={[styles.marker, { backgroundColor: color }, markerStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: MARKER_WIDTH,
    height: MARKER_HEIGHT,
    borderBottomLeftRadius: MARKER_HEIGHT,
    borderBottomRightRadius: MARKER_HEIGHT,
  },
});
