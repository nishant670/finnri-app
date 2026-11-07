import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

import {
  TransactionFormModal,
  type AiReviewMetadata,
  type EntryForm,
} from '@/components/transactions/TransactionFormModal';
import { AppDialogProvider } from '@/components/ui/AppDialogProvider';
import type { Account } from '@/lib/accounts';
import { notePaymentCorrection } from '@/lib/payment-rule-offer';
import { fetchPaymentSuggestion, type PaymentSuggestionResult } from '@/lib/payment-rules';

jest.mock('@/lib/payment-rules', () => ({
  ...jest.requireActual('@/lib/payment-rules'),
  fetchPaymentSuggestion: jest.fn(),
}));
jest.mock('@/lib/payment-rule-offer', () => ({
  notePaymentCorrection: jest.fn().mockResolvedValue('counted'),
}));

const mockedFetch = fetchPaymentSuggestion as jest.MockedFunction<typeof fetchPaymentSuggestion>;
const mockedNote = notePaymentCorrection as jest.MockedFunction<typeof notePaymentCorrection>;

const cash: Account = { id: 1, type: 'cash', name: 'Cash', color: '#2ECC71', is_default: true };
const upi: Account = { id: 2, type: 'upi', name: 'HDFC UPI', color: '#00D2B4', is_default: true };
const bpcl: Account = { id: 5, type: 'credit_card', name: 'SBI BPCL', color: '#1E88E5' };
const oneCard: Account = { id: 6, type: 'credit_card', name: 'One Card', color: '#111111' };

// The bill from 2026-11-06: read as Petrol at Bharat Petroleum, with no word on
// how it was paid, so the API filled in Cash.
const pumpBill: Partial<EntryForm> = {
  title: 'Petrol',
  amount: '3927.54',
  type: 'Expense',
  mode: 'Cash',
  category: 'Transport',
  date: '9 October 2026',
  time: '10:30 PM',
  notes: '38.46 liters of petrol',
  tag: 'Fuel',
  currency: 'INR',
  accountId: 1,
  account: 'Cash',
  merchant: 'Bharat Petroleum',
  attachment: null,
};

const scanned: AiReviewMetadata = {
  inputSource: 'receipt',
  modeSource: 'default',
  missingFields: ['mode'],
};

const fuelHabit: PaymentSuggestionResult = {
  suggestion: { account_id: 5, source: 'habit', label: 'fuel', matched: 3, total: 3 },
  kind: { key: 'f:fuel', label: 'fuel' },
};

const renderSheet = async ({
  initialData = pumpBill,
  aiReview = scanned,
  mode = 'audio' as const,
  accounts = [cash, upi, bpcl, oneCard],
}: {
  initialData?: Partial<EntryForm>;
  aiReview?: AiReviewMetadata;
  mode?: 'audio' | 'manual';
  accounts?: Account[];
} = {}) => {
  const onSave = jest.fn<Promise<void>, [EntryForm]>().mockResolvedValue(undefined);
  const utils = await render(
    <AppDialogProvider>
      <TransactionFormModal
        visible
        authToken="t"
        mode={mode}
        initialData={initialData}
        aiReview={aiReview}
        accounts={accounts}
        onSave={onSave}
        onClose={jest.fn()}
      />
    </AppDialogProvider>
  );
  return { ...utils, onSave };
};

beforeEach(() => {
  mockedFetch.mockReset();
  mockedNote.mockClear();
});

