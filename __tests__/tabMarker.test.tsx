import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';

import {
  MARKER_WIDTH,
  TabMarker,
  TabMarkerProvider,
  TabRouteFocus,
  activeTabName,
  markerOffset,
  useTabMarkerAnchor,
  type Frame,
} from '@/components/tab-marker';

/**
 * The router names the active tab; the icons only say where they are.
 *
 * That split is the whole of X15, so the test drives it the same way the app
 * does — by moving the segments, never by telling an icon it is focused.
 */
let mockSegments: string[] = ['(tabs)'];
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));

/**
 * The tab navigator's own state, as `useNavigationState` would report it.
 *
 * `undefined` stands for "no navigator in this tree" — every test that renders
 * `TabMarker` on its own is in that position, and the URL has to keep working
 * there.
 */
let mockNavigatorTab: string | undefined;
jest.mock('expo-router/react-navigation', () => ({
  useNavigationState: (selector: (state: any) => unknown) =>
    selector({ index: 0, routes: [{ name: mockNavigatorTab }] }),
}));

/**
 * A five-tab bar, 400 wide, sitting 700 down the window with its icon stacks 12
 * further down — the shape the real thing has, in the units the two halves
 * actually report in.
 */
const bar: Frame = { x: 0, y: 700, width: 400 };
const tabAt = (index: number): Frame => ({ x: index * 80, y: 712, width: 80 });

describe('marker geometry', () => {
  it('centres the pill on the tab', () => {
    // Third of five: centre at 200, so a 28-wide marker starts at 186.
    expect(markerOffset(tabAt(2), bar).x).toBe(200 - MARKER_WIDTH / 2);
  });

  it('hangs from the top edge of the bar, not from the icon', () => {
    // Both frames are measured in window coordinates, and a bar 700px down the
    // screen would otherwise put the pill 700px below the bar it lives in. The
    // icon sits 12 down, but the marker is drawn on the bar's own edge.
    expect(markerOffset(tabAt(0), bar).y).toBe(0);
  });

  it('follows tabs that are not all the same width', () => {
    // Nothing here computes a position from "bar width over tab count" — React
    // Navigation lays the items out and each one says where it landed, so a
    // wide label or a hidden tab cannot put the pill off-centre.
    const wide: Frame = { x: 100, y: 712, width: 140 };

    expect(markerOffset(wide, bar).x).toBe(170 - MARKER_WIDTH / 2);
  });

});

describe('activeTabName', () => {
  it('reads Home out of the bare group', () => {
    // Home is the group's `index`, so it contributes no segment of its own.
    // `["(tabs)"]` *is* Home, and a naive "last segment" would call it `(tabs)`.
    expect(activeTabName(['(tabs)'])).toBe('index');
  });

  it('takes the segment straight after the group', () => {
    expect(activeTabName(['(tabs)', 'money'])).toBe('money');
    expect(activeTabName(['(tabs)', 'profile'])).toBe('profile');
  });

  it('attributes a screen nested inside a tab to that tab', () => {
    // Taking the *last* segment would name the pill after a child route the
    // bar has no icon for, and the pill would stop moving.
    expect(activeTabName(['(tabs)', 'money', 'accounts', '4'])).toBe('money');
  });
});

/**
 * Frames by `testID`.
 *
 * React Native's Jest mock gives every `View` a `measureInWindow` that accepts
 * a callback and never calls it, which is the one method this whole component
 * is built on — so it is replaced with one that answers from this table. The
 * marker asks the platform where things are precisely so that it does not have
 * to assume, and a test that cannot answer would be testing nothing.
 */
const frames: Record<string, Frame> = { 'tab-marker': bar };

