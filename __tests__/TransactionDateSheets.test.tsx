import { fireEvent, render } from '@testing-library/react-native';

import { TransactionDateSheet } from '@/components/transactions/TransactionDateSheets';

describe('TransactionDateSheet', () => {
  const renderSheet = async (value = new Date(2026, 9, 7, 13, 30)) => {
    const handlers = { onChange: jest.fn(), onClose: jest.fn(), onConfirm: jest.fn() };
    const screen = await render(<TransactionDateSheet visible value={value} {...handlers} />);
    return { screen, ...handlers };
  };

  it('shows the month of the date being edited', async () => {
    const { screen } = await renderSheet();
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
  });

  it('picks a day and keeps the time of day', async () => {
    const { screen, onChange } = await renderSheet();
    await fireEvent.press(screen.getByTestId('date-sheet-day-12'));
    const picked: Date = onChange.mock.calls[0][0];
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([2026, 9, 12]);
    expect([picked.getHours(), picked.getMinutes()]).toEqual([13, 30]);
  });

  it('moves between months', async () => {
    const { screen } = await renderSheet();
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('November 2026')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Previous month'));
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('September 2026')).toBeTruthy();
  });

  it('jumps to yesterday from its chip', async () => {
    const { screen, onChange } = await renderSheet();
    await fireEvent.press(screen.getByText('Yesterday'));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect((onChange.mock.calls[0][0] as Date).toDateString()).toBe(yesterday.toDateString());
  });

  it('confirms with Done and closes with the ×', async () => {
    const { screen, onClose, onConfirm } = await renderSheet();
    await fireEvent.press(screen.getByText('Done'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
