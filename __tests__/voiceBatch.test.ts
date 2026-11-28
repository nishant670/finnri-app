import type { EntryForm } from '@/components/transactions/TransactionFormModal';
import { createDefaultEntryForm } from '@/lib/home-capture';
import type { ParseBatchItem } from '@/lib/parse';
import {
  MAX_ITEMS_PER_PROMPT,
  alreadyLoggedLabel,
  dayItemsFromBatch,
  daySummary,
  dayTrayIsFinished,
  itemCheckLabel,
  itemNeedsAttention,
  mergeDayByPayment,
  mergeDayIntoOne,
  paidWithLabel,
  paymentWays,
  phraseRanges,
  savedToastMessage,
  slotTimesFor,
  tileTimeLabel,
  withChecksCleared,
  type DayItem,
} from '@/lib/voice-batch';

const NOW = new Date(2026, 10, 18, 22, 15);

const form = (overrides: Partial<EntryForm>): EntryForm => ({
  ...createDefaultEntryForm(),
  date: '18 November 2026',
  type: 'Expense',
  mode: 'UPI',
  category: 'Food & Drinks',
  ...overrides,
});

const item = (key: string, overrides: Partial<EntryForm>, extra: Partial<DayItem> = {}): DayItem => ({
  key,
  included: true,
  status: 'ready',
  draft: {} as ParseBatchItem,
  form: form(overrides),
  aiReview: null,
  slot: null,
  carried: false,
  ...extra,
});

const draft = (overrides: Partial<ParseBatchItem>): ParseBatchItem => ({
  stage: 'draft',
  type: 'expense',
  title: 'Item',
  time: null,
  amount: 100,
  currency: 'INR',
  mode: 'UPI',
  card_network: null,
  account_hint: null,
  category: 'Food & Drinks',
  merchant: null,
  tag: null,
  note: null,
  date: '2026-11-18',
  source_text: null,
  ...overrides,
});

describe('speak your day: times (P108)', () => {
  it('maps slots to fixed times, a minute apart, in spoken order', () => {
    const times = slotTimesFor(
      [
        { time_slot: 'morning', time: null, date: '2026-11-18' },
        { time_slot: null, time: null, date: '2026-11-18' },
        { time_slot: 'afternoon', time: null, date: '2026-11-18' },
        { time_slot: 'evening', time: null, date: '2026-11-18' },
        { time_slot: 'night', time: null, date: '2026-11-18' },
      ],
      NOW
    );
    expect(times.map((t) => t.slot)).toEqual(['morning', 'morning', 'afternoon', 'evening', 'night']);
    expect(times.map((t) => t.time)).toEqual([
      { hours: 9, minutes: 0 },
      { hours: 9, minutes: 1 },
      { hours: 14, minutes: 0 },
      { hours: 18, minutes: 30 },
      { hours: 21, minutes: 30 },
    ]);
  });

  it('lets a said clock time win and leaves items before any cue alone', () => {
    const times = slotTimesFor(
      [
        { time_slot: null, time: null, date: null },
        { time_slot: 'evening', time: '19:45', date: null },
      ],
      NOW
    );
    expect(times[0]).toEqual({ slot: null, time: null });
    expect(times[1].time).toEqual({ hours: 19, minutes: 45 });
  });

  it('never puts a time later than now on today', () => {
    const early = new Date(2026, 10, 18, 20, 5);
    const [night] = slotTimesFor([{ time_slot: 'night', time: null, date: '2026-11-18' }], early);
    expect(night.time).toEqual({ hours: 20, minutes: 5 });
    const [yesterday] = slotTimesFor([{ time_slot: 'night', time: null, date: '2026-11-17' }], early);
    expect(yesterday.time).toEqual({ hours: 21, minutes: 30 });
  });
});

