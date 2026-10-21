import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import type { Account } from '@/lib/accounts';
import {
  applyParsedDraftToForm,
  buildAiReview,
  createDefaultEntryForm,
  creditActionForParseError,
  fallbackDraftNote,
  isBillingInterval,
  quickPromptEditorData,
  quickPromptForm,
  resolveAccountForEntry,
  saveConfirmationLabel,
} from '@/lib/home-capture';
import { ParseApiError, type ParseResponse } from '@/lib/parse';

const draft = (over: Record<string, unknown> = {}) =>
  ({
    title: 'Lunch',
    amount: 250,
    type: 'expense',
    mode: 'UPI',
    category: 'Food & Drinks',
    merchant: 'Cafe',
    tag: 'general',
    date: '2026-10-05',
    time: '13:30',
    note: 'with team',
    source_text: 'lunch 250 upi',
    missing_fields: [],
    ...over,
  }) as unknown as ParseResponse;

const split = (over: Record<string, unknown> = {}) =>
  ({
    splitEnabled: false,
    splitGroupId: null,
    splitGroupName: '',
    splitParticipants: [],
    splitDefaultWarning: undefined,
    ...over,
  }) as never;

const apply = (data: ParseResponse, over: Record<string, unknown> = {}) =>
  applyParsedDraftToForm(createDefaultEntryForm(), data, {
    fallbackText: 'fallback',
    smartSorting: true,
    splitDraft: split(),
    hintedAccount: null,
    ...over,
  } as never);

describe('createDefaultEntryForm', () => {
  it('starts a blank cash expense for today with no account', () => {
    const form = createDefaultEntryForm();
    expect(form).toMatchObject({
      title: '',
      amount: '',
      type: 'Expense',
      mode: 'Cash',
      tag: 'General',
      accountId: null,
      account: '',
      splitEnabled: false,
      subscriptionEnabled: false,
      subscriptionReminderDays: '3',
      refundReminderEnabled: true,
    });
    expect(form.date).toBeTruthy();
  });

  it('returns a fresh object each call', () => {
    expect(createDefaultEntryForm()).not.toBe(createDefaultEntryForm());
  });
});

describe('isBillingInterval', () => {
  it('accepts the known intervals, including market days', () => {
    for (const v of [
      'daily',
      'business_daily',
      'weekly',
      'biweekly',
      'monthly',
      'quarterly',
      'yearly',
    ]) {
      expect(isBillingInterval(v)).toBe(true);
    }
  });
  it('rejects anything else', () => {
    expect(isBillingInterval('hourly')).toBe(false);
    expect(isBillingInterval('')).toBe(false);
    expect(isBillingInterval(null)).toBe(false);
    expect(isBillingInterval(undefined)).toBe(false);
  });
});

describe('fallbackDraftNote', () => {
  it('collapses whitespace', () => {
    expect(fallbackDraftNote('  paid   rent \n today ')).toBe('paid rent today');
  });
  it('truncates long text to 200 characters with an ellipsis', () => {
    const note = fallbackDraftNote('word '.repeat(100));
    expect(note.length).toBe(200);
    expect(note.endsWith('…')).toBe(true);
  });
  it('leaves exactly-200 characters alone', () => {
    expect(fallbackDraftNote('a'.repeat(200))).toBe('a'.repeat(200));
  });
});

