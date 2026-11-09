import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { DatePickerProvider, useDatePicker, type PickDateOptions } from '@/components/ui/DatePickerProvider';

/** Opens the picker the way a form would, and records what it resolves to. */
function Opener({ options, onResult }: { options: PickDateOptions; onResult: (date: Date | null) => void }) {
  const { pickDate } = useDatePicker();
  // Not awaited: the press only opens the sheet; the answer comes later.
  return <Text onPress={() => void pickDate(options).then(onResult)}>Open</Text>;
}

const setup = async (options: PickDateOptions) => {
  const onResult = jest.fn();
  const screen = await render(
    <DatePickerProvider>
      <Opener options={options} onResult={onResult} />
    </DatePickerProvider>
  );
  await fireEvent.press(screen.getByText('Open'));
  return { screen, onResult };
};

describe('the one themed date picker', () => {
  it('opens on the month of the date already set, under its title', async () => {
    const { screen } = await setup({ title: 'Due date', value: new Date(2026, 9, 7) });
    expect(screen.getByText('Due date')).toBeTruthy();
    expect(screen.getByText('October 2026')).toBeTruthy();
  });

  it('resolves the chosen day on Done, keeping the time of day', async () => {
    const { screen, onResult } = await setup({ value: new Date(2026, 9, 7, 9, 15) });
    await fireEvent.press(screen.getByTestId('date-picker-day-12'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('date-picker-done'));
    });
    const picked: Date = onResult.mock.calls[0][0];
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2026, 9, 12]);
    expect([picked.getHours(), picked.getMinutes()]).toEqual([9, 15]);
  });

  it('resolves null when closed without choosing', async () => {
    const { screen, onResult } = await setup({ value: new Date(2026, 9, 7) });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Close'));
    });
    expect(onResult).toHaveBeenCalledWith(null);
  });

  it('will not offer a day outside the allowed range', async () => {
    const { screen } = await setup({
      value: new Date(2026, 9, 15),
      minimumDate: new Date(2026, 9, 10),
      maximumDate: new Date(2026, 9, 20),
    });
    expect(screen.getByTestId('date-picker-day-9').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('date-picker-day-10').props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByTestId('date-picker-day-21').props.accessibilityState).toMatchObject({ disabled: true });
    // Nothing to turn to either side.
    expect(screen.getByLabelText('Previous month').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('Next month').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('offers Tomorrow instead of Yesterday for a date that must be ahead', async () => {
    const { screen } = await setup({ minimumDate: new Date() });
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
    expect(screen.queryByText('Yesterday')).toBeNull();
  });
});
