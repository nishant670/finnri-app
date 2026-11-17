import { render } from '@testing-library/react-native';

import { MonthStrip } from '@/components/home/MonthStrip';
import { glanceComparison } from '@/lib/insight-glance';
import { describeSpendChange, type DashboardResponse } from '@/lib/insights';

/**
 * Device feedback 2026-11-17: Home read "0% less than Oct 1–13" in green and
 * "0% more than Oct 1–13" in red for a month that was level. A change that
 * rounds to 0% now says so in words and in no colour.
 */
describe('describeSpendChange', () => {
  it('names a real change with its direction', () => {
    expect(describeSpendChange(8.2, 'Oct 1–13')).toEqual({
      direction: 'more',
      lead: '8% more',
      rest: 'than Oct 1–13',
    });
    expect(describeSpendChange(-8.2, 'Oct 1–13')).toEqual({
      direction: 'less',
      lead: '8% less',
      rest: 'than Oct 1–13',
    });
  });

  it('says "About the same" for anything that rounds to 0%', () => {
    for (const change of [0, 0.3, -0.3, 0.49, -0.49, -0]) {
      expect(describeSpendChange(change, 'Oct 1–13')).toEqual({
        direction: 'same',
        lead: 'About the same',
        rest: 'as Oct 1–13',
      });
    }
  });

  it('keeps 0.5% as a 1% change, so the words and the number agree', () => {
    expect(describeSpendChange(0.5, 'Oct 1–13').lead).toBe('1% more');
    expect(describeSpendChange(-0.6, 'Oct 1–13').lead).toBe('1% less');
  });

  it('never prints "0%"', () => {
    for (let change = -1; change <= 1; change += 0.05) {
      expect(describeSpendChange(change, 'Oct 1–13').lead).not.toMatch(/^0%/);
    }
  });

  it('treats a missing number as level rather than printing NaN%', () => {
    expect(describeSpendChange(Number.NaN, 'Oct 1–13').direction).toBe('same');
  });

  it('keeps big increases as multipliers', () => {
    expect(describeSpendChange(1353, 'Oct 1–13').lead).toBe('15× more');
  });
});

describe('glanceComparison', () => {
  const dashboard = (spend_change: number) =>
    ({
      summary: { spend_change, spend_change_comparable: true },
      period: { start: '2026-11-01', end: '2026-11-13', comparison_label: 'Nov 1–13 vs Oct 1–13' },
    }) as unknown as DashboardResponse;

  it('says "About the same" instead of "0% more"', () => {
    expect(glanceComparison(dashboard(0.3))).toEqual({
      more: false,
      same: true,
      lead: 'About the same',
      rest: 'as Oct 1–13',
    });
  });

  it('still names a real change', () => {
    expect(glanceComparison(dashboard(-12))).toEqual({
      more: false,
      lead: '12% less',
      rest: 'than Oct 1–13',
    });
  });
});

describe('MonthStrip comparison line', () => {
  const dashboard = (spend_change: number) =>
    ({
      summary: {
        total_spent: 133367,
        transaction_count: 40,
        spend_change,
        spend_change_comparable: true,
        previous_total_spent: 130000,
      },
      top_categories: [],
      period: { start: '2026-11-01', end: '2026-11-13', comparison_label: 'Nov 1–13 vs Oct 1–13' },
    }) as unknown as DashboardResponse;

  it('reads "About the same as Oct 1–13" for a 0.3% change', async () => {
    const screen = await render(
      <MonthStrip dashboard={dashboard(0.3)} loading={false} onPress={jest.fn()} />
    );
    expect(screen.getByTestId('month-strip-change').props.children).toBe('About the same');
    expect(screen.getByText(/as Oct 1–13/)).toBeTruthy();
    expect(screen.queryByText(/0% more|0% less/)).toBeNull();
  });

  it('keeps "8% less than Oct 1–13" for a real drop', async () => {
    const screen = await render(
      <MonthStrip dashboard={dashboard(-8)} loading={false} onPress={jest.fn()} />
    );
    expect(screen.getByTestId('month-strip-change').props.children).toBe('8% less');
    expect(screen.getByText(/than Oct 1–13/)).toBeTruthy();
  });
});
