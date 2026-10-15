import { useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  AddExpenseModal,
  type ExpenseFlowScreen,
} from '@/components/split/expense/AddExpenseModal';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';

const initialData: Partial<EntryForm> = {
  title: 'Dinner',
  amount: '1000',
  type: 'Expense',
  mode: 'UPI',
  category: 'Food & Drinks',
  date: '19 September 2026',
  time: '8:30 PM',
  merchant: 'Cafe',
  notes: 'Trip',
  tag: 'General',
  accountId: 2,
};
const accounts = [
  { id: 2, type: 'upi' as const, name: 'My bank', is_default: true, color: '#fff' },
];
function Composer({
  onSave,
  personalPayment = true,
  isEdit = true,
  draft = initialData,
}: {
  onSave: jest.Mock;
  personalPayment?: boolean;
  isEdit?: boolean;
  draft?: Partial<EntryForm>;
}) {
  const [flowScreen, setFlowScreen] = useState<ExpenseFlowScreen>('expense');
  const [amount, setAmount] = useState('1000');
  return (
    <AddExpenseModal
      visible
      isEdit={isEdit}
      initialData={draft}
      accounts={accounts}
      amount={amount}
      onChangeAmount={setAmount}
      flowScreen={flowScreen}
      onChangeFlowScreen={setFlowScreen}
      personalPayment={personalPayment}
      payerLocked={false}
      groups={[]}
      selectedGroup={null}
      selectedGroupId={null}
      isGroupLocked={false}
      people={[
        { key: 'me', label: 'You', subtitle: '' },
        { key: '3', label: 'Riya', subtitle: '' },
      ]}
      selection={{
        selfKey: 'me',
        payerKey: personalPayment ? 'me' : '3',
        fullAmount: false,
        participantKeys: ['me', '3'],
        tab: 'equally',
        weights: {},
      }}
      onSelectGroup={jest.fn()}
      onSelectPayer={jest.fn()}
      onToggleParticipant={jest.fn()}
      onToggleAllParticipants={jest.fn()}
      onChangeAdjustSplitTab={jest.fn()}
      onChangeSplitWeight={jest.fn()}
      onApplySplit={() => setFlowScreen('expense')}
      onSave={onSave}
      onClose={jest.fn()}
    />
  );
}

it('infers new split expense categories from the collapsed title field', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const ui = await render(
    <Composer onSave={onSave} isEdit={false} draft={{ ...initialData, title: '', category: 'Misc' }} />
  );
  await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Metro ride');
  expect(await ui.findByLabelText('Category Transport')).toBeTruthy();
  await fireEvent.press(await ui.findByTestId('entry-save-button'));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Metro ride', category: 'Transport' }));
});

it('offers Home payment/account and optional fields in Split and saves their edits', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const ui = await render(<Composer onSave={onSave} />);
  expect(ui.queryByText('Income')).toBeNull();
  expect(await ui.findByTestId('entry-account-picker')).toBeTruthy();
  await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Birthday dinner');
  // The draft already has a merchant and a note, so both are fields; the tag
  // and receipt it does not have are offered as chips.
  await fireEvent.changeText(
    await ui.findByPlaceholderText('Merchant or store name'),
    'Restaurant'
  );
  await fireEvent.changeText(await ui.findByPlaceholderText('Add a note…'), 'With friends');
  await fireEvent.press(await ui.findByTestId('entry-add-tag'));
  await fireEvent.press(await ui.findByText('Lending'));
  expect(await ui.findByTestId('entry-add-receipt')).toBeTruthy();
  // A split composer owns its own allocation, so the sheet's split is not offered.
  expect(ui.queryByTestId('entry-add-split')).toBeNull();
  await fireEvent.press(await ui.findByTestId('entry-save-button'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toMatchObject({
    title: 'Birthday dinner',
    mode: 'UPI',
    accountId: 2,
    merchant: 'Restaurant',
    notes: 'With friends',
    tag: 'Lending',
  });
});

it('retains transaction edits while opening and returning from the allocation editor', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const ui = await render(<Composer onSave={onSave} />);
  await fireEvent.changeText(
    await ui.findByTestId('entry-title-input'),
    'Changed before allocation'
  );
  await fireEvent.press(await ui.findByLabelText(/Change split/));
  await fireEvent.press(await ui.findByText('More options'));
  await fireEvent.press(await ui.findByLabelText('Save'));
  expect((await ui.findByTestId('entry-title-input')).props.value).toBe(
    'Changed before allocation'
  );
});

it('keeps friend-paid expenses out of personal accounts and validates shared fields', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const ui = await render(<Composer onSave={onSave} personalPayment={false} />);
  expect(ui.queryByTestId('entry-account-picker')).toBeNull();
  await fireEvent.press(await ui.findByTestId('entry-add-tag'));
  expect(await ui.findByText('Refundable')).toBeTruthy();
  await fireEvent.press(await ui.findByText('Refundable'));
  expect(await ui.findByPlaceholderText('Merchant or store name')).toBeTruthy();
  await fireEvent.changeText(await ui.findByTestId('entry-amount-input'), '-1');
  await fireEvent.press(await ui.findByTestId('entry-save-button'));
  expect(onSave).not.toHaveBeenCalled();
  expect(await ui.findByText('Enter an amount above zero.')).toBeTruthy();
  await fireEvent.changeText(await ui.findByTestId('entry-amount-input'), '1000');
  await fireEvent.press(await ui.findByTestId('entry-save-button'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toMatchObject({
    accountId: null,
    subscriptionEnabled: false,
    mode: 'UPI',
    tag: 'Refundable',
  });
});

it('changes payment mode through the shared picker instead of forcing Cash', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const ui = await render(<Composer onSave={onSave} />);
  await fireEvent.press(await ui.findByText('UPI'));
  await fireEvent.press(await ui.findByText('Bank Account'));
  await fireEvent.press(await ui.findByTestId('entry-save-button'));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0]).toMatchObject({ mode: 'Bank Account', accountId: null });
});
