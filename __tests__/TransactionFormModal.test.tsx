import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
// Observe the mocked native calls; these tests never fire haptics directly.
// eslint-disable-next-line no-restricted-imports
import * as Haptics from 'expo-haptics';

import {
  TransactionFormModal,
  type EMILink,
  type EntryForm,
  type AiReviewMetadata,
} from '@/components/transactions/TransactionFormModal';
import type { Account, AccountSuggestion } from '@/lib/accounts';
import { formatDateLabel } from '@/lib/transactions';
import type { Transaction } from '@/types/transaction';

const recentEntry = (overrides: Partial<Transaction>): Transaction => ({
  id: '1',
  name: 'Entry',
  category: 'Food & Drinks',
  amount: -100,
  icon: 'silverware-fork-knife',
  section: 'Today',
  entryType: 'expense',
  ...overrides,
});

const cashAccount: Account = {
  id: 1,
  type: 'cash',
  name: 'Cash',
  color: '#2ECC71',
  is_default: true,
};

const upiAccount: Account = {
  id: 2,
  type: 'upi',
  name: 'HDFC UPI',
  color: '#00D2B4',
  is_default: true,
};

const completeInitialData: Partial<EntryForm> = {
  title: 'Lunch',
  amount: '250.00',
  type: 'Expense',
  mode: 'Cash',
  category: 'Food & Drinks',
  date: '11 July 2026',
  time: '1:30 PM',
  notes: '',
  tag: 'General',
  currency: 'INR',
  accountId: 1,
  account: 'Cash',
  merchant: 'Cafe',
  attachment: null,
};

const renderModal = async ({
  initialData = completeInitialData,
  accounts = [cashAccount],
  aiReview,
  mode = 'manual',
  isEdit,
  recentEntries,
  onSave = jest.fn().mockResolvedValue(undefined),
  onClose = jest.fn(),
  emiLink,
  accountMatches,
  newAccountSuggestion,
  onSetupSuggestedAccount,
}: {
  emiLink?: EMILink | null;
  accountMatches?: Account[];
  newAccountSuggestion?: AccountSuggestion | null;
  onSetupSuggestedAccount?: jest.Mock;
  initialData?: Partial<EntryForm>;
  accounts?: Account[];
  aiReview?: AiReviewMetadata;
  mode?: 'audio' | 'manual' | 'quick-prompt';
  isEdit?: boolean;
  recentEntries?: Transaction[];
  onSave?: jest.Mock<Promise<void>, [EntryForm]>;
  onClose?: jest.Mock;
} = {}) => {
  const result = await render(
    <TransactionFormModal
      visible
      initialData={initialData}
      onSave={onSave}
      onClose={onClose}
      mode={mode}
      isEdit={isEdit}
      aiReview={aiReview}
      accounts={accounts}
      recentEntries={recentEntries}
      emiLink={emiLink}
      accountMatches={accountMatches}
      newAccountSuggestion={newAccountSuggestion}
      onSetupSuggestedAccount={onSetupSuggestedAccount}
    />
  );

  return { ...result, onSave, onClose };
};

type FindByTestId = Awaited<ReturnType<typeof render>>['findByTestId'];

/** Taps digits on the custom keypad, left to right. */
const typeAmount = async (findByTestId: FindByTestId, digits: string): Promise<void> => {
  for (const digit of digits) {
    await fireEvent.press(await findByTestId(`amount-key-${digit}`));
  }
};

