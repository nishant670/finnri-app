import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { TransactionSubscriptionFields } from '@/components/transactions/TransactionSubscriptionFields';

const baseForm = {
  title: 'Netflix',
  merchant: 'Netflix India',
  amount: '649',
  category: 'Entertainment',
  date: '10 October 2026',
  subscriptionEnabled: false,
  subscriptionName: '',
  subscriptionAmount: '',
  subscriptionMerchant: '',
  subscriptionCategory: '',
  subscriptionBillingInterval: '',
  subscriptionNextDueDate: '',
  subscriptionReminderDays: '',
  subscriptionAutopay: false,
  subscriptionCancelBeforeDue: false,
  subscriptionCancelOnDate: '',
  subscriptionNotes: '',
} as unknown as EntryForm;

let latest: EntryForm = baseForm;

const setup = async (overrides: Partial<EntryForm> = {}) => {
  const onOpenNextPaymentDatePicker = jest.fn();
  const onOpenCancellationDatePicker = jest.fn();
  function Harness() {
    const [form, setForm] = useState<EntryForm>({ ...baseForm, ...overrides });
    latest = form;
    return (
      <TransactionSubscriptionFields
        form={form}
        setForm={setForm}
        onOpenNextPaymentDatePicker={onOpenNextPaymentDatePicker}
        onOpenCancellationDatePicker={onOpenCancellationDatePicker}
      />
    );
  }
  const screen = await render(<Harness />);
  return { screen, onOpenNextPaymentDatePicker, onOpenCancellationDatePicker };
};

describe('TransactionSubscriptionFields', () => {
  it('stays collapsed until the switch is turned on', async () => {
    const { screen } = await setup();
    expect(screen.getByText('Add subscription')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Subscription name')).toBeNull();
  });

  it('prefills name, amount and category from the payment when turned on', async () => {
    const { screen } = await setup();
    await fireEvent.press(screen.getByRole('switch'));
    expect(latest.subscriptionEnabled).toBe(true);
    expect(latest.subscriptionName).toBe('Netflix India');
    expect(latest.subscriptionAmount).toBe('649');
    expect(latest.subscriptionCategory).toBe('Entertainment');
    expect(screen.getByPlaceholderText('Subscription name')).toBeTruthy();
  });

  it('does not overwrite details the user already typed', async () => {
    const { screen } = await setup({ subscriptionName: 'Mine', subscriptionAmount: '99' });
    await fireEvent.press(screen.getByRole('switch'));
    expect(latest.subscriptionName).toBe('Mine');
    expect(latest.subscriptionAmount).toBe('99');
  });

  it('keeps only numeric characters in the amount and reminder days', async () => {
    const { screen } = await setup({
      subscriptionEnabled: true,
      subscriptionBillingInterval: 'monthly',
    });
    await fireEvent.changeText(screen.getByPlaceholderText('Amount'), '1,2a.5');
    expect(latest.subscriptionAmount).toBe('12.5');
    await fireEvent.changeText(screen.getByPlaceholderText('Days'), '4d');
    expect(latest.subscriptionReminderDays).toBe('4');
  });

  it('infers the next date and a 3-day reminder when an interval is chosen', async () => {
    const { screen } = await setup({ subscriptionEnabled: true });
    await fireEvent.press(screen.getByText('monthly'));
    expect(latest.subscriptionBillingInterval).toBe('monthly');
    expect(latest.subscriptionNextDueDate).not.toBe('');
    expect(latest.subscriptionReminderDays).toBe('3');
  });

  it('forces autopay and no reminder for a daily interval', async () => {
    const { screen } = await setup({ subscriptionEnabled: true });
    await fireEvent.press(screen.getByText('daily'));
    expect(latest.subscriptionAutopay).toBe(true);
    expect(latest.subscriptionReminderDays).toBe('0');
    expect(screen.getByText('Runs every day automatically.')).toBeTruthy();
    expect(screen.queryByTestId('subscription-next-payment-picker')).toBeNull();
  });

  it('explains market days for existing business-daily rows', async () => {
    const { screen } = await setup({
      subscriptionEnabled: true,
      subscriptionBillingInterval: 'business_daily',
    });
    expect(screen.getByText('Next market day; weekends and holidays are skipped.')).toBeTruthy();
  });

  it('asks the sheet to open the date pickers rather than owning them', async () => {
    const { screen, onOpenNextPaymentDatePicker, onOpenCancellationDatePicker } = await setup({
      subscriptionEnabled: true,
      subscriptionBillingInterval: 'monthly',
      subscriptionCancelBeforeDue: true,
    });
    await fireEvent.press(screen.getByTestId('subscription-next-payment-picker'));
    expect(onOpenNextPaymentDatePicker).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Cancellation reminder date'));
    expect(onOpenCancellationDatePicker).toHaveBeenCalledTimes(1);
  });

  it('toggles autopay and the cancel reminder', async () => {
    const { screen } = await setup({ subscriptionEnabled: true });
    await fireEvent.press(screen.getByText('Autopay'));
    expect(latest.subscriptionAutopay).toBe(true);
    expect(screen.queryByText('Cancellation reminder date')).toBeNull();
    await fireEvent.press(screen.getByText('Remind me to cancel'));
    expect(latest.subscriptionCancelBeforeDue).toBe(true);
    expect(screen.getByText('Cancellation reminder date')).toBeTruthy();
  });
});
