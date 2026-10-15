import { DEFAULT_CURRENCY } from '@/constants/Currency';
import {
  getAccountTypeForPaymentMode,
  getPreferredAccountForPaymentMode,
  type Account,
} from '@/lib/accounts';
import type { QuickPrompt } from '@/components/home/QuickPrompts';
import { DEFAULT_CATEGORY } from '@/lib/categories';
import { formatTime } from '@/lib/datetime';
import { toAmountInputValue } from '@/lib/money';
import { ParseApiError, type ParseResponse } from '@/lib/parse';
import type { BlockedAIReason } from '@/lib/plans-prompt';
import { quickPromptToForm } from '@/lib/quick-prompts';
import { resolveSplitDraft } from '@/lib/split-draft';
import { inferNextSubscriptionDate } from '@/lib/subscription-schedule';
import type { BillingInterval } from '@/lib/subscriptions';
import {
  formatApiDate,
  formatDateLabel,
  normalizeDateLabel,
  toTitleCase,
} from '@/lib/transactions';
import type { AiReviewMetadata, EntryForm } from '@/components/transactions/TransactionFormModal';

export const billingIntervals: BillingInterval[] = [
  'daily',
  'business_daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
];

export const isBillingInterval = (value?: string | null): value is BillingInterval =>
  billingIntervals.includes(value as BillingInterval);

export type CreditActionState = {
  title: string;
  message: string;
  actionLabel: string;
  action: 'upgrade' | 'login';
};

const DRAFT_NOTE_MAX = 200;

/** The user's own words, trimmed, for when the parser returned no note. */
export const fallbackDraftNote = (sourceText: string) => {
  const text = sourceText.replace(/\s+/g, ' ').trim();
  return text.length > DRAFT_NOTE_MAX ? `${text.slice(0, DRAFT_NOTE_MAX - 1).trimEnd()}…` : text;
};

/** The blank form Home's composer starts from. */
export const createDefaultEntryForm = (): EntryForm => ({
  title: '',
  amount: '',
  type: 'Expense',
  mode: 'Cash',
  // S2 left this behind: 'Food' is a legacy alias, and the amount-first
  // sheet shows the seeded category on a chip and saves it as the title.
  category: DEFAULT_CATEGORY,
  date: formatDateLabel(new Date()),
  time: formatTime(new Date()) ?? '',
  notes: '',
  tag: 'General',
  currency: DEFAULT_CURRENCY,
  accountId: null,
  account: '',
  merchant: '',
  attachment: null,
  splitEnabled: false,
  splitGroupId: null,
  splitGroupName: '',
  splitParticipants: [],
  refundableAmount: '',
  refundExpectedOn: '',
  refundReminderEnabled: true,
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
});

/**
 * Lay a parsed capture draft over the form it will be reviewed in. Text, voice
 * and receipt scans all land here, so a draft reads the same whichever way it
 * arrived.
 */
