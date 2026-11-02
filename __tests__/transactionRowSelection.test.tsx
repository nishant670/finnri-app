import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { TransactionItem } from '@/components/home/TransactionItem';

const row = {
  icon: 'silverware-fork-knife',
  title: 'Dinner',
  category: 'Food & Drinks',
  amount: 2400,
  date: '',
  variant: 'list' as const,
};

describe('selecting list rows for an event', () => {
  it('starts selecting on a long press', async () => {
    const onLongPress = jest.fn();
    const screen = await render(<TransactionItem {...row} onPress={jest.fn()} onLongPress={onLongPress} />);

    fireEvent(screen.getByText('Dinner'), 'longPress');

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('says whether it is chosen, and only while selecting', async () => {
    const plain = await render(<TransactionItem {...row} />);
    expect(plain.getByTestId('transaction-row')).not.toBeSelected();
    await plain.unmount();

    const chosen = await render(<TransactionItem {...row} selected />);
    expect(chosen.getByTestId('transaction-row')).toBeSelected();
    await chosen.unmount();

    // Income shows while grouping expenses, but cannot be chosen.
    const income = await render(<TransactionItem {...row} isIncome selected={false} dimmed />);
    expect(income.getByTestId('transaction-row')).toBeDisabled();
  });

  it('cannot be swiped while selecting, because the screen gives it no actions', async () => {
    const screen = await render(<TransactionItem {...row} selected={false} />);

    expect(screen.queryByLabelText('Edit')).toBeNull();
    expect(screen.queryByLabelText('Delete')).toBeNull();
  });
});