describe('payment rules and habits in the add sheet', () => {
  it('puts a scanned pump bill on the fuel card, and says why', async () => {
    mockedFetch.mockResolvedValue(fuelHabit);
    const { findByTestId, queryByText, onSave } = await renderSheet();

    expect(await findByTestId('entry-payment-pick-reason', {}, { timeout: 2000 })).toHaveTextContent(
      'You usually pay fuel with SBI BPCL (3 of 3)'
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      't',
      { type: 'Expense', title: 'Petrol', merchant: 'Bharat Petroleum', tag: 'Fuel' },
      expect.anything()
    );
    expect(await findByTestId('entry-account-picker')).toHaveProp(
      'accessibilityLabel',
      'Paid with Credit Card · SBI BPCL'
    );
    // Filled from the user's own history: not left flagged as a guess.
    expect(queryByText('Check')).toBeNull();

    await fireEvent.press(await findByTestId('entry-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ mode: 'Credit Card', accountId: 5, account: 'SBI BPCL' })
    );
    // Nothing was corrected, so nothing counts towards "Always use …?".
    expect(mockedNote).not.toHaveBeenCalled();
  });

  it('flags how a bill was paid when no rule or habit knows', async () => {
    mockedFetch.mockResolvedValue({ suggestion: null, kind: { key: 'f:fuel', label: 'fuel' } });
    const { findByText, findByTestId, queryByTestId } = await renderSheet();

    expect(await findByText('Check')).toBeTruthy();
    expect(within(await findByTestId('entry-account-picker')).getByText('Check')).toBeTruthy();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(queryByTestId('entry-payment-pick-reason')).toBeNull();
  });

  it('keeps an account the bill named', async () => {
    mockedFetch.mockResolvedValue(fuelHabit);
    const { findByTestId, queryByTestId } = await renderSheet({
      initialData: { ...pumpBill, mode: 'Credit Card', accountId: 6, account: 'One Card' },
      aiReview: { inputSource: 'receipt', modeSource: 'read', accountNamed: true },
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(queryByTestId('entry-payment-pick-reason')).toBeNull();
    expect(await findByTestId('entry-account-picker')).toHaveProp('accessibilityLabel', 'Paid with Credit Card · One Card');
  });

  it('keeps to the mode a bill printed', async () => {
    // The bill said UPI; a card habit does not overrule it.
    mockedFetch.mockResolvedValue(fuelHabit);
    const { findByTestId, queryByTestId } = await renderSheet({
      initialData: { ...pumpBill, mode: 'UPI', accountId: 2, account: 'HDFC UPI' },
      aiReview: { inputSource: 'receipt', modeSource: 'read' },
    });

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(queryByTestId('entry-payment-pick-reason')).toBeNull();
    expect(await findByTestId('entry-account-picker')).toHaveProp('accessibilityLabel', 'Paid with UPI · HDFC UPI');
  });

  it('counts a by-hand move to another account towards "Always use …?"', async () => {
    mockedFetch.mockResolvedValue({ suggestion: null, kind: { key: 'f:fuel', label: 'fuel' } });
    const { findByTestId, onSave } = await renderSheet();
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());

    // One "Paid with" sheet: picking the card sets the mode and the account.
    await fireEvent.press(await findByTestId('entry-account-picker'));
    await fireEvent.press(await findByTestId('payment-account-5'));
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ accountId: 5 }));
    await waitFor(() =>
      expect(mockedNote).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 't',
          kind: { key: 'f:fuel', label: 'fuel' },
          accountId: 5,
          accountName: 'SBI BPCL',
        })
      )
    );
  });

  it('takes the pick back when the title stops matching', async () => {
    mockedFetch.mockImplementation(async (_token, draft) =>
      draft.title === 'Petrol' ? fuelHabit : { suggestion: null, kind: null }
    );
    const { findByTestId, queryByTestId } = await renderSheet();
    expect(await findByTestId('entry-payment-pick-reason', {}, { timeout: 2000 })).toBeTruthy();

    await fireEvent.changeText(await findByTestId('entry-title-input'), 'Lunch');
    await waitFor(() => expect(queryByTestId('entry-payment-pick-reason')).toBeNull(), { timeout: 2000 });
    expect(await findByTestId('entry-account-picker')).toHaveProp('accessibilityLabel', 'Paid with Cash');
  });

  it('picks the card as "Petrol" is typed into a new manual expense', async () => {
    mockedFetch.mockImplementation(async (_token, draft) =>
      /petrol/i.test(draft.title) ? fuelHabit : { suggestion: null, kind: null }
    );
    const { findByTestId, onSave } = await renderSheet({
      mode: 'manual',
      aiReview: undefined,
      initialData: {
        ...pumpBill,
        title: '',
        amount: '',
        merchant: '',
        tag: 'General',
        notes: '',
        category: 'Food & Drinks',
        accountId: null,
        account: '',
      },
    });

    await fireEvent.changeText(await findByTestId('entry-title-input'), 'Petrol');
    for (const digit of '500') {
      await fireEvent.press(await findByTestId(`amount-key-${digit}`));
    }
    await waitFor(
      () =>
        expect(mockedFetch).toHaveBeenCalledWith('t', expect.objectContaining({ title: 'Petrol' }), expect.anything()),
      { timeout: 2000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'Petrol', mode: 'Credit Card', accountId: 5 })
    );
  });
});

describe('payment picks and the last-used default', () => {
  it('does not remember an auto-picked card as the next expense default', async () => {
    const { lastPaymentFor, resetLastPaymentForTests } = jest.requireActual('@/lib/last-payment');
    resetLastPaymentForTests();
    mockedFetch.mockResolvedValue(fuelHabit);
    const { findByTestId, onSave } = await renderSheet();
    expect(await findByTestId('entry-payment-pick-reason', {}, { timeout: 2000 })).toBeTruthy();
    await fireEvent.press(await findByTestId('entry-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(lastPaymentFor('Expense')?.accountId).not.toBe(5);
  });
});
