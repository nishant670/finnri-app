import { fireEvent, render } from '@testing-library/react-native';

import { TransactionRefundFields } from '@/components/transactions/TransactionRefundFields';

const setup = async (
  overrides: Partial<React.ComponentProps<typeof TransactionRefundFields>> = {}
) => {
  const handlers = {
    onChangeAmount: jest.fn(),
    onChangeExpectedOn: jest.fn(),
    onToggleReminder: jest.fn(),
  };
  const screen = await render(
    <TransactionRefundFields
      refundableAmount=""
      expectedOn=""
      reminderEnabled
      {...handlers}
      {...overrides}
    />
  );
  return { screen, ...handlers };
};

const pickDateMock = () => (globalThis as unknown as { pickDateMock: jest.Mock }).pickDateMock;

describe('TransactionRefundFields', () => {

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

  it('picks the date from the themed calendar and reports it', async () => {
    pickDateMock().mockResolvedValueOnce(new Date(2026, 10, 12));
    const { screen, onChangeExpectedOn } = await setup();
    await fireEvent.press(screen.getByText('Expected back'));
    expect(pickDateMock()).toHaveBeenCalledWith(expect.objectContaining({ title: 'Expected back' }));
    expect(onChangeExpectedOn).toHaveBeenCalledWith('12 November 2026');
  });

  it('leaves the date alone when the calendar is closed', async () => {
    const { screen, onChangeExpectedOn } = await setup();
    await fireEvent.press(screen.getByText('Expected back'));
    expect(onChangeExpectedOn).not.toHaveBeenCalled();
  });

  it('toggles the reminder through its switch', async () => {
    const { screen, onToggleReminder } = await setup({ reminderEnabled: false });
    const toggle = screen.getByRole('switch');
    expect(toggle.props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(toggle);
    expect(onToggleReminder).toHaveBeenCalledTimes(1);
  });
});
