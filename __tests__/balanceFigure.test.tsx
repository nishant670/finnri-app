import { render } from '@testing-library/react-native';

import { BalanceFigure } from '@/components/split/BalanceFigure';

describe('BalanceFigure', () => {
  it('reads a zero balance as settled when there was activity', async () => {
    const screen = await render(<BalanceFigure value={0} color="#000" />);
    expect(screen.getByText('settled up')).toBeTruthy();
  });

  it('reads a zero balance as nothing-yet when the ledger is empty', async () => {
    const screen = await render(<BalanceFigure value={0} color="#000" hasActivity={false} />);
    expect(screen.getByText('No expenses yet')).toBeTruthy();
  });

  it('uses the overall wording for the screen-wide figure', async () => {
    const settled = await render(<BalanceFigure value={0} color="#000" overall />);
    expect(settled.getByText('Overall, settled up')).toBeTruthy();
    const empty = await render(
      <BalanceFigure value={0} color="#000" overall hasActivity={false} />
    );
    expect(empty.getByText('Nothing to settle yet')).toBeTruthy();
  });

  it('says who owes whom for a non-zero balance', async () => {
    const owed = await render(<BalanceFigure value={120} color="#000" />);
    expect(owed.getByText('you are owed')).toBeTruthy();
    const owe = await render(<BalanceFigure value={-120} color="#000" overall />);
    expect(owe.getByText('Overall, you owe')).toBeTruthy();
  });
});
