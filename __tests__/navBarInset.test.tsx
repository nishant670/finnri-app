import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ReceiptSourceSheet } from '@/components/transactions/ReceiptSourceSheet';
import { TransactionFormModal } from '@/components/transactions/TransactionFormModal';

// A three-button navigation bar: the 48dp that covered half of Save and
// "Continue to payment" on testers' OnePlus, Samsung and Xiaomi phones. The
// shared mock's 16 is a gesture bar, which fixed padding happened to clear.
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 24, right: 0, bottom: 48, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

type Element = ReturnType<Awaited<ReturnType<typeof render>>['getByTestId']>;

/** The bottom padding of the nearest ancestor that sets one. */
function paddingBelow(node: Element): number | undefined {
  for (let current: Element | null = node; current; current = current.parent as Element | null) {
    const padding = StyleSheet.flatten(current.props.style)?.paddingBottom;
    if (typeof padding === 'number') return padding;
  }
  return undefined;
}

describe('bottom actions clear the system navigation bar', () => {
  it('pads the pinned Save footer of the add-entry sheet by the bar', async () => {
    const screen = await render(
      <TransactionFormModal visible mode="manual" onSave={jest.fn()} onClose={jest.fn()} />
    );

    expect(paddingBelow(await screen.findByTestId('entry-save-button'))).toBe(16 + 48);
  });

  it('pads a bottom sheet by the bar', async () => {
    const screen = await render(<ReceiptSourceSheet visible onChoose={jest.fn()} onClose={jest.fn()} />);

    const sheet = screen.getByTestId('receipt-source-sheet');
    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(28 + 48);
  });
});
