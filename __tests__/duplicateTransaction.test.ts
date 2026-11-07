import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { Account } from '@/lib/accounts';
import { createEntry } from '@/lib/entries';
import {
  DuplicateSaveCancelled,
  describeLikelyDuplicate,
  findLikelyDuplicate,
  saveNewTransaction,
} from '@/lib/transaction-composer';
import { loadTransactionPage, mapEntryToTransaction } from '@/lib/transactions';

jest.mock('@/lib/transactions', () => ({
  ...jest.requireActual('@/lib/transactions'),
  loadTransactionPage: jest.fn(),
}));
jest.mock('@/lib/entries', () => ({
  ...jest.requireActual('@/lib/entries'),
  createEntry: jest.fn(),
}));
jest.mock('@/lib/uploads', () => ({
  resolveAttachmentForSave: jest.fn(async () => null),
}));

const mockedLoad = loadTransactionPage as jest.MockedFunction<typeof loadTransactionPage>;
const mockedCreate = createEntry as jest.MockedFunction<typeof createEntry>;

const emi: EntryForm = {
  title: 'HSBC loan EMI',
  time: '11:09 PM',
  amount: '20,938',
  type: 'Expense',
  mode: 'Bank Account',
  category: 'Bills',
  date: '15 October 2026',
  notes: '',
  tag: 'General',
  currency: 'INR',
  accountId: 3,
  account: 'SBI Bank',
  merchant: '',
  attachment: null,
  splitEnabled: false,
  splitGroupId: null,
  splitGroupName: '',
  splitParticipants: [],
  refundableAmount: '',
  refundExpectedOn: '',
  refundReminderEnabled: false,
  emiTenureMonths: '',
  emiRatePct: '',
  emiTotalInstalments: '',
  emiPaidInstalments: '',
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
};

const sbi = { id: 3, name: 'SBI Bank', type: 'bank' } as Account;

const logged = (overrides: Record<string, unknown> = {}) =>
  mapEntryToTransaction({
    id: 41,
    title: 'HSBC loan EMI',
    amount: 20938,
    type: 'expense',
    date: '2026-10-15',
    category: 'Misc',
    account_id: 3,
    account: { id: 3, name: 'SBI Bank' },
    ...overrides,
  } as never);

const serve = (...rows: ReturnType<typeof logged>[]) =>
  mockedLoad.mockResolvedValue({ transactions: rows, categoryCounts: {}, total: rows.length });

beforeEach(() => {
  mockedLoad.mockReset();
  mockedCreate.mockReset();
  mockedCreate.mockResolvedValue({ id: 42 } as never);
});

