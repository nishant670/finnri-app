import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import React from 'react';

import { TransactionItem } from '@/components/home/TransactionItem';
import { Segments } from '@/components/ui/Segments';
import { HapticSwitch } from '@/components/ui/HapticSwitch';

const performAndroid = Haptics.performAndroidHapticsAsync as jest.Mock;
const impact = Haptics.impactAsync as jest.Mock;
const selection = Haptics.selectionAsync as jest.Mock;

/** Whichever platform Jest reports, one of these fired. */
const hapticCount = () =>
  performAndroid.mock.calls.length + impact.mock.calls.length + selection.mock.calls.length;

beforeEach(() => {
  performAndroid.mockReset().mockResolvedValue(undefined);
  impact.mockReset().mockResolvedValue(undefined);
  selection.mockReset().mockResolvedValue(undefined);
});

describe('the control carries the feedback, not the screen', () => {
  it('answers a switch on the value it is moving to', async () => {
    // Nine switches across seven files, and wiring each by hand is nine chances
    // to forget the tenth. `haptic-tab.tsx` set this precedent for the tab bar.
    const onValueChange = jest.fn();
    const screen = await render(
      <HapticSwitch testID="probe" value={false} onValueChange={onValueChange} />
    );

    await fireEvent(screen.getByTestId('probe'), 'valueChange', true);

    expect(hapticCount()).toBe(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('still forwards to a switch with no handler of its own', async () => {
    const screen = await render(<HapticSwitch testID="probe" value={false} />);

    await fireEvent(screen.getByTestId('probe'), 'valueChange', true);

    expect(hapticCount()).toBe(1);
  });

  it('answers a segment change', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Segments
        active="upcoming"
        options={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'budgets', label: 'Budgets' },
        ]}
        onChange={onChange}
      />
    );

    await fireEvent.press(screen.getByLabelText('Budgets'));

    expect(hapticCount()).toBe(1);
    expect(onChange).toHaveBeenCalledWith('budgets');
  });
});

describe('the swipe row, which C5 deferred here on purpose', () => {
  const row = {
    icon: 'food',
    title: 'Chai',
    category: 'Food & Drinks',
    amount: 42,
    date: '10:24 AM',
  };

  it('answers when a row starts collapsing, not when the delete commits', async () => {
    // The Undo window is still open and nothing has been written, so this is
    // neither `saved` nor `rejected` — the app has not turned anything down.
    const collapsing = (collapsed: boolean) => (
      <TransactionItem {...row} onEdit={jest.fn()} onDelete={jest.fn()} collapsed={collapsed} />
    );
    const screen = await render(collapsing(false));

    expect(hapticCount()).toBe(0);

    await screen.rerender(collapsing(true));

    expect(hapticCount()).toBe(1);
  });

  it('stays silent for a row that is merely rendered', async () => {
    await render(<TransactionItem {...row} entranceIndex={0} />);

    expect(hapticCount()).toBe(0);
  });
});
