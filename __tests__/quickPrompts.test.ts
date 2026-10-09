import type { QuickPrompt } from '@/components/home/QuickPrompts';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { Account } from '@/lib/accounts';
import { formToQuickPromptPayload, quickPromptToForm } from '@/lib/quick-prompts';

const paytm: Account = { id: 7, type: 'wallet', name: 'Paytm Wallet', color: '#00BAF2' };
const amazon: Account = { id: 8, type: 'wallet', name: 'Amazon Pay', color: '#FF9900' };

const metro: QuickPrompt = {
  id: 1,
  title: 'Metro Recharge',
  amount: 300,
  type: 'expense',
  mode: 'Wallets',
  category: 'Travel',
  account_id: 8,
  merchant: 'Delhi Metro',
  tag: 'General',
  notes: 'Monthly top-up',
  icon: 'train',
};

describe('quickPromptToForm', () => {
  it('fills the account the prompt pays from, not just its mode', () => {
    expect(quickPromptToForm(metro, [paytm, amazon])).toEqual({
      title: 'Metro Recharge',
      amount: '300.00',
      type: 'Expense',
      mode: 'Wallets',
      category: 'Travel',
      accountId: 8,
      account: 'Amazon Pay',
      merchant: 'Delhi Metro',
      tag: 'General',
      notes: 'Monthly top-up',
    });
  });

  it('lets the sheet choose when the saved account is gone', () => {
    const form = quickPromptToForm({ ...metro, account_id: 99 }, [paytm]);

    expect(form.accountId).toBeNull();
    expect(form.account).toBe('');
  });

  it('reads a prompt from a server that predates the extra fields', () => {
    const { type, account_id, merchant, tag, notes, ...legacy } = metro;
    void [type, account_id, merchant, tag, notes];

    expect(quickPromptToForm(legacy, [paytm])).toEqual(
      expect.objectContaining({
        type: 'Expense',
        accountId: null,
        merchant: '',
        tag: 'General',
        notes: '',
      })
    );
  });

  it('keeps an income prompt as income', () => {
    expect(quickPromptToForm({ ...metro, type: 'income' }, []).type).toBe('Income');
  });
});

describe('formToQuickPromptPayload', () => {
  const form = {
    ...(quickPromptToForm(metro, [paytm, amazon]) as EntryForm),
    title: ' Metro Recharge ',
    amount: '1,200',
    merchant: ' Delhi Metro ',
    notes: ' Monthly top-up ',
  } as EntryForm;

  it('sends every field the editor shows', () => {
    expect(formToQuickPromptPayload(form)).toEqual({
      title: 'Metro Recharge',
      amount: 1200,
      type: 'expense',
      mode: 'Wallets',
      category: 'Travel',
      account_id: 8,
      merchant: 'Delhi Metro',
      tag: 'General',
      notes: 'Monthly top-up',
      icon: 'train',
    });
  });

  it('sends a cleared account as null rather than leaving it out', () => {
    // Left out, an update would keep the old wallet.
    expect(formToQuickPromptPayload({ ...form, accountId: null })).toHaveProperty(
      'account_id',
      null
    );
  });
});