describe('applyParsedDraftToForm', () => {
  it('fills the core fields from the draft', () => {
    const form = apply(draft());
    expect(form).toMatchObject({
      title: 'Lunch',
      amount: '250.00',
      type: 'Expense',
      mode: 'UPI',
      category: 'Food & Drinks',
      merchant: 'Cafe',
      tag: 'General',
      notes: 'with team',
    });
  });

  it('blanks fields the parser says are missing', () => {
    const form = apply(draft({ missing_fields: ['title', 'amount', 'type', 'mode', 'category'] }));
    expect(form).toMatchObject({ title: '', amount: '', type: '', mode: '', category: 'Misc' });
  });

  it('with Smart Sorting off keeps only the objective fields', () => {
    const form = apply(draft(), { smartSorting: false });
    expect(form).toMatchObject({
      title: '',
      mode: '',
      category: 'Misc',
      tag: '',
      amount: '250.00',
    });
  });

  it('falls back to the user’s own words when the parser gave no note', () => {
    expect(apply(draft({ note: '  ' })).notes).toBe('lunch 250 upi');
    expect(apply(draft({ note: undefined, source_text: undefined })).notes).toBe('fallback');
  });

  it('uses the hinted account when one matched', () => {
    const form = apply(draft(), { hintedAccount: { id: 9, name: 'HDFC UPI' } as Account });
    expect(form).toMatchObject({ accountId: 9, account: 'HDFC UPI' });
    expect(apply(draft()).accountId).toBeNull();
  });

  it('copies the split draft over', () => {
    const form = apply(draft(), {
      splitDraft: split({ splitEnabled: true, splitGroupId: 4, splitGroupName: 'Goa' }),
    });
    expect(form).toMatchObject({ splitEnabled: true, splitGroupId: 4, splitGroupName: 'Goa' });
  });

  it('carries refund and EMI details as strings', () => {
    const form = apply(
      draft({
        refundable_amount: 100,
        refund_expected_on: '2026-11-01',
        emi_tenure_months: 6,
        emi_rate_pct: 12,
      })
    );
    expect(form).toMatchObject({
      refundableAmount: '100.00',
      refundExpectedOn: '2026-11-01',
      emiTenureMonths: '6',
      emiRatePct: '12',
    });
  });

  it('sets up a subscription when the parser found a candidate', () => {
    const form = apply(
      draft({
        subscription_candidate: {
          name: 'Netflix',
          billing_interval: 'monthly',
          next_due_date: '2026-11-05',
          reminder_days: 5,
          autopay: true,
        },
      })
    );
    expect(form).toMatchObject({
      subscriptionEnabled: true,
      subscriptionName: 'Netflix',
      subscriptionBillingInterval: 'monthly',
      subscriptionNextDueDate: '2026-11-05',
      subscriptionReminderDays: '5',
      subscriptionAutopay: true,
    });
    expect(apply(draft()).subscriptionEnabled).toBe(false);
  });

  it('ignores an unknown subscription interval', () => {
    const form = apply(draft({ subscription_candidate: { billing_interval: 'hourly' } }));
    expect(form.subscriptionBillingInterval).toBe('');
  });

  it('keeps a scanned bill as the attachment, otherwise the previous one', () => {
    expect(apply(draft(), { attachment: 'file://bill.jpg' }).attachment).toBe('file://bill.jpg');
    const prev = { ...createDefaultEntryForm(), attachment: 'file://old.jpg' } as EntryForm;
    const form = applyParsedDraftToForm(prev, draft(), {
      fallbackText: '',
      smartSorting: true,
      splitDraft: split(),
      hintedAccount: null,
    });
    expect(form.attachment).toBe('file://old.jpg');
  });
});

describe('buildAiReview', () => {
  it('carries confidence, the source text and the input source', () => {
    const review = buildAiReview(
      draft({ confidence: { amount: 0.9 }, needs_confirmation: { mode: true } }),
      'fallback',
      'voice',
      split(),
      true
    );
    expect(review).toMatchObject({
      confidence: { amount: 0.9 },
      needsConfirmation: { mode: true },
      sourceText: 'lunch 250 upi',
      inputSource: 'voice',
      smartSortingDisabled: false,
    });
  });

  it('with Smart Sorting off adds the fields the user must now choose', () => {
    const review = buildAiReview(draft({ missing_fields: ['date'] }), 'x', 'text', split(), false);
    expect(review.smartSortingDisabled).toBe(true);
    expect(new Set(review.missingFields)).toEqual(
      new Set(['date', 'title', 'mode', 'category', 'tag'])
    );
  });

  it('appends the split-default warning to the parser’s clarifications', () => {
    const review = buildAiReview(
      draft({ clarifications: ['Which card?'] }),
      'x',
      'text',
      split({ splitDefaultWarning: 'No default split set' }),
      true
    );
    expect(review.clarifications).toEqual(['Which card?', 'No default split set']);
  });

  it('falls back to the supplied text for the source', () => {
    expect(
      buildAiReview(draft({ source_text: undefined }), 'fallback', 'receipt', split(), true)
        .sourceText
    ).toBe('fallback');
  });
});

