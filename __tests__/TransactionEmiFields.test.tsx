import { fireEvent, render } from '@testing-library/react-native';

import { TransactionEmiFields } from '@/components/transactions/TransactionEmiFields';
import type { EMILink } from '@/components/transactions/TransactionFormModal';
import type { EMICalculation } from '@/lib/emi';
import type { EMIPlan } from '@/lib/emi-plans';
import { formatMoney } from '@/lib/money';
import type { Subscription } from '@/lib/subscriptions';

type Props = React.ComponentProps<typeof TransactionEmiFields>;

const setup = async (overrides: Partial<Props> = {}) => {
  const handlers = {
    onChangeRepeat: jest.fn(),
    onChangeTotalInstalments: jest.fn(),
    onChangePaidInstalments: jest.fn(),
    onChangeTenure: jest.fn(),
    onChangeRate: jest.fn(),
  };
  const screen = await render(
    <TransactionEmiFields
      isEdit={false}
      emiLink={null}
      paymentMode="UPI"
      isCardConversion={false}
      canRepeat={false}
      repeatActive={false}
      nextDebit="1 November 2026"
      totalInstalments=""
      paidInstalments=""
      tenureMonths=""
      ratePct=""
      firstInstallment=""
      calculation={null}
      calculationError={null}
      isCalculating={false}
      {...handlers}
      {...overrides}
    />
  );
  return { screen, ...handlers };
};

const calculation = {
  principal_amount: 12000,
  tenure_months: 6,
  monthly_emi: 2000,
  total_interest: 0,
} as unknown as EMICalculation;

describe('TransactionEmiFields', () => {
  it('describes the saved state for each kind of payment', async () => {
    expect(
      (await setup({ paymentMode: 'Cash' })).screen.getByText(/Pick a bank or UPI account/)
    ).toBeTruthy();
    expect((await setup()).screen.getByText('Saved as an EMI-tagged payment.')).toBeTruthy();
    expect(
      (await setup({ canRepeat: true })).screen.getByText(/Saved as a normal payment/)
    ).toBeTruthy();
    expect(
      (await setup({ isCardConversion: true, cardName: 'HDFC' })).screen.getByText(
        'Convert this purchase on HDFC.'
      )
    ).toBeTruthy();
    expect(
      (await setup({ isCardConversion: true })).screen.getByText(
        'Convert this purchase on the selected card.'
      )
    ).toBeTruthy();
  });

  it('shows the linked plan and opens its schedule', async () => {
    const onOpen = jest.fn();
    const emiLink = {
      kind: 'plan',
      onOpen,
      plan: {
        monthly_amount: 2000,
        tenure_months: 6,
        annual_rate_pct: 0,
        progress: { installments_paid: 2, installments_total: 6, next_due_date: null },
      } as unknown as EMIPlan,
    } satisfies EMILink;
    const { screen } = await setup({ isEdit: true, emiLink });
    expect(screen.getByText('This purchase is on an EMI plan.')).toBeTruthy();
    expect(screen.getByTestId('emi-link-plan')).toBeTruthy();
    expect(screen.getByText(/No-cost/)).toBeTruthy();
    expect(screen.getByText('2 of 6 paid')).toBeTruthy();
    await fireEvent.press(screen.getByText('View full schedule'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the linked recurring EMI with its remaining instalments', async () => {
    const emiLink = {
      kind: 'recurring',
      subscription: {
        amount: 1500,
        total_instalments: 12,
        instalments_paid: 4,
        status: 'finished',
        next_due_date: '2026-11-01',
      } as unknown as Subscription,
    } satisfies EMILink;
    const { screen } = await setup({ isEdit: true, emiLink });
    expect(screen.getByText('This EMI repeats automatically.')).toBeTruthy();
    expect(screen.getByTestId('emi-link-recurring')).toBeTruthy();
    expect(screen.getByText(/4 of 12 paid · 8 left · finished/)).toBeTruthy();
  });

  it('ignores a link outside edit mode', async () => {
    const emiLink = {
      kind: 'recurring',
      subscription: { amount: 1, total_instalments: 0, instalments_paid: 0, status: 'active' },
    } as unknown as EMILink;
    expect((await setup({ emiLink })).screen.queryByTestId('emi-link-recurring')).toBeNull();
  });

  it('offers repeat for loan EMIs and reports the toggle', async () => {
    const { screen, onChangeRepeat } = await setup({ canRepeat: true });
    expect(screen.getByText('Repeats monthly (auto-debit)')).toBeTruthy();
    expect(screen.getByText('For loan EMIs the bank takes automatically.')).toBeTruthy();
    expect(screen.queryByText('Total EMIs')).toBeNull();
    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    expect(onChangeRepeat).toHaveBeenCalledWith(true);
  });

  it('asks for instalment counts once repeating, keeping digits only', async () => {
    const { screen, onChangeTotalInstalments, onChangePaidInstalments } = await setup({
      canRepeat: true,
      repeatActive: true,
    });
    expect(screen.getByText(/Next debit .*1 Nov 2026/)).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Leave empty if unknown'), '1a2b3c45');
    expect(onChangeTotalInstalments).toHaveBeenCalledWith('123');
    await fireEvent.changeText(screen.getByPlaceholderText('1 (this one)'), '7x');
    expect(onChangePaidInstalments).toHaveBeenCalledWith('7');
  });

  it('shows tenure, rate and the preview for a card conversion', async () => {
    const { screen, onChangeTenure, onChangeRate } = await setup({
      isCardConversion: true,
      tenureMonths: '6',
      firstInstallment: '12 Nov 2026',
      calculation,
    });
    await fireEvent.press(screen.getByText('12 mo'));
    expect(onChangeTenure).toHaveBeenCalledWith('12');
    await fireEvent.changeText(screen.getByPlaceholderText('0 for no-cost EMI'), '14');
    expect(onChangeRate).toHaveBeenCalledWith('14');
    expect(
      screen.getByText(
        new RegExp(
          `${formatMoney(12000)} ÷ 6 = ${formatMoney(2000)}/mo`.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          )
        )
      )
    ).toBeTruthy();
    expect(screen.getByText(/First instalment 12 Nov 2026 · No-cost EMI/)).toBeTruthy();
    expect(screen.getByText(/Saving replaces this purchase entry/)).toBeTruthy();
  });

  it('covers the calculating, error and empty previews', async () => {
    expect(
      (await setup({ isCardConversion: true, isCalculating: true })).screen.getByText(
        'Calculating schedule…'
      )
    ).toBeTruthy();
    expect(
      (
        await setup({ isCardConversion: true, calculationError: 'Rate is too high.' })
      ).screen.getByText('Rate is too high.')
    ).toBeTruthy();
    expect(
      (await setup({ isCardConversion: true })).screen.getByText(
        'Choose a tenure to preview the monthly schedule.'
      )
    ).toBeTruthy();
  });
});