describe('TransactionFormModal', () => {
  it('saves edited confirmation fields', async () => {
    // The full form, not the amount-first capture path — that is what an edit
    // and an AI draft both render.
    const { findByTestId, onSave } = await renderModal({ isEdit: true });

    await fireEvent.changeText(await findByTestId('entry-title-input'), 'Team lunch');
    await fireEvent.changeText(await findByTestId('entry-amount-input'), '325.50');
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: 'Team lunch',
        amount: '325.50',
        accountId: 1,
      })
    );
  });

  it('shows AI uncertainty and clarification prompts', async () => {
    const { findByText } = await renderModal({
      mode: 'audio',
      aiReview: {
        missingFields: ['date', 'account_hint'],
        confidence: { merchant: 0.4 },
        clarifications: ['Which account paid for this?'],
      },
    });

    expect(await findByText('AI draft')).toBeTruthy();
    // The flagged fields are named by their own cards now, so the banner
    // carries the count and the trust line and nothing else.
    expect(await findByText('3 fields to check')).toBeTruthy();
    expect(await findByText('Which account paid for this?')).toBeTruthy();
    expect(await findByText('AI suggestions are never saved until you confirm.')).toBeTruthy();
  });

  it('preselects the compatible account for the payment mode', async () => {
    const { findByText } = await renderModal({
      accounts: [cashAccount, upiAccount],
      initialData: {
        ...completeInitialData,
        mode: 'UPI',
        accountId: null,
        account: '',
      },
    });

    expect(await findByText('HDFC UPI')).toBeTruthy();
  });

  it('keeps an account-less entry saveable when no compatible account exists', async () => {
    const { findByTestId, onSave } = await renderModal({
      mode: 'audio',
      accounts: [],
      initialData: {
        ...completeInitialData,
        mode: 'UPI',
        accountId: null,
        account: '',
      },
    });

    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ mode: 'UPI', accountId: null, account: '' })
    );
  });

  it('opens quick prompt creation without optional collection props', async () => {
    const { findByText } = await render(
      <TransactionFormModal
        visible
        initialData={{
          category: 'Food & Drinks',
          mode: 'Cash',
          type: 'Expense',
          date: '11 July 2026',
        }}
        onSave={jest.fn().mockResolvedValue(undefined)}
        onClose={jest.fn()}
        mode="quick-prompt"
      />
    );

    expect(await findByText('New quick prompt')).toBeTruthy();
  });

  describe('editing a quick prompt', () => {
    const paytm: Account = {
      id: 7,
      type: 'wallet',
      name: 'Paytm Wallet',
      color: '#00BAF2',
      is_default: true,
    };
    const amazon: Account = { id: 8, type: 'wallet', name: 'Amazon Pay', color: '#FF9900' };
    const metroPrompt: Partial<EntryForm> = {
      title: 'Metro Recharge',
      amount: '300',
      type: 'Expense',
      mode: 'Wallets',
      category: 'Travel',
      accountId: null,
      account: '',
      date: '11 July 2026',
    };

    it('offers the account picker, but no date and no receipt', async () => {
      // The report: switching a prompt to Wallets gave no way to say which one.
      const { findByTestId, queryByText } = await renderModal({
        mode: 'quick-prompt',
        isEdit: true,
        accounts: [cashAccount, paytm, amazon],
        initialData: metroPrompt,
      });

      expect(await findByTestId('entry-account-picker')).toBeTruthy();
      // A template is used on whatever day it is used; it has no date of its own.
      expect(queryByText('Date & Time')).toBeNull();
    });

    it('defaults to the wallet marked default, and saves the one picked instead', async () => {
      const { findByTestId, findByText, findAllByText, onSave } = await renderModal({
        mode: 'quick-prompt',
        isEdit: true,
        accounts: [cashAccount, paytm, amazon],
        initialData: metroPrompt,
      });

      expect(await findByText('Paytm Wallet')).toBeTruthy();

      await fireEvent.press(await findByTestId('entry-account-picker'));
      const amazonRows = await findAllByText('Amazon Pay');
      await fireEvent.press(amazonRows[amazonRows.length - 1]);
      await fireEvent.press(await findByTestId('entry-save-button'));

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave.mock.calls[0][0]).toEqual(
        expect.objectContaining({ mode: 'Wallets', accountId: 8, account: 'Amazon Pay' })
      );
    });

    it('keeps the wallet a prompt was saved with', async () => {
      const { findByText } = await renderModal({
        mode: 'quick-prompt',
        isEdit: true,
        accounts: [cashAccount, paytm, amazon],
        initialData: { ...metroPrompt, accountId: 8, account: 'Amazon Pay' },
      });

      expect(await findByText('Amazon Pay')).toBeTruthy();
    });
  });

  it('validates required fields before saving', async () => {
    const { findByTestId, findByText, onSave } = await renderModal({
      mode: 'audio',
      initialData: {
        ...completeInitialData,
        title: '',
      },
    });

    await fireEvent.press(await findByTestId('entry-save-button'));

    expect(await findByText('Add a title so you can spot this later.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('falls back blank category and date without blocking save', async () => {
    const { findByTestId, onSave } = await renderModal({
      mode: 'audio',
      aiReview: { missingFields: ['category', 'date'] },
      initialData: {
        ...completeInitialData,
        category: '',
        date: '',
      },
    });

    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        category: 'Misc',
        date: formatDateLabel(new Date()),
      })
    );
  });

  it('disables repeat submit while save is pending', async () => {
    let resolveSave: () => void = () => undefined;
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const onSave = jest.fn<Promise<void>, [EntryForm]>(() => pendingSave);
    const { findByTestId } = await renderModal({ onSave });
    const saveButton = await findByTestId('entry-save-button');

    const firstPress = fireEvent.press(saveButton);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(await findByTestId('entry-save-button')).toBeDisabled();

    await fireEvent.press(await findByTestId('entry-save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave();
      await firstPress;
    });
  });

  it('opens the subscription options when a folded setting refuses the save', async () => {
    const { findByTestId, findByText, onSave } = await renderModal({
      mode: 'audio',
      initialData: {
        ...completeInitialData,
        tag: 'Subscription',
        subscriptionEnabled: true,
        subscriptionName: 'Netflix',
        subscriptionAmount: '649',
        subscriptionBillingInterval: 'monthly',
        subscriptionNextDueDate: '2026-08-11',
        subscriptionReminderDays: '45',
      },
    });

    await fireEvent.press(await findByTestId('entry-save-button'));

    expect(await findByText('Reminders can be 0 to 30 days before.')).toBeTruthy();
    // The message names a setting under More options, so the fold opens.
    expect(await findByText('Remind me before')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('names a subscription after the payment when the name was left to default', async () => {
    const { findByTestId, onSave } = await renderModal({
      mode: 'audio',
      initialData: {
        ...completeInitialData,
        tag: 'Subscription',
        subscriptionEnabled: true,
        subscriptionName: '',
        subscriptionAmount: '',
        subscriptionBillingInterval: 'monthly',
        subscriptionNextDueDate: '2026-08-11',
        subscriptionReminderDays: '3',
      },
    });

    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ subscriptionName: 'Cafe' })
    );
  });

  it('uses Autopay instead of a reminder for daily subscriptions', async () => {
    const { findByText, queryByText } = await renderModal({
      mode: 'audio',
      initialData: {
        ...completeInitialData,
        tag: 'Subscription',
        subscriptionEnabled: true,
        subscriptionName: 'INDmoney',
        subscriptionAmount: '100',
        subscriptionBillingInterval: 'daily',
        subscriptionNextDueDate: '2026-07-12',
        subscriptionReminderDays: '3',
      },
    });

    expect(queryByText('Next payment date')).toBeNull();
    expect(await findByText('Automatic schedule')).toBeTruthy();
    expect(await findByText('Autopay')).toBeTruthy();
    expect(queryByText('Remind before')).toBeNull();
  });
});

