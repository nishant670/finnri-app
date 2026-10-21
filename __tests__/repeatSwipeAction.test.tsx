import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { TransactionItem } from '@/components/home/TransactionItem';

const row = {
  icon: 'rickshaw',
  title: 'E-rickshaw',
  category: 'Transport',
  amount: 20,
  date: '',
};

describe('the Repeat swipe action', () => {
  it('sits with Edit and Delete and calls back when tapped', async () => {
    const onRepeat = jest.fn();
    const screen = await render(
      <TransactionItem {...row} onEdit={jest.fn()} onDelete={jest.fn()} onRepeat={onRepeat} />
    );

    expect(screen.getByLabelText('Edit')).toBeTruthy();
    expect(screen.getByLabelText('Delete')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Repeat'));

    expect(onRepeat).toHaveBeenCalledTimes(1);
  });

  it('is absent on a row that was not given one', async () => {
    const screen = await render(
      <TransactionItem {...row} onEdit={jest.fn()} onDelete={jest.fn()} />
    );

    expect(screen.queryByLabelText('Repeat')).toBeNull();
  });

  it('cannot make a row swipeable by itself', async () => {
    // Swiping is gated on Edit and Delete, which carry the Undo. A row that has
    // only Repeat stays a plain row.
    const screen = await render(<TransactionItem {...row} onRepeat={jest.fn()} />);

    expect(screen.queryByLabelText('Repeat')).toBeNull();
  });
});
