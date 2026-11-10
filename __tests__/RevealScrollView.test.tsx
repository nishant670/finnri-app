import { act, fireEvent, render } from '@testing-library/react-native';
import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FormDisclosure } from '@/components/ui/FormDisclosure';
import {
  RevealScrollView,
  useScrollRevealController,
} from '@/components/ui/RevealScrollView';

type Measure = (x: number, y: number, w: number, h: number) => void;

/** The scroll area sits at y=100 and is 400 tall; sections report `node`. */
const installMeasure = (host: ScrollView, node: { top: number; height: number }) => {
  const scrollTo = jest.fn();
  host.scrollTo = scrollTo as never;
  host.getNativeScrollRef = (() => ({
    measureInWindow: (callback: Measure) => callback(0, 100, 360, 400),
  })) as never;
  jest
    .spyOn(View.prototype, 'measureInWindow')
    .mockImplementation((callback: Measure) => callback(0, node.top, 360, node.height));
  return scrollTo;
};

const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

function Harness({ node }: { node: { top: number; height: number } }) {
  const reveal = useScrollRevealController();
  const scroll = useRef<ScrollView>(null);
  harness = {
    reveal,
    install: () => {
      harnessScrollTo = installMeasure(scroll.current!, node);
    },
  };
  return (
    <RevealScrollView ref={scroll} reveal={reveal} testID="scroll">
      <View testID="section" {...reveal.target('section')} />
    </RevealScrollView>
  );
}
let harness: { reveal: ReturnType<typeof useScrollRevealController>; install: () => void };
let harnessScrollTo: jest.Mock | null;

const layoutSection = (ui: Awaited<ReturnType<typeof render>>) =>
  fireEvent(ui.getByTestId('section'), 'layout', { nativeEvent: {} });

const setup = async (node: { top: number; height: number }) => {
  const ui = await render(<Harness node={node} />);
  await act(async () => harness.install());
  return ui;
};

afterEach(() => jest.restoreAllMocks());

describe('RevealScrollView', () => {
  it('brings a section that was expected to the top of the scroll area', async () => {
    const ui = await setup({ top: 620, height: 200 });
    harness.reveal.expect('section');
    await layoutSection(ui);
    await flushFrame();
    expect(harnessScrollTo).toHaveBeenCalledWith({ y: 508, animated: true });
  });

  it('adds what has already been scrolled', async () => {
    const ui = await setup({ top: 620, height: 200 });
    await fireEvent.scroll(ui.getByTestId('scroll'), {
      nativeEvent: { contentOffset: { y: 40 } },
    });
    harness.reveal.now('section');
    await flushFrame();
    expect(harnessScrollTo).toHaveBeenCalledWith({ y: 548, animated: true });
  });

  it('ignores layouts nobody asked to be taken to', async () => {
    const ui = await setup({ top: 620, height: 200 });
    await layoutSection(ui);
    await flushFrame();
    expect(harnessScrollTo).not.toHaveBeenCalled();
  });

  it('only reveals once per tap', async () => {
    const ui = await setup({ top: 620, height: 200 });
    harness.reveal.expect('section');
    await layoutSection(ui);
    await layoutSection(ui);
    await flushFrame();
    expect(harnessScrollTo).toHaveBeenCalledTimes(1);
  });

  it('forgets a tap whose section never appeared', async () => {
    const ui = await setup({ top: 620, height: 200 });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    harness.reveal.expect('section');
    now.mockReturnValue(10_000);
    await layoutSection(ui);
    await flushFrame();
    expect(harnessScrollTo).not.toHaveBeenCalled();
  });

  it('with align end, scrolls just far enough to show the last line', async () => {
    const ui = await setup({ top: 300, height: 320 });
    harness.reveal.expect('section', { align: 'end' });
    await layoutSection(ui);
    await flushFrame();
    expect(harnessScrollTo).toHaveBeenCalledWith({ y: 132, animated: true });
  });

  it('with align end, stays put when the section already fits', async () => {
    const ui = await setup({ top: 200, height: 100 });
    harness.reveal.expect('section', { align: 'end' });
    await layoutSection(ui);
    await flushFrame();
    expect(harnessScrollTo).not.toHaveBeenCalled();
  });
});

describe('FormDisclosure inside a RevealScrollView', () => {
  function Fold() {
    const [expanded, setExpanded] = useState(false);
    return (
      <RevealScrollView testID="scroll">
        <FormDisclosure
          testID="fold"
          label="More details"
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}>
          <Text>Inside</Text>
        </FormDisclosure>
      </RevealScrollView>
    );
  }

  it('still opens and closes', async () => {
    const ui = await render(<Fold />);
    await fireEvent.press(ui.getByTestId('fold'));
    expect(ui.getByText('Inside')).toBeTruthy();
    await fireEvent.press(ui.getByTestId('fold'));
    expect(ui.queryByText('Inside')).toBeNull();
  });
});