describe('TransactionFormModal — amount-first manual entry', () => {
  const blankEntry: Partial<EntryForm> = {
    title: '',
    amount: '',
    type: 'Expense',
    mode: 'Cash',
    category: 'Food & Drinks',
    date: formatDateLabel(new Date()),
    time: '9:00 AM',
    notes: '',
    tag: 'General',
    currency: 'INR',
    accountId: null,
    account: '',
    merchant: '',
    attachment: null,
  };

  it('opens on the keypad, with no system-keyboard amount field and save held back', async () => {
    const { findByTestId, queryByTestId } = await renderModal({ initialData: blankEntry });

    expect(await findByTestId('amount-key-1')).toBeTruthy();
    expect(await findByTestId('entry-amount-display')).toBeTruthy();
    // The decimal-pad TextInput belongs to the full form, which is collapsed.
    expect(queryByTestId('entry-amount-input')).toBeNull();
    expect(await findByTestId('entry-title-input')).toBeTruthy();
    expect(await findByTestId('entry-save-button')).toBeDisabled();
  });

  it('saves a keypad amount, defaulting every other field', async () => {
    const { findByTestId, onSave } = await renderModal({ initialData: blankEntry });

    await typeAmount(findByTestId, '325');
    expect(await findByTestId('entry-save-button')).not.toBeDisabled();
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        amount: '325',
        // Nothing was typed, so the category stands in — which is what the feed
        // would have shown for a blank title anyway.
        title: 'Food & Drinks',
        category: 'Food & Drinks',
        date: formatDateLabel(new Date()),
        accountId: 1,
      })
    );
  });

  it('stops at two decimal places', async () => {
    const { findByTestId, onSave } = await renderModal({ initialData: blankEntry });

    await typeAmount(findByTestId, '4');
    await fireEvent.press(await findByTestId('amount-key-.'));
    await typeAmount(findByTestId, '507');
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ amount: '4.50' }));
  });

  it('fills title, merchant, category, mode and account from one recent chip', async () => {
    const { findByTestId, onSave } = await renderModal({
      initialData: blankEntry,
      accounts: [cashAccount, upiAccount],
      recentEntries: [
        recentEntry({
          id: '9',
          title: 'DMart groceries',
          merchant: 'DMart',
          category: 'Shopping',
          mode: 'UPI',
          accountId: 2,
          accountName: 'HDFC UPI',
        }),
      ],
    });

    await fireEvent.press(await findByTestId('quick-fill-merchant:dmart'));
    await typeAmount(findByTestId, '90');
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        amount: '90',
        title: 'DMart groceries',
        merchant: 'DMart',
        category: 'Shopping',
        mode: 'UPI',
        accountId: 2,
        account: 'HDFC UPI',
      })
    );
  });

  it('backdates from the chip row without opening a calendar', async () => {
    const { findByTestId, onSave } = await renderModal({ initialData: blankEntry });

    await fireEvent.press(await findByTestId('entry-date-yesterday'));
    await typeAmount(findByTestId, '60');
    await fireEvent.press(await findByTestId('entry-save-button'));

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ date: formatDateLabel(yesterday) })
    );
  });

  it('adds a note from its chip without leaving the capture screen', async () => {
    const { findByTestId, queryByTestId, onSave } = await renderModal({ initialData: blankEntry });

    await fireEvent.press(await findByTestId('entry-add-notes'));

    // Only the note arrives. The full form — a second amount field, the
    // category card — used to come with it, and does not any more.
    expect(await findByTestId('entry-notes-input')).toBeTruthy();
    expect(queryByTestId('entry-add-notes')).toBeNull();
    expect(queryByTestId('entry-amount-input')).toBeNull();
    expect(queryByTestId('entry-category-picker')).toBeNull();
    expect(await findByTestId('amount-key-1')).toBeTruthy();

    await fireEvent.changeText(await findByTestId('entry-notes-input'), 'Office lunch');
    await typeAmount(findByTestId, '180');
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amount: '180', notes: 'Office lunch' })
    );
  });

  it('keeps title and amount visible while switching between the title keyboard and keypad', async () => {
    const ui = await renderModal({ initialData: blankEntry });
    await fireEvent(await ui.findByTestId('entry-title-input'), 'focus');
    expect(ui.queryByTestId('amount-key-1')).toBeNull();
    expect(await ui.findByTestId('entry-amount-display')).toBeTruthy();
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dinner');
    await fireEvent.press(await ui.findByLabelText('Edit amount'));
    await typeAmount(ui.findByTestId, '250');
    await fireEvent.press(await ui.findByTestId('entry-save-button'));
    expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dinner', amount: '250' }));
  });

  it('offers every optional detail as a chip and shows only the one asked for', async () => {
    const ui = await renderModal({ initialData: blankEntry });
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dinner');

    for (const detail of ['notes', 'merchant', 'tag', 'receipt', 'split']) {
      expect(await ui.findByTestId(`entry-add-${detail}`)).toBeTruthy();
    }
    expect(ui.queryByTestId('entry-merchant-input')).toBeNull();
    expect(ui.queryByText('Split this expense')).toBeNull();

    await fireEvent.press(await ui.findByTestId('entry-add-merchant'));

    expect(await ui.findByTestId('entry-merchant-input')).toBeTruthy();
    expect(ui.queryByTestId('entry-notes-input')).toBeNull();
    expect(ui.getAllByTestId('entry-title-input')).toHaveLength(1);
    expect(await ui.findByTestId('entry-title-input')).toHaveDisplayValue('Dinner');
  });

  it('turns the split on in the same tap that adds it', async () => {
    const ui = await renderModal({ initialData: blankEntry });

    await fireEvent.press(await ui.findByTestId('entry-add-split'));

    expect(await ui.findByText('Split this expense')).toBeTruthy();
    expect(ui.getByRole('switch')).toBeChecked();
    expect(ui.queryByTestId('entry-add-split')).toBeNull();
  });

  it('does not offer a split on income', async () => {
    const ui = await renderModal({ initialData: blankEntry });

    await fireEvent.press(await ui.findByTestId('entry-type-income'));

    expect(ui.queryByTestId('entry-add-split')).toBeNull();
    expect(await ui.findByTestId('entry-add-notes')).toBeTruthy();
  });

  it('shows the merchant a quick-fill chip filled rather than hiding it behind a chip', async () => {
    const ui = await renderModal({
      initialData: blankEntry,
      recentEntries: [
        recentEntry({ id: '9', title: 'DMart groceries', merchant: 'DMart', category: 'Shopping' }),
      ],
    });

    await fireEvent.press(await ui.findByTestId('quick-fill-merchant:dmart'));

    expect(await ui.findByTestId('entry-merchant-input')).toHaveDisplayValue('DMart');
    expect(ui.queryByTestId('entry-add-merchant')).toBeNull();
  });
});

