import { fireEvent, render } from '@testing-library/react-native';

import { AnnualFeeCard } from '@/components/accounts/AnnualFeeCard';
import type { AnnualFeeStatus } from '@/lib/accounts';

const base: AnnualFeeStatus = {
  fee: 500,
  fee_month: 'March',
  renewal_date: '2027-03-01',
  card_year_start: '2026-03-01',
  spent: 82000,
};

const text = (node: { props: Record<string, unknown> }) =>
  ([] as unknown[]).concat(node.props.children).join('');

describe('AnnualFeeCard', () => {
  it('shows how much more spend waives the fee, and by when', async () => {
    const { findByTestId } = await render(
      <AnnualFeeCard
        status={{ ...base, waiver_spend: 100000, remaining_to_waive: 18000, waived: false }}
        onEdit={jest.fn()}
      />
    );
    const message = text(await findByTestId('annual-fee-message'));
    expect(message).toMatch(/₹18,000(\.00)? more by 28 Feb should waive it/);
    expect((await findByTestId('annual-fee-progress')).props.style.width).toBe('82%');
  });

  it('says the fee should be waived once spend is past the threshold', async () => {
    const { findByTestId } = await render(
      <AnnualFeeCard
        status={{
          ...base,
          spent: 120000,
          waiver_spend: 100000,
          remaining_to_waive: 0,
          waived: true,
        }}
        onEdit={jest.fn()}
      />
    );
    expect(text(await findByTestId('annual-fee-message'))).toMatch(
      /Check your March statement to make sure it isn’t charged/
    );
    expect((await findByTestId('annual-fee-progress')).props.style.width).toBe('100%');
  });

  it('asks for the waiver threshold when the card has none, and opens editing', async () => {
    const onEdit = jest.fn();
    const { findByTestId, queryByTestId } = await render(
      <AnnualFeeCard status={base} onEdit={onEdit} />
    );
    expect(text(await findByTestId('annual-fee-message'))).toMatch(/Add the spend that waives/);
    expect(queryByTestId('annual-fee-progress')).toBeNull();
    await fireEvent.press(await findByTestId('annual-fee-card'));
    expect(onEdit).toHaveBeenCalled();
  });
});
