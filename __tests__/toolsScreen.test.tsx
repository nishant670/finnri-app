import { fireEvent, render } from '@testing-library/react-native';

import ToolsScreen from '@/app/tools';
import { calculateEMILocal, emiYears, prepaymentWhatIf } from '@/lib/emi';
import { formatMoney } from '@/lib/money';
import { calculateSIP, inTodaysMoney } from '@/lib/sip';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));

describe('EMI worked out on the phone (P50)', () => {
  it('matches the board and the server: ₹5,00,000 at 8.5% for 36 months', () => {
    const result = calculateEMILocal(500000, 8.5, 36)!;
    // Paise-exact, like the server; ₹15,784 once formatted.
    expect(result.monthly_emi).toBeCloseTo(15783.77, 2);
    expect(formatMoney(result.monthly_emi)).toBe(formatMoney(15784));
    expect(Math.round(result.total_interest)).toBe(68216);
    expect(result.schedule).toHaveLength(36);
    expect(result.schedule[35].closing_balance).toBe(0);
  });

  it('refuses inputs the server would refuse', () => {
    expect(calculateEMILocal(0, 8.5, 36)).toBeNull();
    expect(calculateEMILocal(500000, 101, 36)).toBeNull();
    expect(calculateEMILocal(500000, 8.5, 361)).toBeNull();
  });

  it('splits each year into principal and interest for the chart (P52)', () => {
    const years = emiYears(calculateEMILocal(500000, 8.5, 36)!.schedule);
    expect(years).toHaveLength(3);
    expect(years[0].interest).toBeGreaterThan(years[2].interest);
  });

  it('says what paying more each month saves (P54)', () => {
    const base = calculateEMILocal(500000, 8.5, 36)!;
    const whatIf = prepaymentWhatIf(base, 5000)!;
    expect(whatIf.monthsSooner).toBeGreaterThan(0);
    expect(whatIf.interestSaved).toBeGreaterThan(0);
    expect(prepaymentWhatIf(base, 0)).toBeNull();
  });
});

describe('SIP in today’s money (P54)', () => {
  it('discounts the final value by 6% a year', () => {
    expect(Math.round(inTodaysMoney(1.06 ** 10 * 100000, 10))).toBe(100000);
    const sip = calculateSIP({
      monthlyInvestment: 100000,
      expectedAnnualReturnPercent: 12,
      tenureYears: 10,
      annualStepUpPercent: 10,
      currentCorpus: 0,
    });
    // Board R11-SIP-Proposals: about ₹1.87 crore in today's money.
    expect(inTodaysMoney(sip.maturityValue, 10) / 1e7).toBeCloseTo(1.87, 1);
  });
});

describe('Calculators (boards R11-SIP-Proposals, R11-EMI-Proposals)', () => {
  beforeEach(() => mockPush.mockReset());

  it('shows the SIP answer on top with no Calculate button, and the chart first', async () => {
    const screen = await render(<ToolsScreen />);
    expect(screen.queryByText('Calculate')).toBeNull();
    expect(screen.getByDisplayValue('10,000')).toBeTruthy();
    expect(screen.getByText('In 10 years, you could have')).toBeTruthy();
    expect(screen.getByText(/In today’s money that is/)).toBeTruthy();
    expect(screen.queryByText(/about about/)).toBeNull();
    expect(screen.getByTestId('sip-growth-chart')).toBeTruthy();
    // The table waits for a tap.
    expect(screen.queryByText('Value at year end')).toBeNull();
    await fireEvent.press(screen.getByText('See year by year'));
    expect(screen.getByText('Added that year')).toBeTruthy();
  });

  it('follows an edited input straight away, and says what to fix when it cannot', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.changeText(screen.getByLabelText('Time period'), '15');
    expect(screen.getByText('In 15 years, you could have')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Monthly investment'), '');
    expect(screen.getByText('Enter a monthly amount to see what it could grow to.')).toBeTruthy();
  });

  it('works out the EMI with no request, and offers paying more', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByTestId('tools-tab-emi'));
    expect(screen.getByText('Monthly EMI')).toBeTruthy();
    expect(screen.getByText('for 60 months · 5 years')).toBeTruthy();
    expect(screen.getByText('You pay in total')).toBeTruthy();
    expect(screen.getByTestId('emi-years-chart')).toBeTruthy();
    expect(screen.getByText(/a month: done/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Change'));
    await fireEvent.press(screen.getByText(`+${formatMoney(10000)}`));
    expect(screen.getByText(`${formatMoney(10000)} more`)).toBeTruthy();
  });

  it('tracks a loan in Recurring with its figures filled in (P53)', async () => {
    const screen = await render(<ToolsScreen />);
    await fireEvent.press(screen.getByTestId('tools-tab-emi'));
    await fireEvent.press(screen.getByTestId('tools-track-loan'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/money',
      params: expect.objectContaining({
        segment: 'subscriptions',
        source: 'calculator',
        kind: 'loan',
        principal: '500000.00',
        ratePct: '10.5',
        totalEmis: '60',
      }),
    });
  });
});