describe('TransactionFormModal — title category suggestions', () => {
  const unclassified = { ...completeInitialData, title: '', category: 'Misc' };

  it('follows title corrections and saves the latest inferred category', async () => {
    const ui = await renderModal({ initialData: unclassified });
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dining out');
    expect(await ui.findByLabelText('Category Food & Drinks')).toBeTruthy();
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Metro commute');
    expect(await ui.findByLabelText('Category Transport')).toBeTruthy();
    await fireEvent.press(await ui.findByTestId('entry-save-button'));
    expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Metro commute', category: 'Transport' }));
  });

  it('clears stale hints for unknown or cleared titles without requiring network access', async () => {
    const ui = await renderModal({ initialData: unclassified });
    for (const unknown of ['Something else', '']) {
      await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dinner');
      expect(await ui.findByLabelText('Category Food & Drinks')).toBeTruthy();
      await fireEvent.changeText(await ui.findByTestId('entry-title-input'), unknown);
      expect(await ui.findByLabelText('Category Misc')).toBeTruthy();
    }
  });

  it.each(['Shopping', 'Misc'])('preserves an explicit %s selection across title edits and same-type taps', async (category) => {
    const ui = await renderModal({ initialData: unclassified });
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dinner');
    await fireEvent.press(await ui.findByTestId('entry-category-chip'));
    await fireEvent.press(await ui.findByText(category));
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Metro');
    await fireEvent.press(await ui.findByTestId('entry-type-expense'));
    await fireEvent.press(await ui.findByTestId('entry-save-button'));
    expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ category }));
  });

  it('uses income categories after switching type and preserves the current type on title changes', async () => {
    const ui = await renderModal({ initialData: unclassified });
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Monthly salary');
    await fireEvent.press(await ui.findByTestId('entry-type-income'));
    expect(await ui.findByLabelText('Category Salary')).toBeTruthy();
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dinner refund');
    expect(await ui.findByLabelText('Category Refund')).toBeTruthy();
    await fireEvent.press(await ui.findByTestId('entry-save-button'));
    expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'Income', category: 'Refund' }));
  });

  it('preserves saved transaction categories when editing the title', async () => {
    const ui = await renderModal({ initialData: unclassified, isEdit: true });
    await fireEvent.changeText(await ui.findByTestId('entry-title-input'), 'Dinner');
    await fireEvent.press(await ui.findByTestId('entry-save-button'));
    expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ category: 'Misc' }));
  });

  it('infers an initial title only when the seed category is a fallback', async () => {
    const ui = await renderModal({ initialData: { ...unclassified, title: 'Dinner' } });
    expect(await ui.findByLabelText('Category Food & Drinks')).toBeTruthy();
    await fireEvent.press(await ui.findByTestId('entry-save-button'));
    expect(ui.onSave).toHaveBeenCalledWith(expect.objectContaining({ category: 'Food & Drinks' }));
  });
});

