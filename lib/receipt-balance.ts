import { normalizeAccountType, type Account } from '@/lib/accounts';
import type { AppConfirmOptions } from '@/components/ui/AppDialogProvider';
import { formatMoney } from '@/lib/money';

/**
 * What to ask after saving a scan that printed the account's balance, or null
 * when there is nothing to ask.
 *
 * A wallet's top-up message ends "Your current Meal Wallet Balance is
 * Rs.33184.16", and that is the one figure the wallet screen could not show.
 * The question is only asked, never answered for the user: a printed balance
 * can be misread, and it replaces what Finnri has.
 *
 * `account` is the account as it was before this entry, so the balance Finnri
 * now holds is its running balance moved by this entry.
 */
export const describeReceiptBalanceUpdate = (
  account: Account | null | undefined,
  printed: number | null | undefined,
  entry: { type: string; amount: number }
): AppConfirmOptions | null => {
  if (!account || printed == null || !Number.isFinite(printed) || printed < 0) return null;
  if (normalizeAccountType(account.type) === 'credit_card') return null;

  const running = account.summary?.running_balance;
  if (typeof running === 'number') {
    const moved = entry.type.toLowerCase() === 'income' ? entry.amount : -entry.amount;
    const expected = running + moved;
    // Under a rupee apart reads as the same figure (the app shows whole
    // rupees), and "₹33,184 vs ₹33,184" is not a question worth asking.
    if (Math.abs(expected - printed) < 1) return null;
    return {
      title: `Update ${account.name}'s balance?`,
      message: `The receipt shows ${formatMoney(printed)}. Finnri has ${formatMoney(expected)}.`,
      confirmLabel: 'Update',
      cancelLabel: `Keep ${formatMoney(expected)}`,
      iconName: 'scale-balance',
    };
  }
  return {
    title: `Track ${account.name}'s balance?`,
    message: `The receipt shows ${formatMoney(printed)} in ${account.name}. Finnri keeps it up to date from here as you log.`,
    confirmLabel: 'Track it',
    cancelLabel: 'Not now',
    iconName: 'scale-balance',
  };
};