describe('findLikelyDuplicate', () => {
  it('asks the server for the same day, direction and rupee amount', async () => {
    serve();
    await findLikelyDuplicate('t', emi, 3);
    expect(mockedLoad).toHaveBeenCalledWith('t', expect.objectContaining({
      type: 'expense',
      start_date: '2026-10-15',
      end_date: '2026-10-15',
      min_amount: 20937.5,
      max_amount: 20938.5,
    }));
  });

  // 2026-11-06 on device: "Car Fuel" ₹3,928 on the SBI BPCL card was logged
  // again from a scan as "Petrol", Bharat Petroleum, Cash — and saved silently.
  it('matches a same-day, same-amount bill that shares nothing else', async () => {
    const fuel = { ...emi, title: 'Petrol', merchant: 'Bharat Petroleum', amount: '3927.54', date: '9 October 2026' };
    serve(logged({
      id: 50, title: 'Car Fuel', merchant: 'Soami BPCL', amount: 3927.54,
      date: '2026-10-09', account_id: 12, account: { id: 12, name: 'SBI BPCL' },
    }));
    expect((await findLikelyDuplicate('t', fuel, 1))?.id).toBe('50');
  });

  it('treats a typed ₹3,928 and a scanned ₹3,927.54 as one amount', async () => {
    serve(logged({ title: 'Fuel', amount: 3927.54, account_id: 9, account: undefined }));
    expect(await findLikelyDuplicate('t', { ...emi, amount: '3,928' }, 3)).not.toBeNull();
  });

  it('ignores a row in the filter window that rounds to another rupee', async () => {
    serve(logged({ title: 'Laptop', amount: 20938.5, account_id: 9, account: undefined }));
    expect(await findLikelyDuplicate('t', emi, 3)).toBeNull();
  });

  it('under ₹100, still needs a shared title, merchant or account', async () => {
    const water = { ...emi, title: 'Water bottle', amount: '10' };
    serve(logged({ title: 'Chai', amount: 10, account_id: 9, account: undefined }));
    expect(await findLikelyDuplicate('t', water, 3)).toBeNull();
    serve(logged({ title: 'Chai', amount: 10 }));
    expect(await findLikelyDuplicate('t', water, 3)).not.toBeNull();
  });

  it('names the row that shares a detail when several match', async () => {
    serve(
      logged({ id: 60, title: 'Laptop', account_id: 9, account: undefined }),
      logged({ id: 61, title: 'Loan auto-debit' })
    );
    expect((await findLikelyDuplicate('t', emi, 3))?.id).toBe('61');
  });

  it('matches the same title in any case, even on another account', async () => {
    serve(logged({ title: 'hsbc  LOAN emi', account_id: 7, account: undefined }));
    expect(await findLikelyDuplicate('t', emi, 3)).not.toBeNull();
  });

  it('matches the same account when the title differs', async () => {
    serve(logged({ title: 'Loan auto-debit' }));
    expect(await findLikelyDuplicate('t', emi, 3)).not.toBeNull();
  });

  it('ignores a same-day row with a different amount', async () => {
    serve(logged({ title: 'Laptop', amount: 20940, account_id: 9, account: undefined }));
    expect(await findLikelyDuplicate('t', emi, 3)).toBeNull();
  });

  it('never blocks a save when the lookup fails', async () => {
    mockedLoad.mockRejectedValue(new Error('offline'));
    expect(await findLikelyDuplicate('t', emi, 3)).toBeNull();
  });
});

describe('saveNewTransaction with confirmDuplicate', () => {
  const save = (confirmDuplicate: jest.Mock, progress = {}) =>
    saveNewTransaction({
      token: 't',
      form: emi,
      account: sbi,
      idempotencyKey: 'k',
      progress,
      confirmDuplicate,
    });

  it('stops without saving when the user goes back', async () => {
    serve(logged());
    const confirm = jest.fn(async () => false);
    await expect(save(confirm)).rejects.toBeInstanceOf(DuplicateSaveCancelled);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('saves when the user says it is not a duplicate, and does not ask again on retry', async () => {
    serve(logged());
    const confirm = jest.fn(async () => true);
    const progress = {};
    mockedCreate.mockRejectedValueOnce(new Error('network'));
    await expect(save(confirm, progress)).rejects.toThrow('network');
    await save(confirm, progress);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledTimes(2);
  });

  it('does not warn on a retry after the first send, which may have saved the entry it would find', async () => {
    serve();
    const confirm = jest.fn(async () => true);
    const progress = {};
    mockedCreate.mockRejectedValueOnce(new Error('timeout'));
    await expect(save(confirm, progress)).rejects.toThrow('timeout');
    // The server did save it; the retry's lookup would now find it.
    serve(logged());
    await save(confirm, progress);
    expect(confirm).not.toHaveBeenCalled();
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledTimes(2);
  });

  it('saves without asking when nothing matches', async () => {
    serve();
    const confirm = jest.fn(async () => true);
    await save(confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });
});

it('names the logged transaction in the warning', () => {
  const { title, message } = describeLikelyDuplicate(logged());
  expect(title).toBe('Similar transaction found');
  expect(message).toContain('"HSBC loan EMI" for ₹20,938 from SBI Bank');
});
