import { fireEvent, render } from '@testing-library/react-native';

import { ChipPicker } from '@/components/money/subscriptions/ChipPicker';
import { DateRow } from '@/components/money/subscriptions/DateRow';
import { Field } from '@/components/money/subscriptions/Field';
import { Pill } from '@/components/money/subscriptions/Pill';
import { SegmentedControl } from '@/components/money/subscriptions/SegmentedControl';
import { SubscriptionCard } from '@/components/money/subscriptions/SubscriptionCard';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Subscription } from '@/lib/subscriptions';

jest.mock('@/lib/haptics', () => ({ haptics: { select: jest.fn(), saved: jest.fn() } }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  router: { push: jest.fn() },
}));

const colors = {
  text: '#111111',
  background: '#ffffff',
  card: '#f5f5f5',
  border: '#dddddd',
  accent: '#ff8865',
  secondary: '#eee',
} as unknown as ReturnType<typeof useThemeTokens>['colors'];

describe('Pill', () => {
  it('reports its press and its selected state', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Pill label="Monthly" selected onPress={onPress} colors={colors} />
    );
    const pill = screen.getByRole('button');
    expect(pill.props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(pill);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ChipPicker', () => {
  it('lists the options and selects one', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <ChipPicker
        label="Category"
        options={['Food', 'Travel']}
        active="Food"
        onSelect={onSelect}
        colors={colors}
      />
    );
    expect(screen.getByText('Category')).toBeTruthy();
    await fireEvent.press(screen.getByText('Travel'));
    expect(onSelect).toHaveBeenCalledWith('Travel');
  });
});

describe('SegmentedControl', () => {
  it('marks the active segment and selects another', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <SegmentedControl
        label="Repeats"
        values={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ]}
        active="monthly"
        onSelect={onSelect}
        colors={colors}
      />
    );
    const [weekly, monthly] = screen.getAllByRole('button');
    expect(monthly.props.accessibilityState).toEqual({ selected: true });
    expect(weekly.props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByText('Weekly'));
    expect(onSelect).toHaveBeenCalledWith('weekly');
  });
});

describe('Field', () => {
  it('shows its label and reports edits', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Field
        label="Amount"
        value="199"
        onChangeText={onChangeText}
        colors={colors}
        placeholder="0"
        keyboardType="decimal-pad"
      />
    );
    expect(screen.getByText('Amount')).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue('199'), '249');
    expect(onChangeText).toHaveBeenCalledWith('249');
  });
});

describe('DateRow', () => {
  it('formats the date, or prompts for one', async () => {
    const onPress = jest.fn();
    const withDate = await render(
      <DateRow label="Next due" value="2026-09-05" onPress={onPress} colors={colors} muted="#999" />
    );
    expect(withDate.getByText(/^05 Sep(t)? 2026$/)).toBeTruthy();
    await fireEvent.press(withDate.getByLabelText('Next due'));
    expect(onPress).toHaveBeenCalledTimes(1);
    const empty = await render(
      <DateRow label="Start" value="" onPress={jest.fn()} colors={colors} muted="#999" />
    );
    expect(empty.getByText('Pick a date')).toBeTruthy();
  });
});

describe('SubscriptionCard', () => {
  const sub = (over: Record<string, unknown> = {}) =>
    ({
      id: 1,
      name: 'Netflix',
      merchant: 'Netflix',
      amount: 649,
      billing_interval: 'monthly',
      next_due_date: '2026-10-12',
      status: 'active',
      due_state: 'scheduled',
      days_until_due: 5,
      category: 'Entertainment',
      cancel_before_due: false,
      total_instalments: 0,
      instalments_paid: 0,
      ...over,
    }) as unknown as Subscription;

  const setup = async (over: Record<string, unknown> = {}) => {
    const h = {
      onPress: jest.fn(),
      onMarkPaid: jest.fn(),
      onCancelNow: jest.fn(),
      onDelete: jest.fn(),
    };
    const screen = await render(
      <SubscriptionCard subscription={sub(over)} colors={colors} muted="#999" {...h} />
    );
    return { screen, ...h };
  };

  it('opens the editor and offers mark-paid, cancel and delete for an active subscription', async () => {
    const { screen, onPress, onMarkPaid, onCancelNow, onDelete } = await setup();
    await fireEvent.press(screen.getByLabelText('Edit Netflix'));
    await fireEvent.press(screen.getByLabelText('Mark Netflix paid'));
    await fireEvent.press(screen.getByLabelText('Cancel Netflix'));
    await fireEvent.press(screen.getByLabelText('Delete Netflix'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    expect(onCancelNow).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides mark-paid and cancel once it is no longer active', async () => {
    const { screen } = await setup({ status: 'cancelled' });
    expect(screen.queryByLabelText('Mark Netflix paid')).toBeNull();
    expect(screen.queryByLabelText('Cancel Netflix')).toBeNull();
    expect(screen.getByLabelText('Delete Netflix')).toBeTruthy();
  });

  it('shows the cancellation reminder flag', async () => {
    const { screen } = await setup({ cancel_before_due: true });
    expect(screen.getByText('Cancel reminder')).toBeTruthy();
  });

  it('shows loan progress and completion', async () => {
    const running = await setup({ total_instalments: 12, instalments_paid: 4 });
    expect(running.screen.getByText('4 of 12 paid · 8 left')).toBeTruthy();
    const done = await setup({ total_instalments: 12, instalments_paid: 12 });
    expect(done.screen.getByText('All 12 payments done')).toBeTruthy();
  });
});
