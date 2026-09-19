import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { toAmountInputValue, roundToPaise } from './money';
import { CURRENT_USER_KEY, friendSplitKey, type SplitSelection } from './split-preferences';
import type { SplitBill, SplitBillPayload } from './splits';
import { formatApiDate, parseDateLabel } from './transactions';
import { toApiTime } from './datetime';

export function billToComposerForm(bill: SplitBill): Partial<EntryForm> {
  return {
    title: bill.title,
    amount: String(bill.total_amount),
    date: bill.date,
    notes: bill.notes ?? '',
    category: bill.category || 'Misc',
    mode: bill.mode || 'Cash',
    merchant: bill.merchant ?? '',
    tag: bill.tag || 'General',
    time: bill.time ?? '',
    attachment: bill.attachment ?? null,
  };
}

/** Restore money, not an equal-split guess, when editing an existing bill. */
export function billToSplitSelection(bill: SplitBill): SplitSelection {
  const debt = bill.participants.find(
    (participant) => participant.direction === 'user_owes_friend'
  );
  const weights: Record<string, string> = {};
  if (debt) {
    weights[CURRENT_USER_KEY] = toAmountInputValue(debt.share_amount);
    weights[friendSplitKey(debt.friend_id)] = toAmountInputValue(
      roundToPaise(bill.total_amount - debt.share_amount)
    );
  } else {
    let friendsTotal = 0;
    bill.participants.forEach((participant) => {
      weights[friendSplitKey(participant.friend_id)] = toAmountInputValue(participant.share_amount);
      friendsTotal += participant.share_amount;
    });
    weights[CURRENT_USER_KEY] = toAmountInputValue(roundToPaise(bill.total_amount - friendsTotal));
  }
  return {
    selfKey: CURRENT_USER_KEY,
    payerKey: debt ? friendSplitKey(debt.friend_id) : CURRENT_USER_KEY,
    fullAmount: debt
      ? debt.share_amount === bill.total_amount
      : Number(weights[CURRENT_USER_KEY]) === 0,
    participantKeys: Object.keys(weights).filter((key) => Number(weights[key]) > 0),
    tab: 'unequally',
    weights,
  };
}

export function buildSplitBillPayload(
  form: EntryForm,
  groupId: number | null,
  participants: SplitBillPayload['participants'],
  attachment: string | null
): SplitBillPayload {
  const date = parseDateLabel(form.date);
  return {
    title: form.title.trim(),
    total_amount: Number(form.amount.replace(/,/g, '')),
    currency: 'INR',
    date: date ? formatApiDate(date) : form.date,
    notes: form.notes.trim(),
    group_id: groupId,
    participants,
    mode: form.mode,
    category: form.category,
    merchant: form.merchant.trim(),
    tag: form.tag,
    time: toApiTime(form.time) ?? '',
    attachment: attachment ?? '',
  };
}