export const applyParsedDraftToForm = (
  prev: EntryForm,
  data: ParseResponse,
  {
    fallbackText,
    attachment,
    smartSorting,
    splitDraft,
    hintedAccount,
  }: {
    fallbackText: string;
    attachment?: string;
    smartSorting: boolean;
    splitDraft: ReturnType<typeof resolveSplitDraft>;
    hintedAccount: Account | null;
  }
): EntryForm => {
  const missing = new Set(data.missing_fields ?? []);
  const formattedDate =
    missing.has('date') || !data.date
      ? formatDateLabel(new Date())
      : normalizeDateLabel(data.date, formatDateLabel(new Date()));
  const tagValue = data.tag ?? data.tags?.[0] ?? '';
  const newType = missing.has('type') ? '' : (toTitleCase(data.type) ?? '');
  const subscriptionCandidate = data.subscription_candidate;
  const subscriptionInterval = isBillingInterval(subscriptionCandidate?.billing_interval)
    ? subscriptionCandidate.billing_interval
    : '';
  const subscriptionPaidDate =
    subscriptionCandidate?.last_charged_date ?? data.date ?? formatApiDate(new Date());
  const inferredNextDueDate =
    subscriptionCandidate?.next_due_date ??
    inferNextSubscriptionDate(subscriptionPaidDate, subscriptionInterval);
  return {
    ...prev,
    title: smartSorting && !missing.has('title') ? (data.title ?? '') : '',
    amount: missing.has('amount') || data.amount == null ? '' : toAmountInputValue(data.amount),
    currency: data.currency ?? prev.currency,
    // The parser emits `HH:MM`; the form shows and stores a display string.
    time: formatTime(data.time) ?? prev.time,
    type: newType,
    mode: smartSorting && !missing.has('mode') ? (data.mode ?? '') : '',
    category: smartSorting && !missing.has('category') ? (data.category ?? 'Misc') : 'Misc',
    merchant: data.merchant ?? '',
    // The account the user named, when they named one we know. Without
    // this the form fell back to the default card for the mode.
    ...(hintedAccount ? { accountId: hintedAccount.id, account: hintedAccount.name } : {}),
    // Never leave the note empty on an AI draft: the parser's own one-liner,
    // or failing that what the user actually said.
    notes: data.note?.trim() || fallbackDraftNote(data.source_text ?? fallbackText),
    date: formattedDate,
    tag: smartSorting && tagValue ? (toTitleCase(tagValue) ?? '') : '',
    splitEnabled: splitDraft.splitEnabled,
    splitGroupId: splitDraft.splitGroupId,
    splitGroupName: splitDraft.splitGroupName,
    splitParticipants: splitDraft.splitParticipants,
    refundableAmount:
      data.refundable_amount != null ? toAmountInputValue(data.refundable_amount) : '',
    refundExpectedOn: data.refund_expected_on ?? '',
    refundReminderEnabled: true,
    emiTenureMonths: data.emi_tenure_months != null ? String(data.emi_tenure_months) : '',
    emiRatePct: data.emi_rate_pct != null ? String(data.emi_rate_pct) : '',
    subscriptionEnabled: Boolean(subscriptionCandidate),
    subscriptionName: subscriptionCandidate?.name ?? data.merchant ?? data.title ?? '',
    subscriptionMerchant: subscriptionCandidate?.merchant ?? data.merchant ?? '',
    subscriptionCategory: subscriptionCandidate?.category ?? data.category ?? 'Misc',
    subscriptionAmount:
      subscriptionCandidate?.amount != null
        ? toAmountInputValue(subscriptionCandidate.amount)
        : data.amount != null
          ? toAmountInputValue(data.amount)
          : '',
    subscriptionBillingInterval: subscriptionInterval,
    subscriptionNextDueDate: inferredNextDueDate,
    subscriptionReminderDays:
      subscriptionCandidate?.reminder_days != null
        ? String(subscriptionCandidate.reminder_days)
        : '3',
    subscriptionCancelBeforeDue: Boolean(subscriptionCandidate?.cancel_before_due),
    subscriptionCancelOnDate: subscriptionCandidate?.cancel_on_date ?? '',
    subscriptionAutopay: Boolean(subscriptionCandidate?.autopay),
    subscriptionNotes: subscriptionCandidate?.notes ?? '',
    // A scanned bill is kept as the entry's receipt; it uploads on save.
    attachment: attachment ?? prev.attachment,
  };
};

/** What the review sheet needs to say about how sure the parser was. */
export const buildAiReview = (
  data: ParseResponse,
  fallbackText: string,
  inputSource: 'voice' | 'text' | 'receipt',
  splitDraft: ReturnType<typeof resolveSplitDraft>,
  smartSorting: boolean
): AiReviewMetadata => ({
  confidence: data.confidence,
  needsConfirmation: data.needs_confirmation,
  missingFields: smartSorting
    ? data.missing_fields
    : Array.from(new Set([...(data.missing_fields ?? []), 'title', 'mode', 'category', 'tag'])),
  clarifications: [
    ...(data.clarifications ?? []),
    ...(splitDraft.splitDefaultWarning ? [splitDraft.splitDefaultWarning] : []),
  ],
  smartSortingDisabled: !smartSorting,
  // What the AI worked from, so the review sheet can show it back. A
  // wrong field is usually a misheard word, and the phrase is the only
  // place that is visible.
  sourceText: data.source_text ?? fallbackText,
  inputSource,
});

/**
 * Out of credits, or over today's limit: the credit card on Home owns that
 * message. Returns it, with which wall it is for the plans sheet, or null when
 * the error is not about credits.
 */
