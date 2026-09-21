import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { DEFAULT_CURRENCY } from '@/constants/Currency';
import { normalizeAccountType, type Account } from './accounts';
import { toApiTime } from './datetime';
import { createEntry, type EntryMutationPayload } from './entries';
import { createCardEMIPlan } from './emi-plans';
import { refundReminderAtNineAM } from './refundables';
import { createSubscription } from './subscriptions';
import { formatApiDate, parseDateLabel, type ApiEntry } from './transactions';
import { resolveAttachmentForSave } from './uploads';

/** One mapping for Home, transaction edits and group expenses. */
export async function buildTransactionPayload(
  token: string,
  form: EntryForm,
  options: {
    accountId?: number | null;
    source?: 'manual' | 'text' | 'voice';
    sourceText?: string;
    refundStatus?: EntryMutationPayload['refund_status'];
  } = {}
): Promise<EntryMutationPayload> {
  const date = parseDateLabel(form.date);
  const attachment = await resolveAttachmentForSave(token, form.attachment);
  return {
    title: form.title.trim() || 'Untitled Transaction',
    amount: form.amount.trim(),
    currency: form.currency || DEFAULT_CURRENCY,
    account_id: options.accountId === undefined ? form.accountId : options.accountId,
    type: form.type.toLowerCase(),
    mode: form.mode,
    category: form.category,
    notes: form.notes.trim(),
    merchant: form.merchant.trim(),
    tag: form.tag.trim() || null,
    date: date ? formatApiDate(date) : form.date,
    time: toApiTime(form.time) ?? '',
    attachment,
    ...(options.source ? { source: options.source, source_text: options.sourceText ?? '' } : {}),
    ...(form.tag === 'Refundable'
      ? {
          refundable_amount: form.refundableAmount.trim(),
          refund_expected_on: formatApiDate(parseDateLabel(form.refundExpectedOn) as Date),
          refund_reminder_at: form.refundReminderEnabled
            ? refundReminderAtNineAM(form.refundExpectedOn)
            : null,
          refund_status: options.refundStatus ?? 'pending',
        }
      : {}),
    ...(form.splitEnabled && form.type === 'Expense'
      ? {
          split: {
            group_id: form.splitGroupId,
            group_name: form.splitGroupId ? '' : form.splitGroupName.trim(),
            notes: form.notes.trim(),
            participants: form.splitParticipants.map((participant) => ({
              ...(participant.friendId
                ? { friend_id: participant.friendId }
                : { friend: { name: participant.friendName.trim() } }),
              share_amount: participant.shareAmount.trim(),
              direction: participant.direction,
            })),
          },
        }
      : {}),
  };
}

/** Kept for the lifetime of a create attempt so successful steps are not repeated. */
export type TransactionSaveProgress = {
  entry?: ApiEntry;
  fingerprint?: string;
  emiCreated?: boolean;
  subscriptionCreated?: boolean;
};

export async function saveNewTransaction({
  token,
  form,
  account,
  idempotencyKey,
  source = 'manual',
  sourceText = '',
  progress = {},
}: {
  token: string;
  form: EntryForm;
  account: Account | null;
  idempotencyKey: string;
  source?: 'manual' | 'text' | 'voice';
  sourceText?: string;
  progress?: TransactionSaveProgress;
}) {
  const parsedDate = parseDateLabel(form.date);
  const fingerprint = JSON.stringify({ form, accountId: account?.id ?? null, source, sourceText });
  if (progress.entry && progress.fingerprint !== fingerprint) {
    throw new Error(
      'The transaction has already been saved. Restore the previous details to retry the payment plan, or edit the saved transaction from Home.'
    );
  }
  const entry =
    progress.entry ??
    (await createEntry(
      token,
      await buildTransactionPayload(token, form, {
        accountId: account?.id ?? null,
        source,
        sourceText,
      }),
      idempotencyKey
    ));
  progress.entry = entry;
  progress.fingerprint = fingerprint;
  const convertedToEMI =
    form.tag === 'EMI' && account != null && normalizeAccountType(account.type) === 'credit_card';
  if (convertedToEMI && !progress.emiCreated) {
    const sourceEntryID = Number(entry.id);
    if (!Number.isInteger(sourceEntryID) || sourceEntryID <= 0)
      throw new Error('The saved purchase could not be linked to its EMI plan.');
    await createCardEMIPlan(token, account.id, {
      title: form.title.trim() || 'EMI purchase',
      merchant: form.merchant.trim(),
      category: form.category,
      principal: Number(form.amount.replace(/,/g, '')),
      annual_rate_pct: Number(form.emiRatePct || 0),
      tenure_months: Number(form.emiTenureMonths),
      purchased_on: parsedDate ? formatApiDate(parsedDate) : form.date,
      source_entry_id: sourceEntryID,
      notes: form.notes.trim(),
    });
    progress.emiCreated = true;
  }
  if (
    form.subscriptionEnabled &&
    form.subscriptionBillingInterval &&
    !progress.subscriptionCreated
  ) {
    await createSubscription(token, {
      name: form.subscriptionName.trim(),
      merchant: form.subscriptionMerchant.trim() || form.merchant.trim(),
      category: form.subscriptionCategory.trim() || form.category,
      amount: Number(form.subscriptionAmount || form.amount),
      billing_interval: form.subscriptionBillingInterval,
      next_due_date: form.subscriptionNextDueDate.trim(),
      last_charged_date: parsedDate ? formatApiDate(parsedDate) : undefined,
      status: 'active',
      reminder_days: Number(form.subscriptionReminderDays || 0),
      cancel_before_due: form.subscriptionCancelBeforeDue,
      cancel_on_date: form.subscriptionCancelOnDate.trim(),
      autopay: form.subscriptionAutopay,
      payment_mode: form.mode,
      transaction_tag: form.tag || 'Subscription',
      purpose_type: form.tag.toLowerCase() === 'investment' ? 'investment' : 'normal_spend',
      notes: form.subscriptionNotes.trim(),
      account_id: account?.id ?? null,
    });
    progress.subscriptionCreated = true;
  }
  return { entry, convertedToEMI };
}

export function entryToComposerForm(entry: ApiEntry): Partial<EntryForm> {
  return {
    title: entry.title ?? '',
    amount: String(entry.amount ?? ''),
    type: entry.type === 'income' ? 'Income' : 'Expense',
    mode: entry.mode || 'Cash',
    category: entry.category || 'Misc',
    date: entry.date,
    time: entry.time ?? '',
    notes: entry.notes ?? '',
    merchant: entry.merchant ?? '',
    tag: entry.tag || 'General',
    accountId: entry.account_id ?? null,
    account: entry.account?.name ?? '',
    attachment: entry.attachment ?? null,
    currency: entry.currency || DEFAULT_CURRENCY,
    refundableAmount: String(entry.refundable_amount ?? ''),
    refundExpectedOn: entry.refund_expected_on ?? '',
    refundReminderEnabled: Boolean(entry.refund_reminder_at),
  };
}
