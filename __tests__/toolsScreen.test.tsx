import { fireEvent, render } from '@testing-library/react-native';

import ToolsScreen from '@/app/tools';
import { calculateEMI } from '@/lib/emi';
import { formatMoney } from '@/lib/money';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('@/hooks/use-auth-store', () => ({ useAuthStore: () => ({ token: 'test-token' }) }));
jest.mock('@/lib/emi', () => ({ calculateEMI: jest.fn() }));

const emiResult = {
  principal_amount: 500000,
  annual_interest_rate_percent: 8.5,
  tenure_months: 36,
  monthly_emi: 15784,
  total_interest: 68216,
  total_payment: 568216,
  schedule: Array.from({ length: 36 }, (_, index) => ({
    month: index + 1,
    opening_balance: 500000,
    payment_amount: 15784,
    principal_amount: 12242 + index,
    interest_amount: 3542 - index,
    closing_balance: 487758 - index * 12000,
  })),
};

describe('Calculators (boards R11-SIP, R11-EMI)', () => {
  it('opens on SIP with a note instead of an empty result', async () => {
    const screen = await render(<ToolsScreen />);
    expect(screen.getByText('Calculators')).toBeTruthy();
    // Money fields read grouped the Indian way while typed.
    expect(screen.getByDisplayValue('10,000')).toBeTruthy();
    expect(screen.getByText(`Press Calculate to see what ${formatMoney(10000)} a month could grow to.`)).toBeTruthy();
  });

  it('shows the projection with the corrected table heading', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByTestId('tools-calculate-sip'));
    expect(screen.getByText('In 10 years, you could have')).toBeTruthy();
    expect(screen.getByText('You put in')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('Added that year')).toBeTruthy();
    expect(screen.getByText('Value at year end')).toBeTruthy();
  });

  it('clears a result once an input changes, so it never describes old numbers', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByTestId('tools-calculate-sip'));
    expect(screen.getByText('Growth')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Time period'), '15');
    expect(screen.queryByText('Growth')).toBeNull();
    expect(screen.getByText(/Press Calculate/)).toBeTruthy();
  });

  it('shows the EMI with interest in the schedule', async () => {
    (calculateEMI as jest.Mock).mockResolvedValue(emiResult);
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByTestId('tools-tab-emi'));
    await fireEvent.press(screen.getByTestId('tools-calculate-emi'));

    expect(await screen.findByText('Monthly EMI')).toBeTruthy();
    expect(screen.getByText('for 36 months · 3 years')).toBeTruthy();
    expect(screen.getByText('You pay in total')).toBeTruthy();
    expect(screen.getByText('Show all 36')).toBeTruthy();
    expect(screen.getAllByText('Interest').length).toBeGreaterThan(1);
    expect(screen.getByText(formatMoney(3542))).toBeTruthy();
  });
});
