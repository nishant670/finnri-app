import { fireEvent, render } from '@testing-library/react-native';

import { SubscriptionAdvancedFields } from '@/components/money/subscriptions/SubscriptionAdvancedFields';
import { SubscriptionDatePickerModal } from '@/components/money/subscriptions/SubscriptionDatePickerModal';
import { SubscriptionInvestmentFields } from '@/components/money/subscriptions/SubscriptionInvestmentFields';
import { SubscriptionLoanFields } from '@/components/money/subscriptions/SubscriptionLoanFields';
import type { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';

jest.mock('@/lib/haptics', () => ({ haptics: { select: jest.fn(), saved: jest.fn() } }));

const colors = {
  text: '#111',
  background: '#fff',
  card: '#f5f5f5',
  border: '#ddd',
  accent: '#ff8865',
  secondary: '#eee',
} as unknown as ReturnType<typeof useThemeTokens>['colors'];

const fn = () => jest.fn();

describe('SubscriptionLoanFields', () => {
  const setup = async (over: Record<string, unknown> = {}) => {
    const h = {
      setAmount: fn(),
      setEmisPaid: fn(),
      setLender: fn(),
      setLoanType: fn(),
      setPrincipal: fn(),
      setRatePct: fn(),
      setTotalEmis: fn(),
      setProcessingFee: fn(),
      setForeclosurePct: fn(),
      openStartDatePicker: fn(),
    };
    const screen = await render(
      <SubscriptionLoanFields
        amount=""
        emisPaid=""
        lender=""
        loanType=""
        principal=""
        ratePct=""
        totalEmis=""
        processingFee=""
        foreclosurePct=""
        startDate=""
        loanSuggestion={{}}
        name=""
        colors={colors}
        muted="#999"
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('offers the loan fields and reports edits', async () => {
    const { screen, setLender, setPrincipal } = await setup();
    expect(screen.getByTestId('recurring-loan-fields')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('HDFC Bank, Bajaj Finance'), 'SBI');
    expect(setLender).toHaveBeenCalledWith('SBI');
    await fireEvent.changeText(screen.getByPlaceholderText('3,00,000'), '500000');
    expect(setPrincipal).toHaveBeenCalled();
  });

  it('toggles the loan type off when the selected one is pressed again', async () => {
    const { screen, setLoanType } = await setup({ loanType: 'home' });
    const pills = screen.getAllByRole('button');
    const selected = pills.find((p) => p.props.accessibilityState?.selected);
    expect(selected).toBeTruthy();
    await fireEvent.press(selected!);
    expect(setLoanType).toHaveBeenCalledWith('');
  });

  it('shows no suggestion until one exists', async () => {
    expect((await setup()).screen.queryByTestId('recurring-loan-suggestion')).toBeNull();
  });

  it('offers a worked-out EMI and fills only the figures the solver returned', async () => {
    const { screen, setAmount, setTotalEmis, setPrincipal } = await setup({
      loanSuggestion: { emi: 8885.4, months: 12 },
    });
    expect(screen.getByText(/EMI works out to/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('recurring-loan-suggestion'));
    expect(setAmount).toHaveBeenCalledWith('8885');
    expect(setTotalEmis).toHaveBeenCalledWith('12');
    expect(setPrincipal).not.toHaveBeenCalled();
  });

  it('words the other suggestions', async () => {
    expect(
      (await setup({ loanSuggestion: { months: 24 } })).screen.getByText('That is 24 EMIs. Use it')
    ).toBeTruthy();
    expect(
      (await setup({ loanSuggestion: { annualRatePct: 9.5 } })).screen.getByText(
        'Interest works out to 9.5% a year. Use it'
      )
    ).toBeTruthy();
  });

  it('opens the start-date picker', async () => {
    const { screen, openStartDatePicker } = await setup();
    await fireEvent.press(screen.getByLabelText('First EMI on'));
    expect(openStartDatePicker).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionInvestmentFields', () => {
  it('edits the platform and step-up, and opens the start-date picker', async () => {
    const h = { setPlatform: fn(), setStepUpPct: fn(), openStartDatePicker: fn() };
    const screen = await render(
      <SubscriptionInvestmentFields
        platform=""
        startDate=""
        stepUpPct=""
        colors={colors}
        muted="#999"
        {...h}
      />
    );
    expect(screen.getByTestId('recurring-investment-fields')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Zerodha Coin, Groww, Post office'),
      'Groww'
    );
    expect(h.setPlatform).toHaveBeenCalledWith('Groww');
    await fireEvent.changeText(screen.getByPlaceholderText('10'), '12');
    expect(h.setStepUpPct).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Started on'));
    expect(h.openStartDatePicker).toHaveBeenCalledTimes(1);
  });
});

describe('SubscriptionAdvancedFields', () => {
  const upi = { id: 1, type: 'upi', name: 'GPay', is_default: true } as Account;
  const setup = async (over: Record<string, unknown> = {}) => {
    const h = {
      setAccountID: fn(),
      setAutopay: fn(),
      setCancelBeforeDue: fn(),
      setCategory: fn(),
      setInterval: fn(),
      setName: fn(),
      setNotes: fn(),
      setPaymentMode: fn(),
      setReminderDays: fn(),
      setStatus: fn(),
      onAddAccount: fn(),
      openCancellationDatePicker: fn(),
    };
    const screen = await render(
      <SubscriptionAdvancedFields
        accountID={null}
        accounts={[upi]}
        autopay={false}
        cancelBeforeDue={false}
        cancelOnDate=""
        category="Entertainment"
        interval="monthly"
        isEditing={false}
        merchant="Netflix"
        name=""
        notes=""
        paymentMode="UPI"
        reminderDays={3}
        status="active"
        colors={colors}
        muted="#999"
        {...h}
        {...over}
      />
    );
    return { screen, ...h };
  };

  it('shows status only when editing', async () => {
    expect((await setup()).screen.queryByText('Status')).toBeNull();
    expect((await setup({ isEditing: true })).screen.getByText('Status')).toBeTruthy();
  });

  it('uses the merchant as the display-name placeholder', async () => {
    expect((await setup()).screen.getByPlaceholderText('Netflix')).toBeTruthy();
    expect(
      (await setup({ merchant: ' ' })).screen.getByPlaceholderText('Same as merchant')
    ).toBeTruthy();
  });

  it('picks a reminder lead time', async () => {
    const { screen, setReminderDays } = await setup();
    await fireEvent.press(screen.getByText('7 days before'));
    expect(setReminderDays).toHaveBeenCalledWith(7);
  });

  it('keeps the account choices hidden until Autopay is on, then lists them', async () => {
    const off = await setup();
    expect(off.screen.queryByText('Add a payment account')).toBeNull();
    const on = await setup({ autopay: true });
    expect(on.screen.getByText('GPay')).toBeTruthy();
    await fireEvent.press(on.screen.getByText('GPay'));
    expect(on.setAccountID).toHaveBeenCalledWith(1);
    await fireEvent.press(on.screen.getByText('Bank Account'));
    expect(on.setPaymentMode).toHaveBeenCalledWith('Bank Account');
    expect(on.setAccountID).toHaveBeenCalledWith(null);
    await fireEvent.press(on.screen.getByText('Add a payment account'));
    expect(on.onAddAccount).toHaveBeenCalledTimes(1);
  });

  it('opens the cancellation date only when reminders are on', async () => {
    expect((await setup()).screen.queryByText('Cancellation reminder date')).toBeNull();
    const on = await setup({ cancelBeforeDue: true });
    await fireEvent.press(on.screen.getByText('Cancellation reminder date'));
    expect(on.openCancellationDatePicker).toHaveBeenCalledTimes(1);
  });

  it('edits notes', async () => {
    const { screen, setNotes } = await setup();
    await fireEvent.changeText(
      screen.getByPlaceholderText('Plan tier, cancellation link, family plan details'),
      'family'
    );
    expect(setNotes).toHaveBeenCalledWith('family');
  });
});

describe('SubscriptionDatePickerModal', () => {
  const setup = async (target: 'due' | 'cancel' | 'start') => {
    const h = { onChangePendingDate: fn(), onClose: fn(), onDone: fn() };
    const screen = await render(
      <SubscriptionDatePickerModal
        visible
        target={target}
        pendingDate={new Date(2026, 9, 7)}
        colors={colors}
        muted="#999"
        {...h}
      />
    );
    return { screen, ...h };
  };

  it('titles itself for what is being picked', async () => {
    expect((await setup('due')).screen.getByText('Next payment on')).toBeTruthy();
    expect((await setup('cancel')).screen.getByText('Cancellation reminder')).toBeTruthy();
    expect((await setup('start')).screen.getByText('Started on')).toBeTruthy();
  });

  it('cancels and confirms', async () => {
    const { screen, onClose, onDone } = await setup('due');
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
