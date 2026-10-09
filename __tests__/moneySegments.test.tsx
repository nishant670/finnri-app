import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import {
  MONEY_SEGMENTS,
  MoneySegments,
  isMoneySegment,
} from '@/components/money/MoneySegments';

describe('money segments', () => {
  it('offers every segment the tab holds, spelled out', async () => {
    const screen = await render(<MoneySegments active="upcoming" onChange={jest.fn()} />);

    // The row scrolls instead of dividing the width four ways, so every label
    // survives whole. The subscriptions segment now reads "Recurring": it
    // holds loans, investments and bills too.
    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Budgets')).toBeTruthy();
    expect(screen.getByText('Recurring')).toBeTruthy();
    expect(screen.getByText('Accounts')).toBeTruthy();
  });

  it('reports the pressed segment', async () => {
    const onChange = jest.fn();
    const screen = await render(<MoneySegments active="upcoming" onChange={onChange} />);

    await fireEvent.press(screen.getByText('Accounts'));
    expect(onChange).toHaveBeenCalledWith('accounts');
  });

  it('marks only the active segment as selected, for screen readers too', async () => {
    const screen = await render(<MoneySegments active="budgets" onChange={jest.fn()} />);

    expect(screen.getByLabelText('Budgets')).toBeSelected();
    expect(screen.getByLabelText('Accounts')).not.toBeSelected();
  });
});

describe('isMoneySegment', () => {
  it('accepts the segments and nothing else', () => {
    MONEY_SEGMENTS.forEach((segment) => expect(isMoneySegment(segment)).toBe(true));
    // A deep link carries this in a query string, so anything can arrive.
    expect(isMoneySegment('tools')).toBe(false);
    expect(isMoneySegment(undefined)).toBe(false);
    expect(isMoneySegment(3)).toBe(false);
  });
});
