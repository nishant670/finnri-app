import {
  buildTransactionPayload,
  entryToComposerForm,
  saveNewTransaction,
  type TransactionSaveProgress,
} from '@/lib/transaction-composer';
import {
  billToComposerForm,
  billToSplitSelection,
  buildSplitBillPayload,
} from '@/lib/split-composer';
import { computeSplitShares, splitParticipantKeys } from '@/lib/split-preferences';
import { createEntry } from '@/lib/entries';
import { createSubscription } from '@/lib/subscriptions';
import { createCardEMIPlan } from '@/lib/emi-plans';
import { resolveAttachmentForSave } from '@/lib/uploads';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { SplitBill } from '@/lib/splits';

jest.mock('@/lib/entries', () => ({ createEntry: jest.fn() }));
jest.mock('@/lib/subscriptions', () => ({ createSubscription: jest.fn() }));
jest.mock('@/lib/emi-plans', () => ({ createCardEMIPlan: jest.fn() }));
jest.mock('@/lib/uploads', () => ({ resolveAttachmentForSave: jest.fn() }));

const form = (overrides: Partial<EntryForm> = {}): EntryForm => ({
  title: ' Dinner ',
  amount: '1000.50',
  type: 'Expense',
  mode: 'UPI',
  category: 'Food & Drinks',
  date: '19 September 2026',
  time: '8:30 PM',
  notes: ' Group dinner ',
  tag: 'General',
  currency: 'INR',
  accountId: 2,
  account: 'Bank',
  merchant: ' Cafe ',
  attachment: 'file://receipt.jpg',
  splitEnabled: true,
  splitGroupId: 9,
  splitGroupName: '',
  splitParticipants: [
    { friendId: 3, friendName: 'Riya', shareAmount: '400.25', direction: 'friend_owes_user' },
  ],
  refundableAmount: '',
  refundExpectedOn: '',
  refundReminderEnabled: true,
  emiTenureMonths: '',
  emiRatePct: '',
  subscriptionEnabled: false,
  subscriptionName: '',
  subscriptionMerchant: '',
  subscriptionCategory: '',
  subscriptionAmount: '',
  subscriptionBillingInterval: '',
  subscriptionNextDueDate: '',
  subscriptionReminderDays: '3',
  subscriptionCancelBeforeDue: false,
  subscriptionCancelOnDate: '',
  subscriptionAutopay: false,
  subscriptionNotes: '',
  ...overrides,
});
const bill = (overrides: Partial<SplitBill> = {}): SplitBill => ({
  id: 7,
  user_id: 1,
  title: 'Dinner',
  total_amount: 1000.5,
  currency: 'INR',
  date: '2026-09-19',
  participants: [
    {
      id: 1,
      user_id: 1,
      bill_id: 7,
      friend_id: 3,
      share_amount: 400.25,
      direction: 'friend_owes_user',
    },
  ],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(resolveAttachmentForSave)
    .mockResolvedValue('https://example.com/uploads/receipt.jpg');
  jest.mocked(createEntry).mockResolvedValue({ id: 20 });
  jest.mocked(createSubscription).mockResolvedValue({ id: 30 } as never);
  jest.mocked(createCardEMIPlan).mockResolvedValue({ id: 40 } as never);
});

it('uses the same complete mapping for Home and an entry-backed split, including refunds', async () => {
  const payload = await buildTransactionPayload(
    'token',
    form({ tag: 'Refundable', refundableAmount: '100', refundExpectedOn: '2026-10-01' }),
    { refundStatus: 'received' }
  );
  expect(payload).toMatchObject({
    title: 'Dinner',
    mode: 'UPI',
    account_id: 2,
    merchant: 'Cafe',
    category: 'Food & Drinks',
    date: '2026-09-19',
    time: '20:30',
    notes: 'Group dinner',
    attachment: 'https://example.com/uploads/receipt.jpg',
    refundable_amount: '100',
    refund_expected_on: '2026-10-01',
    refund_status: 'received',
    split: {
      group_id: 9,
      participants: [{ friend_id: 3, share_amount: '400.25', direction: 'friend_owes_user' }],
    },
  });
  expect(payload.refund_reminder_at).toBeTruthy();
});