describe('TransactionFormModal — AI draft review', () => {
  it('shows the phrase the draft was built from', async () => {
    const { findByText, findByTestId } = await renderModal({
      mode: 'audio',
      aiReview: { sourceText: 'spent 250 on lunch at the cafe', inputSource: 'voice' },
    });

    expect(await findByText('You said')).toBeTruthy();
    expect(await findByTestId('draft-source-text')).toHaveTextContent(
      '“spent 250 on lunch at the cafe”'
    );
  });

  it('puts uncertain fields above the fold and folds the rest into one line', async () => {
    const { findByTestId, queryByTestId } = await renderModal({
      mode: 'audio',
      aiReview: { missingFields: ['account_hint'], confidence: { category: 0.3 } },
    });

    // What the AI guessed at gets its own card...
    expect(await findByTestId('entry-account-picker')).toBeTruthy();
    expect(await findByTestId('entry-category-picker')).toBeTruthy();
    // ...and what it was sure about is one line until the user asks for it.
    // Mode, then date, then who took the money — the flagged category is
    // absent because it is already a card in full above.
    expect(await findByTestId('draft-summary-line')).toHaveTextContent(
      'Cash · 11 July 2026 · Cafe · Lunch'
    );
    expect(queryByTestId('entry-title-input')).toBeNull();

    await fireEvent.press(await findByTestId('draft-summary-toggle'));

    expect(await findByTestId('entry-title-input')).toBeTruthy();
    expect(await findByTestId('entry-merchant-input')).toBeTruthy();
  });

  it('answers the Check this chip once the field has been opened', async () => {
    const { findByText, findByTestId } = await renderModal({
      mode: 'audio',
      aiReview: { confidence: { category: 0.3 } },
    });

    expect(await findByText('1 field to check')).toBeTruthy();
    expect(await findByText('Check this')).toBeTruthy();

    await fireEvent.press(await findByTestId('entry-category-picker'));

    expect(await findByText('Checked')).toBeTruthy();
    expect(await findByText('No issues flagged')).toBeTruthy();
  });

  it('surfaces a required field the parser left blank but did not report', async () => {
    const { findByTestId } = await renderModal({
      mode: 'audio',
      aiReview: { confidence: { title: 0.99 } },
      initialData: { ...completeInitialData, title: '' },
    });

    // Save refuses without a title, so it cannot sit inside a collapsed
    // summary however sure the parser claims to be.
    expect(await findByTestId('entry-title-input')).toBeTruthy();
  });

  it('saves an amount corrected on the review headline', async () => {
    const { findByTestId, onSave } = await renderModal({
      mode: 'audio',
      aiReview: { confidence: { amount: 0.4 } },
    });

    await fireEvent.changeText(await findByTestId('entry-amount-input'), '325.50');
    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ amount: '325.50' }));
  });

  it('leaves the manual and edit sheets on the stacked form', async () => {
    const { findByTestId, queryByTestId } = await renderModal({ isEdit: true });

    expect(await findByTestId('entry-category-picker')).toBeTruthy();
    expect(queryByTestId('draft-summary-toggle')).toBeNull();
    // The saved merchant is a field; the empty note is an offer.
    expect(await findByTestId('entry-merchant-input')).toHaveDisplayValue('Cafe');
    expect(queryByTestId('entry-add-merchant')).toBeNull();
    expect(await findByTestId('entry-add-notes')).toBeTruthy();
  });
});

