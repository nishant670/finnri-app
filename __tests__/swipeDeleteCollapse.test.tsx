import { render } from '@testing-library/react-native';
import React from 'react';

import { TransactionItem } from '@/components/home/TransactionItem';

const row = {
  icon: 'food',
  title: 'One more test',
  category: 'Misc',
  amount: 264,
  date: '00:16',
  variant: 'list' as const,
};

const swipeRow = (props: Partial<React.ComponentProps<typeof TransactionItem>>) => (
  <TransactionItem {...row} onEdit={jest.fn()} onDelete={jest.fn()} onRepeat={jest.fn()} {...props} />
);

describe('deleting a swiped-open row', () => {
  it('tells the list the row is shut once it starts collapsing', async () => {
    const onSwipeOpenChange = jest.fn();
    const screen = await render(swipeRow({ swipeOpen: true, onSwipeOpenChange }));
    expect(onSwipeOpenChange).not.toHaveBeenCalled();

    // Delete: the list collapses the row it still holds open.
    await screen.rerender(swipeRow({ swipeOpen: true, collapsed: true, onSwipeOpenChange }));
    expect(onSwipeOpenChange).toHaveBeenCalledTimes(1);
    expect(onSwipeOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not ask again while the list catches up, nor on Undo', async () => {
    const onSwipeOpenChange = jest.fn();
    const screen = await render(swipeRow({ swipeOpen: true, onSwipeOpenChange }));
    await screen.rerender(swipeRow({ swipeOpen: true, collapsed: true, onSwipeOpenChange }));
    await screen.rerender(swipeRow({ swipeOpen: false, collapsed: true, onSwipeOpenChange }));
    await screen.rerender(swipeRow({ swipeOpen: false, collapsed: false, onSwipeOpenChange }));
    expect(onSwipeOpenChange).toHaveBeenCalledTimes(1);
  });

  it('leaves a shut row alone when it is deleted', async () => {
    const onSwipeOpenChange = jest.fn();
    const screen = await render(swipeRow({ swipeOpen: false, onSwipeOpenChange }));
    await screen.rerender(swipeRow({ swipeOpen: false, collapsed: true, onSwipeOpenChange }));
    expect(onSwipeOpenChange).not.toHaveBeenCalled();
  });
});
