import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import type { DraftFieldKey } from '@/lib/ai-draft-review';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { TransactionDraftField } from '@/components/transactions/TransactionDraftField';

const baseForm = {
  type: 'Expense',
  title: 'Lunch',
  merchant: 'Cafe',
  notes: '',
  tag: 'General',
  mode: 'UPI',
  account: 'Salary UPI',
  date: '10 October 2026',
  time: '1:30 PM',
  category: 'Food & Drinks',
} as unknown as EntryForm;

let latest: EntryForm = baseForm;

const setup = async (
  field: DraftFieldKey,
  props: Partial<React.ComponentProps<typeof TransactionDraftField>> = {},
  formOverrides: Partial<EntryForm> = {}
) => {
  const handlers = {
    onChecked: jest.fn(),
    onSwitchType: jest.fn(),
    onOpenCategoryPicker: jest.fn(),
    onOpenModePicker: jest.fn(),
    onOpenAccountPicker: jest.fn(),
    onOpenDatePicker: jest.fn(),
  };
  function Harness() {
    const [form, setForm] = useState<EntryForm>({ ...baseForm, ...formOverrides });
    latest = form;
    return (
      <TransactionDraftField
        field={field}
        form={form}
        setForm={setForm}
        flagged={false}
        checked={false}
        paymentLanguage={{
          modeLabel: 'Paid via',
          modeAccessibilityPrefix: 'Paid via',
          accountLabel: 'Paid from account',
          accountAccessibilityPrefix: 'Paid from',
        }}
        category="Food & Drinks"
        categoryVisual={{ icon: 'food', color: '#F59E0B' }}
        dateLabel="Today"
        compatibleAccountCount={1}
        {...handlers}
        {...props}
      />
    );
  }
  const screen = await render(<Harness />);
  return { screen, ...handlers };
};

describe('TransactionDraftField', () => {
  it('renders nothing for the amount, which is the headline above the list', async () => {
    const { screen } = await setup('amount');
    expect(screen.toJSON()).toBeNull();
  });

  it('switches type, resets the category and marks the field checked', async () => {
    const { screen, onSwitchType, onChecked } = await setup('type');
    await fireEvent.press(screen.getByTestId('draft-type-income'));
    expect(latest.type).toBe('Income');
    expect(latest.category).not.toBe('Food & Drinks');
    expect(onSwitchType).toHaveBeenCalledWith(true);
    expect(onChecked).toHaveBeenCalledWith('type');
  });

  it('counts a text field as checked only when it is edited', async () => {
    const { screen, onChecked } = await setup('title');
    expect(onChecked).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('entry-title-input'), 'Dinner');
    expect(latest.title).toBe('Dinner');
    expect(onChecked).toHaveBeenCalledWith('title');
  });

  it('edits merchant and notes', async () => {
    const merchant = await setup('merchant');
    await fireEvent.changeText(merchant.screen.getByTestId('entry-merchant-input'), 'Diner');
    expect(latest.merchant).toBe('Diner');
    const notes = await setup('notes');
    await fireEvent.changeText(notes.screen.getByTestId('entry-notes-input'), 'with team');
    expect(latest.notes).toBe('with team');
    expect(notes.onChecked).toHaveBeenCalledWith('notes');
  });

  it('selects a tag', async () => {
    const { screen, onChecked } = await setup('tag');
    await fireEvent.press(screen.getByText('Lending'));
    expect(latest.tag).toBe('Lending');
    expect(onChecked).toHaveBeenCalledWith('tag');
  });

  it.each([
    ['category', 'entry-category-picker', 'onOpenCategoryPicker'],
    ['mode', 'entry-mode-picker', 'onOpenModePicker'],
    ['account', 'entry-account-picker', 'onOpenAccountPicker'],
    ['date', 'entry-date-picker', 'onOpenDatePicker'],
  ] as const)('opens the %s picker and counts it as checked', async (field, testID, opener) => {
    const handlers = await setup(field);
    await fireEvent.press(handlers.screen.getByTestId(testID));
    expect(handlers[opener]).toHaveBeenCalledTimes(1);
    expect(handlers.onChecked).toHaveBeenCalledWith(field);
  });

  it('words the mode and account rows for the entry type', async () => {
    const mode = await setup('mode');
    expect(mode.screen.getByText('Paid via')).toBeTruthy();
    expect(mode.screen.getByLabelText('Paid via UPI')).toBeTruthy();
    const account = await setup('account');
    expect(account.screen.getByLabelText('Paid from Salary UPI')).toBeTruthy();
  });

  it('prompts for an account, or for adding one when none match the mode', async () => {
    const some = await setup('account', {}, { account: '' });
    expect(some.screen.getByText('Select an account')).toBeTruthy();
    const none = await setup('account', { compatibleAccountCount: 0 }, { account: '' });
    expect(none.screen.getByText('Add a UPI account')).toBeTruthy();
    expect(none.screen.getByLabelText('Paid from no account yet')).toBeTruthy();
  });

  it('shows the date and time together', async () => {
    const { screen } = await setup('date');
    expect(screen.getByText('Today, 1:30 PM')).toBeTruthy();
  });

  it('shows the displayed category rather than the raw form value', async () => {
    const { screen } = await setup('category', { category: 'Groceries' });
    expect(screen.getByLabelText('Category Groceries')).toBeTruthy();
  });
});