describe('TransactionFormModal — parse choreography', () => {
  beforeEach(() => {
    jest.mocked(Haptics.notificationAsync).mockClear();
  });

  it('holds the shape of the draft while the parse is still in flight', async () => {
    const { queryByTestId } = await render(
      <TransactionFormModal
        visible
        isParsing
        mode="audio"
        initialData={{}}
        onSave={jest.fn()}
        onClose={jest.fn()}
        accounts={[cashAccount]}
      />
    );

    // Placeholders shaped like the fields, not a spinner and not a blank sheet.
    expect(queryByTestId('draft-skeleton')).toBeTruthy();
    // And emphatically not the draft itself: an amount field rendered off an
    // empty parse would invite the user to edit a value that is about to be
    // overwritten.
    expect(queryByTestId('entry-amount-input')).toBeNull();
  });

  it('replaces the placeholders with the parsed draft when it lands', async () => {
    // One array identity across both renders, deliberately. A fresh `accounts`
    // literal per render rebuilds the sheet's account resolver, which rebuilds
    // the seeding callback, which hides the bug this test exists for: on device
    // `accounts` is stable, the callback is not rebuilt, and a captured
    // `initialData` stays empty — the draft landed with a blank amount.
    const stableAccounts = [cashAccount];
    const onSave = jest.fn();
    const onClose = jest.fn();

    const { queryByTestId, findByTestId, rerender } = await render(
      <TransactionFormModal
        visible
        isParsing
        mode="audio"
        initialData={{}}
        onSave={onSave}
        onClose={onClose}
        accounts={stableAccounts}
      />
    );

    expect(queryByTestId('draft-skeleton')).toBeTruthy();

    await act(async () => {
      rerender(
        <TransactionFormModal
          visible
          isParsing={false}
          mode="audio"
          initialData={completeInitialData}
          onSave={onSave}
          onClose={onClose}
          aiReview={{ confidence: { amount: 0.9 } }}
          accounts={stableAccounts}
        />
      );
    });

    expect(queryByTestId('draft-skeleton')).toBeNull();
    // The re-seed is the point: `initialData` arrived *after* the sheet opened,
    // and the seeding effect deliberately does not watch it.
    expect((await findByTestId('entry-amount-input')).props.value).toBe('250.00');
  });

  it('answers a refused save on the hand, not only on the screen', async () => {
    const { findByTestId, onSave } = await renderModal({
      mode: 'audio',
      initialData: { ...completeInitialData, title: '' },
    });

    await fireEvent.press(await findByTestId('entry-save-button'));

    expect(onSave).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('confirms a save on the hand once it has actually happened', async () => {
    const { findByTestId, onSave } = await renderModal({ isEdit: true });

    await fireEvent.press(await findByTestId('entry-save-button'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  it('stays quiet on the hand when the save has not been attempted', async () => {
    await renderModal({ isEdit: true });

    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});

describe('TransactionFormModal — EMI on an existing entry', () => {
  const bankAccount: Account = { id: 3, type: 'bank', name: 'SBI Bank', color: '#42A5F5' };
  const emiEdit: Partial<EntryForm> = {
    ...completeInitialData,
    title: 'Car loan EMI',
    amount: '13776',
    mode: 'Bank Account',
    tag: 'EMI',
    accountId: 3,
    account: 'SBI Bank',
    date: '05 October 2026',
  };

  it('offers the monthly auto-debit on a bank EMI that is not repeating yet', async () => {
    const { findByText } = await renderModal({
      isEdit: true,
      accounts: [bankAccount],
      initialData: emiEdit,
    });
    expect(await findByText('Repeats monthly (auto-debit)')).toBeTruthy();
  });

  it('shows the auto-debit it already has instead of offering a second one', async () => {
    const { findByText, queryByText } = await renderModal({
      isEdit: true,
      accounts: [bankAccount],
      initialData: emiEdit,
      emiLink: {
        kind: 'recurring',
        subscription: {
          amount: 13776,
          total_instalments: 60,
          instalments_paid: 12,
          status: 'active',
          next_due_date: '2026-11-05T00:00:00Z',
        } as never,
      },
    });
    expect(await findByText(/12 of 60 paid · 48 left/)).toBeTruthy();
    expect(queryByText('Repeats monthly (auto-debit)')).toBeNull();
  });

  it('links a card EMI to its schedule', async () => {
    const onOpen = jest.fn();
    const card: Account = { id: 4, type: 'credit_card', name: 'One Card', color: '#000' };
    const { findByText } = await renderModal({
      isEdit: true,
      accounts: [card],
      initialData: { ...emiEdit, mode: 'Credit Card', accountId: 4, account: 'One Card' },
      emiLink: {
        kind: 'plan',
        onOpen,
        plan: {
          monthly_amount: 5000,
          tenure_months: 12,
          annual_rate_pct: 0,
          progress: { installments_total: 12, installments_paid: 2 },
        } as never,
      },
    });
    await fireEvent.press(await findByText('View full schedule'));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe('TransactionFormModal — which account did you mean', () => {
  it('gives "add a new account" a button of its own', async () => {
    const onSetup = jest.fn();
    const suggestion: AccountSuggestion = {
      type: 'credit_card',
      name: 'SBI Credit Card',
      color: '#000',
      provider: 'SBI',
      identifier: '',
      reason: '',
    };
    const a: Account = { id: 5, type: 'credit_card', name: 'SBI BPCL', color: '#000' };
    const b: Account = { id: 6, type: 'credit_card', name: 'SBI simply save', color: '#000' };
    const { findByTestId } = await renderModal({
      mode: 'audio',
      accounts: [a, b],
      accountMatches: [a, b],
      newAccountSuggestion: suggestion,
      onSetupSuggestedAccount: onSetup,
      initialData: { ...completeInitialData, mode: 'Credit Card', accountId: 5, account: 'SBI BPCL' },
    });
    await fireEvent.press(await findByTestId('account-match-new'));
    expect(onSetup).toHaveBeenCalledWith(suggestion);
  });
});

