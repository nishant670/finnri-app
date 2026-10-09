import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { TransactionRefundFields } from '@/components/transactions/TransactionRefundFields';

const setup = async (
  overrides: Partial<React.ComponentProps<typeof TransactionRefundFields>> = {}
) => {
  const handlers = {
    onChangeAmount: jest.fn(),
    onChangeExpectedOn: jest.fn(),
    onToggleReminder: jest.fn(),
    onChangePickerVisible: jest.fn(),
  };
  const screen = await render(
    <TransactionRefundFields
      refundableAmount=""
      expectedOn=""
      reminderEnabled
      isPickerVisible={false}
      {...handlers}
      {...overrides}
    />
  );
  return { screen, ...handlers };
};

describe('TransactionRefundFields', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
    jest.clearAllMocks();
  });

  it('prompts for a date until one is chosen', async () => {
    const { screen } = await setup();
    expect(screen.getByText('Refund tracking')).toBeTruthy();
    expect(screen.getByText('Choose a date')).toBeTruthy();
    expect(
      (await setup({ expectedOn: '12 Nov 2026' })).screen.getByText('12 Nov 2026')
    ).toBeTruthy();
  });

  it('reports typed amounts without reformatting them', async () => {
    const { screen, onChangeAmount } = await setup({ refundableAmount: '500' });
    const input = screen.getByDisplayValue('500');
    await fireEvent.changeText(input, '5,000');
    expect(onChangeAmount).toHaveBeenCalledWith('5,000');
  });

  it('opens the inline picker on iOS', async () => {
    Platform.OS = 'ios';
    const { screen, onChangePickerVisible } = await setup();
    await fireEvent.press(screen.getByText('Expected back'));
    expect(onChangePickerVisible).toHaveBeenCalledWith(true);
    expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
  });

  it('opens the native dialog on Android and reports the chosen date', async () => {
    Platform.OS = 'android';
    const { screen, onChangeExpectedOn, onChangePickerVisible } = await setup();
    await fireEvent.press(screen.getByText('Expected back'));
    expect(onChangePickerVisible).not.toHaveBeenCalled();
    const options = (DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];
    options.onValueChange({}, new Date(2026, 10, 12));
    expect(onChangeExpectedOn).toHaveBeenCalledWith('12 November 2026');
  });

  it('toggles the reminder through its switch', async () => {
    const { screen, onToggleReminder } = await setup({ reminderEnabled: false });
    const toggle = screen.getByRole('switch');
    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(toggle);
    expect(onToggleReminder).toHaveBeenCalledTimes(1);
  });
});
