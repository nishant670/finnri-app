import { fireEvent, render } from '@testing-library/react-native';

import { RecurringActionsSheet, RecurringRow } from '@/components/money/RecurringList';
import { DateRow } from '@/components/money/subscriptions/DateRow';
import { Field } from '@/components/money/subscriptions/Field';
import { InputRow, ToggleRow } from '@/components/money/subscriptions/FormRows';
import { Pill } from '@/components/money/subscriptions/Pill';
import { SegmentedControl } from '@/components/money/subscriptions/SegmentedControl';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Subscription } from '@/lib/subscriptions';

jest.mock('@/lib/haptics', () => ({
  haptics: { select: jest.fn(), saved: jest.fn(), toggle: jest.fn() },
}));
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

describe('InputRow', () => {
  it('names the field in full for a screen reader and reports edits', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <InputRow
        label="EMIs paid"
        accessibilityLabel="EMIs already paid"
        value="3"
        onChangeText={onChangeText}
        suffix="of 36"
      />
    );
    expect(screen.getByText('EMIs paid')).toBeTruthy();
    expect(screen.getByText('of 36')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('EMIs already paid'), '4');
    expect(onChangeText).toHaveBeenCalledWith('4');
  });
});

describe('ToggleRow', () => {
  it('toggles from anywhere on the row', async () => {
    const onValueChange = jest.fn();
    const screen = await render(
      <ToggleRow title="Autopay" caption="Adds each payment" value={false} onValueChange={onValueChange} />
    );
    const row = screen.getByRole('switch');
    expect(row.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(screen.getByText('Adds each payment'));
    expect(onValueChange).toHaveBeenCalledWith(true);
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
  it('is named by its label and reports edits', async () => {
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
    // The board draws the field with only its placeholder; the label is spoken.
    expect(screen.queryByText('Amount')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Amount'), '249');
    expect(onChangeText).toHaveBeenCalledWith('249');
  });
});

describe('DateRow', () => {
  it('formats the date, or prompts for one', async () => {
    const onPress = jest.fn();
    const withDate = await render(
      <DateRow label="Next due" value="2026-09-05" onPress={onPress} />
    );
    expect(withDate.getByText(/^05 Sep(t)? 2026$/)).toBeTruthy();
    await fireEvent.press(withDate.getByLabelText('Next due'));
    expect(onPress).toHaveBeenCalledTimes(1);
    const empty = await render(
      <DateRow label="Start" value="" onPress={jest.fn()} />
    );
    expect(empty.getByText('Pick a date')).toBeTruthy();
  });
});

describe('RecurringRow and its actions (boards R5-RecurringList, R5-RecurringActions)', () => {
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
      reminder_days: 3,
      total_instalments: 0,
      instalments_paid: 0,
      ...over,
    }) as unknown as Subscription;

  it('names what it is and when it is due, in one date format, and opens its actions', async () => {
    const onPress = jest.fn();
    const screen = await render(<RecurringRow item={sub()} divider={false} onPress={onPress} />);
    expect(screen.getByText('Entertainment · monthly')).toBeTruthy();
    expect(screen.getByText(/^Due 12 Oct$/)).toBeTruthy();
    // No unlabelled icons on the row any more.
    expect(screen.queryByLabelText('Delete Netflix')).toBeNull();
    await fireEvent.press(screen.getByText('Netflix'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says overdue, and shows a loan’s progress', async () => {
    expect((await render(<RecurringRow item={sub({ due_state: 'overdue' })} divider={false} onPress={jest.fn()} />)).getByText(/^Overdue/)).toBeTruthy();
    const loan = await render(
      <RecurringRow
        item={sub({ kind: 'loan', name: 'Car loan', lender: 'ICICI Bank', total_instalments: 12, instalments_paid: 4 })}
        divider={false}
        onPress={jest.fn()}
      />
    );
    expect(loan.getByText('4 of 12 paid · 8 left')).toBeTruthy();
    expect(loan.getByText('Loan · ICICI Bank · monthly')).toBeTruthy();
  });

  const sheet = async (over: Record<string, unknown> = {}) => {
    const h = { onClose: jest.fn(), onMarkPaid: jest.fn(), onEdit: jest.fn(), onCancel: jest.fn(), onDelete: jest.fn() };
    const screen = await render(<RecurringActionsSheet item={sub(over)} visible {...h} />);
    return { screen, ...h };
  };

  it('offers mark paid, edit, cancel and delete for an active item, each named', async () => {
    const { screen, onMarkPaid, onEdit, onCancel, onDelete } = await sheet();
    expect(screen.getByText('₹649 · due 12 Oct · reminder 3 days before')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mark Netflix paid'));
    await fireEvent.press(screen.getByLabelText('Edit Netflix'));
    await fireEvent.press(screen.getByLabelText('Cancel Netflix'));
    await fireEvent.press(screen.getByLabelText('Delete Netflix'));
    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps only edit and delete once it is cancelled', async () => {
    const { screen } = await sheet({ status: 'cancelled', due_state: 'cancelled' });
    expect(screen.queryByLabelText('Mark Netflix paid')).toBeNull();
    expect(screen.queryByLabelText('Cancel Netflix')).toBeNull();
    expect(screen.getByLabelText('Delete Netflix')).toBeTruthy();
  });
});