export const creditActionForParseError = (
  error: unknown,
  {
    isGuestUser,
    dailyCreditsUsed,
    dailyLimit: billedDailyLimit,
  }: {
    isGuestUser: boolean;
    dailyCreditsUsed?: number;
    dailyLimit?: number;
  }
): (CreditActionState & { reason: BlockedAIReason }) | null => {
  if (error instanceof ParseApiError) {
    /*
     * A guest running out of credits is the one moment they have a reason
     * to make an account, so the prompt says what signing in buys rather
     * than just reporting the balance — and it points at sign-in, not at a
     * plans screen a guest cannot buy from anyway.
     */
    if (error.code === 'insufficient_ai_credits') {
      return {
        title: isGuestUser ? 'You have used up your guest AI credits' : 'AI credits are low',
        message: isGuestUser
          ? `Dear guest, this capture needs ${error.requiredCredits ?? 5} credits and you have ${error.availableCredits ?? 0} left. Sign in to keep going with more AI credits — everything you have added so far comes with you.`
          : `This capture needs ${error.requiredCredits ?? 5} credits. You have ${error.availableCredits ?? 0} available.`,
        actionLabel: isGuestUser ? 'Sign in for more credits' : 'View plans',
        action: isGuestUser ? 'login' : 'upgrade',
        reason: 'out_of_credits',
      };
    }
    if (error.code === 'daily_ai_limit_reached') {
      const usedToday = error.usedToday ?? dailyCreditsUsed ?? 0;
      const dailyLimit = error.dailyLimit ?? billedDailyLimit ?? 0;
      return {
        title: isGuestUser ? 'You have reached your guest AI limit' : 'Daily AI limit reached',
        message: isGuestUser
          ? `Dear guest, you have used all ${dailyLimit} AI credits for today. Sign in to continue enjoying more AI credits — everything you have added so far comes with you.`
          : `You used ${usedToday} of ${dailyLimit} credits today.`,
        actionLabel: isGuestUser ? 'Sign in for more credits' : 'View plans',
        action: isGuestUser ? 'login' : 'upgrade',
        reason: 'daily_limit',
      };
    }
  }
  return null;
};

/**
 * The account an entry will be saved against: the one picked, if it suits the
 * payment mode, otherwise the preferred account for that mode, otherwise none.
 */
export const resolveAccountForEntry = (accounts: Account[], formData: EntryForm) => {
  const requiredType = getAccountTypeForPaymentMode(formData.mode);
  const selectedAccount =
    formData.accountId === null
      ? null
      : (accounts.find((account) => account.id === formData.accountId) ?? null);
  if (selectedAccount && (!requiredType || selectedAccount.type?.toLowerCase() === requiredType)) {
    return selectedAccount;
  }

  const preferredAccount = getPreferredAccountForPaymentMode(accounts, formData.mode);
  if (preferredAccount) {
    return preferredAccount;
  }

  return null;
};

/** What the toast says after a transaction is saved. */
export const saveConfirmationLabel = ({
  subscriptionEnabled,
  recordsRefund,
}: {
  subscriptionEnabled: boolean;
  recordsRefund: boolean;
}) =>
  subscriptionEnabled ? 'Saved with subscription' : recordsRefund ? 'Saved with refund' : 'Saved';

/** A quick prompt, laid over a blank form, ready to review and save. */
export const quickPromptForm = (
  blank: EntryForm,
  prompt: QuickPrompt,
  accounts: Account[],
  now: Date
): EntryForm => ({
  ...blank,
  ...quickPromptToForm(prompt, accounts),
  date: formatDateLabel(now),
  time: formatTime(now) ?? '',
});

/** The starting values of the quick-prompt editor, for a new or an existing prompt. */
export const quickPromptEditorData = (
  editingPrompt: QuickPrompt | null,
  accounts: Account[],
  now: Date
): Partial<EntryForm> => {
  if (!editingPrompt)
    return {
      category: 'Food & Drinks',
      mode: 'Cash',
      type: 'Expense',
      date: formatDateLabel(now),
    };
  return {
    ...quickPromptToForm(editingPrompt, accounts),
    date: formatDateLabel(now),
  };
};