describe('creditActionForParseError', () => {
  const err = (payload: Record<string, unknown>) => new ParseApiError(payload as never, 402, 'x');
  const ctx = { isGuestUser: false };

  it('returns null for other errors', () => {
    expect(creditActionForParseError(new Error('x'), ctx)).toBeNull();
    expect(creditActionForParseError(err({ error: 'something_else' }), ctx)).toBeNull();
  });

  it('explains low credits to a signed-in user and points at plans', () => {
    const action = creditActionForParseError(
      err({ error: 'insufficient_ai_credits', required_credits: 5, available_credits: 2 }),
      ctx
    );
    expect(action).toEqual({
      title: 'AI credits are low',
      message: 'This capture needs 5 credits. You have 2 available.',
      actionLabel: 'View plans',
      action: 'upgrade',
      reason: 'out_of_credits',
    });
  });

  it('points a guest at sign-in instead, and defaults the numbers', () => {
    const action = creditActionForParseError(err({ error: 'insufficient_ai_credits' }), {
      isGuestUser: true,
    });
    expect(action?.action).toBe('login');
    expect(action?.actionLabel).toBe('Sign in for more credits');
    expect(action?.message).toContain('needs 5 credits and you have 0 left');
  });

  it('reports the daily limit from the error, falling back to the billing figures', () => {
    const fromError = creditActionForParseError(
      err({ error: 'daily_ai_limit_reached', used_today: 8, daily_limit: 10 }),
      { isGuestUser: false, dailyCreditsUsed: 1, dailyLimit: 99 }
    );
    expect(fromError?.message).toBe('You used 8 of 10 credits today.');
    expect(fromError?.reason).toBe('daily_limit');
    const fromBilling = creditActionForParseError(err({ error: 'daily_ai_limit_reached' }), {
      isGuestUser: false,
      dailyCreditsUsed: 3,
      dailyLimit: 12,
    });
    expect(fromBilling?.message).toBe('You used 3 of 12 credits today.');
    const none = creditActionForParseError(err({ error: 'daily_ai_limit_reached' }), ctx);
    expect(none?.message).toBe('You used 0 of 0 credits today.');
  });

  it('words the daily limit for a guest', () => {
    const action = creditActionForParseError(
      err({ error: 'daily_ai_limit_reached', daily_limit: 10 }),
      { isGuestUser: true }
    );
    expect(action?.title).toBe('You have reached your guest AI limit');
    expect(action?.message).toContain('all 10 AI credits');
    expect(action?.action).toBe('login');
  });
});

describe('resolveAccountForEntry', () => {
  const upi = { id: 1, type: 'upi', name: 'GPay', is_default: true } as Account;
  const bank = { id: 2, type: 'bank', name: 'HDFC', is_default: false } as Account;
  const form = (over: Partial<EntryForm>) =>
    ({ ...createDefaultEntryForm(), ...over }) as EntryForm;

  it('keeps the picked account when it suits the payment mode', () => {
    expect(resolveAccountForEntry([upi, bank], form({ mode: 'UPI', accountId: 1 }))).toBe(upi);
  });

  it('falls back to the preferred account for the mode when the pick does not suit it', () => {
    expect(resolveAccountForEntry([upi, bank], form({ mode: 'UPI', accountId: 2 }))).toBe(upi);
  });

  it('uses the preferred account when none was picked', () => {
    expect(resolveAccountForEntry([upi, bank], form({ mode: 'UPI', accountId: null }))).toBe(upi);
  });

  it('is null when nothing fits, and when the picked id is unknown', () => {
    expect(resolveAccountForEntry([bank], form({ mode: 'UPI', accountId: null }))).toBeNull();
    expect(resolveAccountForEntry([], form({ mode: 'Cash', accountId: 99 }))).toBeNull();
  });
});

describe('saveConfirmationLabel', () => {
  it('prefers the subscription wording, then the refund, then plain', () => {
    expect(saveConfirmationLabel({ subscriptionEnabled: true, recordsRefund: true })).toBe(
      'Saved with subscription'
    );
    expect(saveConfirmationLabel({ subscriptionEnabled: false, recordsRefund: true })).toBe(
      'Saved with refund'
    );
    expect(saveConfirmationLabel({ subscriptionEnabled: false, recordsRefund: false })).toBe(
      'Saved'
    );
  });
});

describe('quick prompts', () => {
  const prompt = {
    title: 'Morning Coffee',
    amount: 120,
    mode: 'UPI',
    category: 'Food & Drinks',
    account_id: 4,
    notes: 'Oat milk',
  } as never;
  const accounts = [{ id: 4, name: 'GPay', type: 'upi' }] as never;
  const now = new Date(2026, 9, 7, 9, 5);

  it('seeds the review form from a prompt, over the blank form', () => {
    const blank = createDefaultEntryForm();
    const form = quickPromptForm({ ...blank, splitEnabled: true }, prompt, accounts, now);
    expect(form).toMatchObject({
      title: 'Morning Coffee',
      amount: '120.00',
      mode: 'UPI',
      category: 'Food & Drinks',
      accountId: 4,
      account: 'GPay',
      notes: 'Oat milk',
      splitEnabled: true,
    });
    expect(form.date).toContain('2026');
  });

  it('gives the editor defaults for a new prompt', () => {
    expect(quickPromptEditorData(null, accounts, now)).toMatchObject({
      category: 'Food & Drinks',
      mode: 'Cash',
      type: 'Expense',
    });
  });

  it('fills the editor from an existing prompt, account and all', () => {
    expect(quickPromptEditorData(prompt, accounts, now)).toMatchObject({
      title: 'Morning Coffee',
      amount: '120.00',
      mode: 'UPI',
      type: 'Expense',
      accountId: 4,
      notes: 'Oat milk',
    });
  });
});
