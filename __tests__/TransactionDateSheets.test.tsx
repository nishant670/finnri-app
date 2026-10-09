import { fireEvent, render } from '@testing-library/react-native';

import {
  TransactionCancellationDateSheet,
  TransactionDateTimeSheet,
  TransactionSubscriptionDateSheet,
} from '@/components/transactions/TransactionDateSheets';

const setup = async (Sheet: typeof TransactionDateTimeSheet) => {
  const handlers = {
    onChangePendingDate: jest.fn(),
    onClose: jest.fn(),
    onConfirm: jest.fn(),
  };
  const screen = await render(<Sheet pendingDate={new Date(2026, 9, 7)} {...handlers} />);
  return { screen, ...handlers };
};

describe('TransactionDateTimeSheet', () => {
  it('confirms or cancels', async () => {
    const { screen, onClose, onConfirm } = await setup(TransactionDateTimeSheet);
    expect(screen.getByText('Select Date & Time')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set Date'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TransactionCancellationDateSheet', () => {
  it('has a single confirm action and no cancel button', async () => {
    const { screen, onConfirm } = await setup(TransactionCancellationDateSheet);
    expect(screen.getByText('Cancellation reminder date')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
    await fireEvent.press(screen.getByText('Set reminder date'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('TransactionSubscriptionDateSheet', () => {
  it('confirms or cancels', async () => {
    const { screen, onClose, onConfirm } = await setup(TransactionSubscriptionDateSheet);
    expect(screen.getByText('Next payment date')).toBeTruthy();
    await fireEvent.press(screen.getByText('Set date'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
