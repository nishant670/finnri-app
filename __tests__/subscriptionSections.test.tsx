import { fireEvent, render } from '@testing-library/react-native';

import { SubscriptionAdvancedFields } from '@/components/money/subscriptions/SubscriptionAdvancedFields';
import { SubscriptionDatePickerModal } from '@/components/money/subscriptions/SubscriptionDatePickerModal';
import { SubscriptionInvestmentFields } from '@/components/money/subscriptions/SubscriptionInvestmentFields';
import { SubscriptionLoanFields } from '@/components/money/subscriptions/SubscriptionLoanFields';
import type { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { Account } from '@/lib/accounts';

jest.mock('@/lib/haptics', () => ({
  haptics: { select: jest.fn(), saved: jest.fn(), toggle: jest.fn() },
}));

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

  it('picks a loan type from its row, and clears it when the chosen one is picked again', async () => {
    const { screen, setLoanType } = await setup({ loanType: 'home' });
    await fireEvent.press(screen.getByTestId('recurring-loan-type'));
    const options = screen.getAllByRole('radio');
    const selected = options.find((option) => option.props.accessibilityState?.selected);
    expect(selected).toBeTruthy();
    await fireEvent.press(selected!);
    expect(setLoanType).toHaveBeenCalledWith('');

    await fireEvent.press(screen.getByTestId('recurring-loan-type'));
    await fireEvent.press(screen.getByText('Car'));
    expect(setLoanType).toHaveBeenLastCalledWith('car');
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
        formKind="subscription"
        interval="monthly"
        isEditing={false}
        merchant="Netflix"
        name=""
        notes=""
        paymentMode="UPI"
        reminderDays={3}
        status="active"
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
    await fireEvent.press(screen.getByTestId('recurring-reminder'));
    await fireEvent.press(screen.getByText('7 days before'));
    expect(setReminderDays).toHaveBeenCalledWith(7);
  });

  it('keeps the account choices hidden until Autopay is on, then lists them', async () => {
    const off = await setup();
    expect(off.screen.queryByText('Pay from')).toBeNull();
    const on = await setup({ autopay: true });
    expect(on.screen.getByText('Pay from')).toBeTruthy();
    await fireEvent.press(on.screen.getByText('Pay from'));
    await fireEvent.press(on.screen.getByText('GPay'));
    expect(on.setAccountID).toHaveBeenCalledWith(1);
    // The row; the closing sheet's title may still be mounted while it slides away.
    await fireEvent.press(on.screen.getAllByText('Pay from')[0]);
    await fireEvent.press(on.screen.getByText('Add a UPI account'));
    expect(on.onAddAccount).toHaveBeenCalledTimes(1);
  });

  // On device, "Bank Account" the mode and "Bank Account" the account read as
  // one question asked twice. The account is now a row under "Pay from".
  it('picks the default account of a mode, and says when there is none', async () => {
    const bank = { id: 2, type: 'bank', name: 'Bank Account' } as Account;
    const hdfc = { id: 3, type: 'bank', name: 'HDFC', is_default: true } as Account;
    const on = await setup({ autopay: true, accounts: [upi, bank, hdfc] });
    await fireEvent.press(on.screen.getByText('Pay via'));
    await fireEvent.press(on.screen.getByText('Bank Account'));
    expect(on.setPaymentMode).toHaveBeenCalledWith('Bank Account');
    expect(on.setAccountID).toHaveBeenLastCalledWith(3);

    const none = await setup({ autopay: true, paymentMode: 'Credit Card' });
    expect(none.screen.getByText('No credit card yet')).toBeTruthy();
    await fireEvent.press(none.screen.getByText('Pay from'));
    expect(none.screen.getByText('No credit card added yet.')).toBeTruthy();
  });

  it('has no second interval picker', async () => {
    const { screen } = await setup();
    expect(screen.queryByText('Other intervals')).toBeNull();
    expect(screen.queryByText('Daily')).toBeNull();
  });

  // "What are these categories about?" — asked of a PPF instalment.
  it('asks an investment for no spending category and no cancel reminder', async () => {
    const subscription = await setup();
    expect(subscription.screen.getByText('Category')).toBeTruthy();
    expect(subscription.screen.getByText('Remind me to cancel')).toBeTruthy();
    const investment = await setup({ formKind: 'investment', merchant: 'PPF' });
    expect(investment.screen.queryByText('Category')).toBeNull();
    expect(investment.screen.queryByText('Food & Drinks')).toBeNull();
    expect(investment.screen.queryByText('Remind me to cancel')).toBeNull();
    expect(investment.screen.getByPlaceholderText('Folio number, goal, nominee')).toBeTruthy();
    // An older item that already has it on can still turn it off.
    const legacy = await setup({ formKind: 'investment', cancelBeforeDue: true });
    expect(legacy.screen.getByText('Remind me to cancel')).toBeTruthy();
  });

  it('opens the cancellation date only when reminders are on', async () => {
    expect((await setup()).screen.queryByLabelText('Cancellation reminder date')).toBeNull();
    const on = await setup({ cancelBeforeDue: true });
    await fireEvent.press(on.screen.getByLabelText('Cancellation reminder date'));
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