describe('speak your day: rows', () => {
  it('builds rows with their slot time and the carried payment (P109)', () => {
    const rows = dayItemsFromBatch(
      {
        source_text: 'breakfast 180 on upi then auto 60',
        items: [
          draft({ title: 'Breakfast', amount: 180, time_slot: 'morning', source_text: 'breakfast 180 on upi' }),
          draft({ title: 'Auto', amount: 60, category: 'Transport', mode_carried: true, source_text: 'auto 60' }),
        ],
      },
      { accounts: [], smartSorting: true, inputSource: 'voice', now: NOW }
    );
    expect(rows).toHaveLength(2);
    expect(tileTimeLabel(rows[0].form)).toBe('9:00 am');
    expect(tileTimeLabel(rows[1].form)).toBe('9:01 am');
    expect(rows[1].slot).toBe('morning');
    expect(rows[1].carried).toBe(true);
    expect(paidWithLabel(rows[1])).toBe('UPI, as above');
    expect(paidWithLabel(rows[0])).toBe('UPI');
  });

  it('never makes more than ten rows (P116)', () => {
    const items = Array.from({ length: 12 }, (_, i) => draft({ title: `Item ${i}` }));
    expect(dayItemsFromBatch({ source_text: 'x', items }, { accounts: [], smartSorting: true, inputSource: 'text' })).toHaveLength(
      MAX_ITEMS_PER_PROMPT
    );
  });

  it('blocks Save on a row with no amount and flags guesses (P113)', () => {
    const noAmount = item('a', { amount: '', title: 'Auto' });
    expect(itemNeedsAttention(noAmount)).toBe("Didn't catch the amount. Tap to add it.");
    const card = item('b', { mode: 'Credit Card', account: '' }, {
      aiReview: { needsConfirmation: { mode: true } },
    });
    expect(itemCheckLabel(card)).toBe('“Card”: which one? Check it');
    const unclear = item('c', { amount: '200', title: 'Market' }, {
      aiReview: { needsConfirmation: { merchant: true } },
    });
    expect(itemCheckLabel(unclear)).toBe("Didn't catch what this was");
    expect(alreadyLoggedLabel({ timeLabel: '9:42 pm' })).toBe('Already logged at 9:42 pm');
  });

  it('drops a "check it" flag once its field was changed in the form, and only then', () => {
    const before = form({ title: 'Lunch', amount: '140', date: '18 November 2026' });
    const flagged = item('d', { title: 'Lunch', amount: '140' }, {
      aiReview: { needsConfirmation: { date: true, category: true } },
      draft: draft({ needs_confirmation: { date: true, category: true } }),
    });
    // Opened and closed with nothing changed: still asks.
    expect(withChecksCleared(flagged, before)).toBe(flagged);
    expect(itemCheckLabel(flagged)).toBe('Date unclear, check it');
    // The date was fixed: that chip goes, the category guess stays.
    const fixed = withChecksCleared({ ...flagged, form: { ...flagged.form, date: '17 November 2026' } }, before);
    expect(fixed.aiReview?.needsConfirmation).toEqual({ date: false, category: true });
    expect(fixed.draft.needs_confirmation).toEqual({ date: false, category: true });
    expect(itemCheckLabel(fixed)).toBe('Category is a guess');
  });

  it('sums money out and in separately', () => {
    const rows = [
      item('a', { title: 'Breakfast', amount: '180' }),
      item('b', { title: 'From Rahul', amount: '500', type: 'Income' }),
      item('c', { title: 'Auto', amount: '60' }, { included: false }),
      item('d', { title: 'Samosa', amount: '' }),
    ];
    expect(daySummary(rows)).toEqual({ toSave: 3, out: 180, in: 500, saved: 0, needingAttention: 1 });
    expect(savedToastMessage(7, 1430, 500)).toBe('7 saved · ₹1,430 out');
  });

  it('is finished once nothing is waiting to save', () => {
    expect(dayTrayIsFinished([item('a', { amount: '10' }, { status: 'saved' })])).toBe(true);
    expect(dayTrayIsFinished([item('a', { amount: '10' })])).toBe(false);
  });

  it('finds each row’s words in the prompt (P107)', () => {
    const text = 'Breakfast at CCD 180 on UPI, then auto 60 and auto 60 back';
    expect(
      phraseRanges(text, [
        { source_text: 'breakfast at CCD 180 on UPI' },
        { source_text: 'auto 60' },
        { source_text: 'auto 60' },
        { source_text: null },
      ])
    ).toEqual([{ start: 0, end: 27 }, { start: 34, end: 41 }, { start: 46, end: 53 }, null]);
  });
});

describe('speak your day: one total (P111)', () => {
  const day = () => [
    item('a', { title: 'Breakfast', amount: '180', time: '9:00 AM' }),
    item('b', { title: 'Lunch', amount: '450', mode: 'Credit Card', account: 'HDFC card', time: '2:00 PM' }),
    item('c', { title: 'Samosa', amount: '40', mode: 'Cash', time: '6:30 PM' }),
    item('d', { title: 'Blinkit', amount: '320', category: 'Groceries', time: '6:31 PM' }),
    item('e', { title: 'Swiggy', amount: '380', time: '9:30 PM' }),
    item('f', { title: 'From Rahul', amount: '500', type: 'Income', category: 'Other', time: '9:31 PM' }),
  ];

  it('folds expenses only, with the payment and category that carried the most', () => {
    const merged = mergeDayIntoOne(day()) as EntryForm;
    expect(merged.title).toBe("Day's spends");
    expect(merged.amount).toBe('1370');
    expect(merged.mode).toBe('UPI');
    expect(merged.category).toBe('Food & Drinks');
    expect(merged.notes.split('\n')).toHaveLength(5);
    expect(merged.notes).toContain('9:00 am Breakfast ₹180 (UPI)');
    expect(merged.notes).not.toContain('Rahul');
    expect(tileTimeLabel(merged)).toBe('9:30 pm');
    expect(merged.splitEnabled).toBe(false);
  });

  it('lists the ways it was paid and folds one per way', () => {
    expect(paymentWays(day())).toEqual([
      { label: 'UPI', total: 880 },
      { label: 'HDFC card', total: 450 },
      { label: 'Cash', total: 40 },
    ]);
    const perWay = mergeDayByPayment(day());
    expect(perWay.map((f) => [f.title, f.amount])).toEqual([
      ["Day's spends · UPI", '880'],
      ["Day's spends · HDFC card", '450'],
      ["Day's spends · Cash", '40'],
    ]);
  });

  it('has nothing to fold when only income is ticked', () => {
    expect(mergeDayIntoOne([item('f', { amount: '500', type: 'Income' })])).toBeNull();
  });
});