it('does not create a transaction if the receipt upload fails', async () => {
  jest.mocked(resolveAttachmentForSave).mockRejectedValueOnce(new Error('Upload failed'));
  await expect(
    saveNewTransaction({ token: 'token', form: form(), account: null, idempotencyKey: 'attempt-1' })
  ).rejects.toThrow('Upload failed');
  expect(createEntry).not.toHaveBeenCalled();
});

it('preserves Income and does not send split allocations for an income', async () => {
  const payload = await buildTransactionPayload('token', form({ type: 'Income' }));
  expect(payload.type).toBe('income');
  expect(payload.split).toBeUndefined();
});

it('retries the failed follow-up without repeating a saved entry or EMI conversion', async () => {
  jest
    .mocked(createSubscription)
    .mockRejectedValueOnce(new Error('Subscription failed'))
    .mockResolvedValueOnce({ id: 30 } as never);
  const progress: TransactionSaveProgress = {};
  const args = {
    token: 'token',
    form: form({
      tag: 'EMI',
      emiTenureMonths: '12',
      subscriptionEnabled: true,
      subscriptionName: 'Plan',
      subscriptionBillingInterval: 'monthly',
      subscriptionNextDueDate: '2026-10-19',
    }),
    account: {
      id: 2,
      type: 'credit_card' as const,
      name: 'Card',
      color: '#fff',
      is_default: false,
    },
    idempotencyKey: 'attempt-1',
    progress,
  };
  await expect(saveNewTransaction(args)).rejects.toThrow('Subscription failed');
  await saveNewTransaction(args);
  expect(createEntry).toHaveBeenCalledTimes(1);
  expect(createCardEMIPlan).toHaveBeenCalledTimes(1);
  expect(createSubscription).toHaveBeenCalledTimes(2);
});

it('round-trips standalone payment details without an account or personal transaction', () => {
  const payload = buildSplitBillPayload(
    form(),
    9,
    bill().participants,
    'https://example.com/receipt'
  );
  expect(payload).toMatchObject({
    mode: 'UPI',
    category: 'Food & Drinks',
    merchant: 'Cafe',
    tag: 'General',
    time: '20:30',
    attachment: 'https://example.com/receipt',
  });
  expect(payload).not.toHaveProperty('account_id');
  expect(billToComposerForm(bill({ ...payload }))).toMatchObject({
    mode: 'UPI',
    merchant: 'Cafe',
    amount: '1000.5',
    time: '20:30',
  });
  expect(
    entryToComposerForm({
      account_id: 9,
      mode: 'Debit Card',
      tag: 'Refundable',
      refundable_amount: 75,
      refund_expected_on: '2026-10-01',
    })
  ).toMatchObject({
    accountId: 9,
    mode: 'Debit Card',
    refundableAmount: '75',
    refundExpectedOn: '2026-10-01',
  });
});

it.each(['friend_owes_user', 'user_owes_friend'] as const)(
  'reopening an unequal %s split preserves the exact debt to the paise',
  (direction) => {
    const saved = bill();
    saved.participants[0].direction = direction;
    const selection = billToSplitSelection(saved);
    const shares = computeSplitShares({
      amount: saved.total_amount,
      tab: selection.tab,
      keys: splitParticipantKeys(selection),
      weights: selection.weights,
    });
    expect(shares.ok).toBe(true);
    if (!shares.ok) return;
    expect(shares.shares[direction === 'friend_owes_user' ? '3' : 'me']).toBe(400.25);
  }
);

it('refuses changed inputs after a partial save instead of silently reusing a different transaction', async () => {
  jest.mocked(createSubscription).mockRejectedValueOnce(new Error('Try again'));
  const progress: TransactionSaveProgress = {};
  const args = {
    token: 'token',
    account: null,
    idempotencyKey: 'attempt-2',
    progress,
    form: form({
      subscriptionEnabled: true,
      subscriptionBillingInterval: 'monthly',
      subscriptionName: 'Plan',
    }),
  };
  await expect(saveNewTransaction(args)).rejects.toThrow('Try again');
  await expect(
    saveNewTransaction({ ...args, form: { ...args.form, amount: '2000' } })
  ).rejects.toThrow('already been saved');
  expect(createEntry).toHaveBeenCalledTimes(1);
});