beforeEach(() => {
  mockSegments = ['(tabs)'];
  mockNavigatorTab = undefined;
  jest
    .spyOn(View.prototype, 'measureInWindow')
    .mockImplementation(function (this: { props?: { testID?: string } }, callback) {
      const frame = frames[this.props?.testID ?? ''];
      if (frame) callback(frame.x, frame.y, frame.width, 32);
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * A tab whose icon stack measures to `frame`.
 *
 * `id` is the view's testID and `route` is the name it reports under. They are
 * separate because React Navigation mounts each icon *twice* — two views, one
 * route — which is the shape the double-render test needs.
 */
function FakeTab({ id, route, frame }: { id: string; route: string; frame: Frame }) {
  frames[id] = frame;
  const anchor = useTabMarkerAnchor(route);

  return <View ref={anchor.ref} onLayout={anchor.onLayout} testID={id} />;
}

/**
 * Every tree here is built by a factory rather than held in a variable.
 *
 * Re-rendering the *same* element object is a bailout: React compares by
 * reference, skips the subtree, and the assertion reads a stale style while the
 * component under test is working perfectly.
 */
type Tree = () => React.ReactElement;

/**
 * Mounts the bar, then lays it out the way the platform would.
 *
 * `onLayout` does not fire under `react-test-renderer`, and it is the event the
 * bar half of the measurement hangs off, so the test has to send it.
 */
const mount = async (tree: Tree) => {
  const screen = await render(tree());
  await act(async () => {
    fireEvent(screen.getByTestId('tab-marker'), 'layout');
  });
  return screen;
};

/**
 * The rendered pill, as a flat style object.
 *
 * The Reanimated fake evaluates `useAnimatedStyle` during render and returns a
 * plain object, so a shared value written *after* a render — which is what every
 * measurement callback does — only reaches the tree on the render after that.
 * Hence two: the first commits the new props and runs the effect that measures,
 * the second reads the value it wrote. Real Reanimated updates the view without
 * either, so both are artefacts of the fake rather than something the component
 * needs.
 */
const pillAfterRender = async (
  screen: { rerender: (ui: React.ReactElement) => void; toJSON: () => any },
  tree: Tree
) => {
  await act(async () => {
    screen.rerender(tree());
  });
  await act(async () => {
    screen.rerender(tree());
  });

  const find = (node: any): Record<string, any> | null => {
    if (!node) return null;
    const layers = ([] as any[]).concat(node.props?.style ?? []);
    if (layers.some((layer) => layer?.width === MARKER_WIDTH)) {
      return layers.reduce((merged, layer) => ({ ...merged, ...layer }), {});
    }
    for (const child of node.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };

  const style = find(screen.toJSON());
  if (!style) throw new Error('no pill in the tree');
  return {
    x: style.transform[0].translateX,
    y: style.transform[1].translateY,
    opacity: style.opacity,
  };
};

/** The whole bar, in route order, as the layout spells it. */
const wholeBar: Tree = () => (
  <TabMarkerProvider>
    <FakeTab id="tab-insight" route="insight" frame={tabAt(0)} />
    <FakeTab id="tab-money" route="money" frame={tabAt(1)} />
    <FakeTab id="tab-index" route="index" frame={tabAt(2)} />
    <FakeTab id="tab-split" route="split" frame={tabAt(3)} />
    <FakeTab id="tab-profile" route="profile" frame={tabAt(4)} />
    <TabMarker color="#EF7C5B" />
  </TabMarkerProvider>
);

describe('the travelling pill', () => {
  it('stays invisible until both halves have reported', async () => {
    // The bar knows where it is and nothing else. A pill drawn now would sit at
    // the bar's own origin — the top-left corner, under no tab at all.
    const tree: Tree = () => (
      <TabMarkerProvider>
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).opacity).toBe(0);
  });

  it('lands on the tab the router names, once both have', async () => {
    mockSegments = ['(tabs)', 'index'];
    const tree: Tree = () => (
      <TabMarkerProvider>
        <FakeTab id="tab-index" route="index" frame={tabAt(2)} />
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );
    const screen = await mount(tree);

    expect(await pillAfterRender(screen, tree)).toEqual({
      x: 200 - MARKER_WIDTH / 2,
      y: 0,
      opacity: 1,
    });
  });

  it('ignores the tabs that are not active', async () => {
    // Two of the three icons measure to somewhere the pill must never go.
    mockSegments = ['(tabs)', 'split'];
    const tree: Tree = () => (
      <TabMarkerProvider>
        <FakeTab id="tab-insight" route="insight" frame={tabAt(0)} />
        <FakeTab id="tab-split" route="split" frame={tabAt(3)} />
        <FakeTab id="tab-profile" route="profile" frame={tabAt(4)} />
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).x).toBe(280 - MARKER_WIDTH / 2);
  });

  it('does not let the last icon to mount claim the pill', async () => {
    // X15, and the reason focus moved to the router. Every icon used to call
    // `focusTab` when React Navigation handed it `focused: true`, and on a cold
    // launch all five did, in tree order — so the pill landed under **Profile**,
    // the last of them, whatever screen was actually showing. Home is the
    // active route here and Profile is still the last thing mounted.
    mockSegments = ['(tabs)'];
    const screen = await mount(wholeBar);

    expect((await pillAfterRender(screen, wholeBar)).x).toBe(200 - MARKER_WIDTH / 2);
  });

  it('survives an icon being mounted twice under one route', async () => {
    // React Navigation renders each tab's icon twice — the handset reported ten
    // frames for five tabs, in pairs with identical coordinates. Keyed by route
    // name the pair is one entry written twice rather than two entries racing,
    // and there is no per-instance eviction to delete a frame still in use.
    mockSegments = ['(tabs)', 'money'];
    const tree: Tree = () => (
      <TabMarkerProvider>
        <FakeTab id="tab-money-a" route="money" frame={tabAt(1)} />
        <FakeTab id="tab-money-b" route="money" frame={tabAt(1)} />
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).x).toBe(120 - MARKER_WIDTH / 2);

    // One of the pair goes away; the frame it shared must not go with it.
    const survivor: Tree = () => (
      <TabMarkerProvider>
        <FakeTab id="tab-money-b" route="money" frame={tabAt(1)} />
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );
    expect((await pillAfterRender(screen, survivor)).x).toBe(120 - MARKER_WIDTH / 2);
  });

  it('stays on the active tab when another one measures late', async () => {
    // The bug this guards: `measureInWindow` answers asynchronously, so a tab
    // the user has already left can report its frame *after* the tab they
    // moved to. When the pill was drawn from "the last frame reported", that
    // late answer parked it under Profile while Home was the screen on show.
    let answer: (() => void) | null = null;
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(function (this: { props?: { testID?: string } }, callback) {
        const id = this.props?.testID ?? '';
        const frame = frames[id];
        if (!frame) return;
        const reply = () => callback(frame.x, frame.y, frame.width, 32);
        // Everything answers at once except the tab being left behind, which
        // is held until after focus has moved.
        if (id === 'tab-profile') answer = reply;
        else reply();
      });

    const tree: Tree = () => (
      <TabMarkerProvider>
        <FakeTab id="tab-index" route="index" frame={tabAt(2)} />
        <FakeTab id="tab-profile" route="profile" frame={tabAt(4)} />
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );

    mockSegments = ['(tabs)', 'profile'];
    const screen = await mount(tree);

    mockSegments = ['(tabs)', 'index'];
    await pillAfterRender(screen, tree);
    await act(async () => {
      answer?.();
    });

    expect((await pillAfterRender(screen, tree)).x).toBe(200 - MARKER_WIDTH / 2);
  });

  it('moves when the route does, without waiting for a new layout', async () => {
    // Switching tabs relays out nothing — the icons are exactly where they
    // were. The pill has to move off the route change alone. On the handset it
    // did not move at all: no icon reported a focus change after mount, so the
    // pill sat where the cold launch had left it for the whole session.
    mockSegments = ['(tabs)', 'insight'];
    const screen = await mount(wholeBar);

    expect((await pillAfterRender(screen, wholeBar)).x).toBe(40 - MARKER_WIDTH / 2);

    mockSegments = ['(tabs)', 'profile'];
    expect((await pillAfterRender(screen, wholeBar)).x).toBe(360 - MARKER_WIDTH / 2);

    mockSegments = ['(tabs)'];
    expect((await pillAfterRender(screen, wholeBar)).x).toBe(200 - MARKER_WIDTH / 2);
  });
});

/**
 * The pill answers to the navigator when there is one, and to the URL when
 * there is not.
 *
 * These are two different questions with a usually-identical answer, which is
 * why the divergence is worth a test rather than an assumption. `useSegments()`
 * describes the URL; the icons are drawn from the navigator's own index. The
 * two come apart on a `replace` into the group, on a restored state, and for
 * as long as a stacked route sits on top of the tabs — and when they do, a pill
 * drawn from the URL sits under a tab whose icon is not the lit one.
 */
describe('where focus comes from', () => {
  const barWith = (navigatorTab: string | undefined): Tree => {
    mockNavigatorTab = navigatorTab;
    return function NavigatorBar() {
      return (
        <TabMarkerProvider>
          <TabRouteFocus />
          <FakeTab id="tab-index" route="index" frame={tabAt(2)} />
          <FakeTab id="tab-split" route="split" frame={tabAt(3)} />
          <TabMarker color="#EF7C5B" />
        </TabMarkerProvider>
      );
    };
  };

  it('follows the navigator, not the URL, when the two disagree', async () => {
    // The shape of the reported bug: the bar was drawing Splits while Home was
    // the screen on show. Whatever puts the URL and the navigator out of step,
    // the pill has to end up under the tab whose icon React Navigation lit.
    mockSegments = ['(tabs)', 'split'];
    const tree = barWith('index');
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).x).toBe(200 - MARKER_WIDTH / 2);
  });

  it('does not let the URL take the pill back afterwards', async () => {
    // Both sources re-report on every render. Without a precedence they would
    // take turns and the pill would follow whichever fired last.
    mockSegments = ['(tabs)', 'index'];
    const tree = barWith('split');
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).x).toBe(280 - MARKER_WIDTH / 2);

    mockSegments = ['(tabs)', 'index'];
    expect((await pillAfterRender(screen, tree)).x).toBe(280 - MARKER_WIDTH / 2);
  });

  it('still moves when the navigator does', async () => {
    mockSegments = ['(tabs)'];
    let tree = barWith('index');
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).x).toBe(200 - MARKER_WIDTH / 2);

    tree = barWith('split');
    expect((await pillAfterRender(screen, tree)).x).toBe(280 - MARKER_WIDTH / 2);
  });

  it('falls back to the URL where there is no navigator to ask', async () => {
    // `TabMarker` is rendered outside the navigator here — in a test, and
    // anywhere else the bar is not the host. The URL is the only answer
    // available, and it has to keep being taken.
    mockSegments = ['(tabs)', 'split'];
    const tree: Tree = () => (
      <TabMarkerProvider>
        <FakeTab id="tab-index" route="index" frame={tabAt(2)} />
        <FakeTab id="tab-split" route="split" frame={tabAt(3)} />
        <TabMarker color="#EF7C5B" />
      </TabMarkerProvider>
    );
    const screen = await mount(tree);

    expect((await pillAfterRender(screen, tree)).x).toBe(280 - MARKER_WIDTH / 2);
  });
});
