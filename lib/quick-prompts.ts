import type { QuickPrompt } from '@/components/home/QuickPrompts';
import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { Account } from './accounts';
import { toAmountInputValue } from './money';

const iconForCategory = (category: string) => {
  switch (category.toLowerCase()) {
    case 'food & drinks':
      return 'coffee-outline';
    case 'travel':
      return 'train';
    case 'transport':
      return 'gas-station-outline';
    case 'shopping':
      return 'cart-outline';
    case 'bills':
      return 'file-document-outline';
    default:
      return 'lightning-bolt';
  }
};

/**
 * The transaction a quick prompt describes, in the shape the entry sheet takes.
 *
 * One mapping for both places a prompt opens the sheet — editing the prompt
 * and using it — so a field the editor saves is a field using it fills in.
 * The editor used to show type, merchant, tag and notes and send none of them,
 * and had no account at all: a Metro prompt set to Wallets always paid from the
 * default wallet, whichever one the person actually tops up with.
 *
 * An account that no longer exists is dropped rather than kept by id; the sheet
 * then picks the default account for the mode, as it does for a new entry.
 */
export const quickPromptToForm = (prompt: QuickPrompt, accounts: Account[]): Partial<EntryForm> => {
  const account =
    prompt.account_id != null
      ? (accounts.find((candidate) => candidate.id === prompt.account_id) ?? null)
      : null;
  return {
    title: prompt.title,
    amount: toAmountInputValue(prompt.amount),
    type: prompt.type === 'income' ? 'Income' : 'Expense',
    mode: prompt.mode,
    category: prompt.category,
    accountId: account?.id ?? null,
    account: account?.name ?? '',
    merchant: prompt.merchant ?? '',
    tag: prompt.tag || 'General',
    notes: prompt.notes ?? '',
  };
};

/** What the quick-prompt endpoints take, from the editor's form. */
export const formToQuickPromptPayload = (form: EntryForm) => ({
  title: form.title.trim(),
  amount: Number(form.amount.replace(/,/g, '')),
  type: form.type.toLowerCase() === 'income' ? 'income' : 'expense',
  mode: form.mode,
  category: form.category,
  // Sent even when null: on an update, leaving it out would keep the old
  // account, and null is how "use the default for this mode" is said.
  account_id: form.accountId ?? null,
  merchant: form.merchant.trim(),
  tag: form.tag,
  notes: form.notes.trim(),
  icon: iconForCategory(form.category),
});
